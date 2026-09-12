import "server-only";
import { prisma } from "@nutri-bot/db";
import { listApprovedPaymentsInRange } from "@nutri-bot/db/domain";
import { normalize, formatDateTime, formatPrice } from "@nutri-bot/core";
import { getProfessional } from "./professional";

export async function buscarPaciente(query: string) {
  const q = query.trim();
  if (!q) return { error: "Falta el término de búsqueda" };
  const n = normalize(q);
  const digits = q.replace(/\D/g, "");
  const patients = await prisma.patient.findMany({ take: 300 });
  const matches = patients.filter(
    (p) => normalize(p.name ?? "").includes(n) || (digits.length > 0 && p.phone.includes(digits)),
  );
  return matches.slice(0, 10).map((p) => ({ id: p.id, nombre: p.name, telefono: p.phone }));
}

export async function resumenPaciente(patientId: string) {
  const pro = await getProfessional();
  const [patient, record, lastEntry, lastWeightEntry, plansCount, activePlan, nextAppt] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.clinicalRecord.findUnique({ where: { patientId } }),
    prisma.evolutionEntry.findFirst({ where: { patientId }, orderBy: { recordedAt: "desc" } }),
    prisma.evolutionEntry.findFirst({
      where: { patientId, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.nutritionPlan.count({ where: { patientId } }),
    prisma.nutritionPlan.findFirst({ where: { patientId, status: "ACTIVE" } }),
    prisma.appointment.findFirst({
      where: { patientId, status: "CONFIRMED", startsAt: { gte: new Date() } },
      include: { service: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  if (!patient) return { error: "Paciente no encontrado" };

  return {
    nombre: patient.name,
    telefono: patient.phone,
    antecedentes: record?.background ?? null,
    objetivos: record?.goals ?? null,
    ultimo_peso_kg: lastWeightEntry?.weightKg ? Number(lastWeightEntry.weightKg) : null,
    fecha_ultimo_registro: lastEntry ? formatDateTime(lastEntry.recordedAt, pro.timezone) : null,
    plan_activo: activePlan?.title ?? null,
    cantidad_planes: plansCount,
    proximo_turno: nextAppt
      ? `${nextAppt.service.name} el ${formatDateTime(nextAppt.startsAt, pro.timezone)}`
      : null,
  };
}

export async function turnosAgenda(desdeISO: string, hastaISO: string) {
  const pro = await getProfessional();
  const desde = new Date(desdeISO);
  const hasta = new Date(hastaISO);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { error: "Fechas inválidas, usá formato ISO 8601" };
  }
  const appts = await prisma.appointment.findMany({
    where: { startsAt: { gte: desde, lte: hasta }, status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] } },
    include: { patient: true, service: true },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  return appts.map((a) => ({
    paciente: a.patient.name ?? a.patient.phone,
    servicio: a.service.name,
    fecha: formatDateTime(a.startsAt, pro.timezone),
    estado: a.status,
  }));
}

export async function resumenFacturacion(desdeISO: string, hastaISO: string) {
  const pro = await getProfessional();
  const desde = new Date(desdeISO);
  const hasta = new Date(hastaISO);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { error: "Fechas inválidas, usá formato ISO 8601" };
  }
  const payments = await listApprovedPaymentsInRange(desde, hasta);
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return { total: formatPrice(total, pro.currency), cantidad_pagos: payments.length };
}
