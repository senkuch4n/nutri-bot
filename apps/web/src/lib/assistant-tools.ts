import "server-only";
import { prisma } from "@nutri-bot/db";
import { getLatestFormulaMeasurements, getTenantProfessional, listApprovedPaymentsInRange, type TenantRef } from "@nutri-bot/db/domain";
import {
  activityLevelOption,
  computeAgeYears,
  formatArchivedDate,
  formatDateTime,
  formatPrice,
  normalize,
  nutritionGoalLabel,
  sexLabel,
} from "@nutri-bot/core";

// HU-025 (025b-2 M8): cada herramienta recibe el consultorio del contexto (`t`) y TODAS sus consultas
// llevan `tenantId` (o `patient: { tenantId }` para los hijos clínicos). El asistente manda a DeepSeek
// solo datos de ese consultorio; un id de paciente de otro consultorio da "Paciente no encontrado".

export async function buscarPaciente(t: TenantRef, query: string) {
  const q = query.trim();
  if (!q) return { error: "Falta el término de búsqueda" };
  const n = normalize(q);
  const digits = q.replace(/\D/g, "");
  const patients = await prisma.patient.findMany({ where: { tenantId: t.tenantId }, take: 300 });
  const matches = patients.filter(
    (p) => normalize(p.name ?? "").includes(n) || (digits.length > 0 && p.phone.includes(digits)),
  );
  // HU-019 (D11): el asistente ve también a las archivadas, marcadas.
  return matches
    .slice(0, 10)
    .map((p) => ({ id: p.id, nombre: p.name, telefono: p.phone, archivada: p.archivedAt !== null }));
}

export async function resumenPaciente(t: TenantRef, patientId: string) {
  const { tenantId } = t;
  // Primero el paciente del consultorio: con un id ajeno no se lee nada más.
  const patient = await prisma.patient.findUnique({ where: { id_tenantId: { id: patientId, tenantId } } });
  if (!patient) return { error: "Paciente no encontrado" };
  const ownPatient = { patientId, patient: { tenantId } };
  const [pro, record, lastEntry, m, plansCount, activePlan, nextAppt] = await Promise.all([
    getTenantProfessional(tenantId),
    prisma.clinicalRecord.findUnique({ where: ownPatient }),
    prisma.evolutionEntry.findFirst({ where: ownPatient, orderBy: { recordedAt: "desc" } }),
    getLatestFormulaMeasurements(t, patientId),
    prisma.nutritionPlan.count({ where: { patientId, tenantId } }),
    prisma.nutritionPlan.findFirst({ where: { patientId, tenantId, status: "ACTIVE" } }),
    prisma.appointment.findFirst({
      where: { patientId, tenantId, status: "CONFIRMED", startsAt: { gte: new Date() } },
      include: { service: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const act = activityLevelOption(patient.activityLevel);
  return {
    nombre: patient.name,
    telefono: patient.phone,
    // HU-019 (D11): "dd/MM/yyyy" si está archivada; null si está activa.
    archivada_el: patient.archivedAt ? formatArchivedDate(patient.archivedAt, pro.timezone) : null,
    antecedentes: record?.background ?? null,
    objetivos: record?.goals ?? null,
    sexo: sexLabel(patient.sex),
    edad_anios: patient.birthDate
      ? computeAgeYears(patient.birthDate, new Date(), pro.timezone)
      : null,
    actividad_fisica: act ? `${act.label}: ${act.description}` : null,
    factor_actividad: act?.factor ?? null,
    objetivo_nutricional: nutritionGoalLabel(patient.nutritionGoal),
    ultimo_peso_kg: m.weightKg?.value ?? null,
    fecha_ultimo_registro: lastEntry ? formatDateTime(lastEntry.recordedAt, pro.timezone) : null,
    plan_activo: activePlan?.title ?? null,
    cantidad_planes: plansCount,
    proximo_turno: nextAppt
      ? `${nextAppt.service.name} el ${formatDateTime(nextAppt.startsAt, pro.timezone)}`
      : null,
  };
}

export async function turnosAgenda(t: TenantRef, desdeISO: string, hastaISO: string) {
  const desde = new Date(desdeISO);
  const hasta = new Date(hastaISO);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { error: "Fechas inválidas, usá formato ISO 8601" };
  }
  const [pro, appts] = await Promise.all([
    getTenantProfessional(t.tenantId),
    prisma.appointment.findMany({
      where: {
        tenantId: t.tenantId,
        startsAt: { gte: desde, lte: hasta },
        status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      },
      include: { patient: true, service: true },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);
  return appts.map((a) => ({
    paciente: a.patient.name ?? a.patient.phone,
    servicio: a.service.name,
    fecha: formatDateTime(a.startsAt, pro.timezone),
    estado: a.status,
  }));
}

export async function resumenFacturacion(t: TenantRef, desdeISO: string, hastaISO: string) {
  const desde = new Date(desdeISO);
  const hasta = new Date(hastaISO);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return { error: "Fechas inválidas, usá formato ISO 8601" };
  }
  const [pro, payments] = await Promise.all([
    getTenantProfessional(t.tenantId),
    listApprovedPaymentsInRange(t, desde, hasta),
  ]);
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return { total: formatPrice(total, pro.currency), cantidad_pagos: payments.length };
}
