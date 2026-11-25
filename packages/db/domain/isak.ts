import { ISAK_MEASURE_KEYS, ISAK_TEXT, dayKeyInTz, dayKeyToNoonUtc, type IsakMeasures } from "@nutri-bot/core";
import { Prisma, prisma, type EvolutionEntry } from "../index";
import { resolveTenantSchedulingContext, type TenantRef } from "./tenantScope";

/**
 * HU-006: el estudio antropométrico ISAK de una consulta. Es una fila de EvolutionEntry con
 * study = ISAK (D1); como máximo una por consulta (@@unique([consultationId, study])).
 * Nada calculado se guarda (D18): lo calcula packages/core al vuelo.
 */

export class IsakStudyExistsError extends Error {
  constructor() {
    super(ISAK_TEXT.alreadyExists);
    this.name = "IsakStudyExistsError";
  }
}

export class IsakStudyNotFoundError extends Error {
  constructor() {
    super("El estudio ISAK no existe");
    this.name = "IsakStudyNotFoundError";
  }
}

const toNumber = (value: Prisma.Decimal | null): number | null => (value === null ? null : Number(value));

/** Decimal → number de las 21 columnas ISAK de una fila. */
export function toIsakMeasures(entry: EvolutionEntry): IsakMeasures {
  const out = {} as IsakMeasures;
  for (const key of ISAK_MEASURE_KEYS) out[key] = toNumber(entry[key]);
  return out;
}

/** Las 21 columnas para escribir (null donde no hay). */
function measuresData(measures: IsakMeasures): IsakMeasures {
  const out = {} as IsakMeasures;
  for (const key of ISAK_MEASURE_KEYS) out[key] = measures[key] ?? null;
  return out;
}

/** HU-025: fila ISAK del consultorio (tenant de la fila y del paciente). */
function ownedIsakWhere(tenantId: string) {
  return { study: "ISAK" as const, tenantId, patient: { tenantId } };
}

/** El estudio de la consulta, o null (también si la consulta es de otro consultorio). */
export function getIsakStudy(t: TenantRef, consultationId: string): Promise<EvolutionEntry | null> {
  return prisma.evolutionEntry.findFirst({
    where: { consultationId, ...ownedIsakWhere(t.tenantId), consultation: { tenantId: t.tenantId } },
  });
}

/** Alta. Misma fecha que addEvolutionEntryToConsultation (mediodía del día de la consulta en la
 *  zona de la profesional), patientId de la consulta, study "ISAK", las 21 medidas (null donde no
 *  hay), note null. Si Prisma tira P2002 (el @@unique) → IsakStudyExistsError. */
export async function createIsakStudy(t: TenantRef, params: {
  consultationId: string;
  measures: IsakMeasures;
}): Promise<EvolutionEntry> {
  const { scope: { tenantId }, professional: { timezone } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const where = { id_tenantId: { id: params.consultationId, tenantId } };
  const { patientId, consultedAt } = await prisma.consultation.findUniqueOrThrow({
    where,
    select: { patientId: true, consultedAt: true },
  });
  try {
    return await prisma.evolutionEntry.create({
      data: {
        ...measuresData(params.measures),
        patient: { connect: { id: patientId } },
        // Set both ownership columns through the composite patient FK.
        tenantPatient: { connect: { id_tenantId: { id: patientId, tenantId } } },
        recordedAt: dayKeyToNoonUtc(dayKeyInTz(consultedAt, timezone), timezone),
        consultation: { connect: { ...where, patientId } },
        study: "ISAK",
        note: null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new IsakStudyExistsError();
    }
    throw error;
  }
}

/** Edición (D17): solo la fila ISAK de esa consulta. Las vacías pasan a null. No toca recordedAt
 *  ni note. count 0 → IsakStudyNotFoundError. */
export async function updateIsakStudy(t: TenantRef, params: {
  consultationId: string;
  entryId: string;
  measures: IsakMeasures;
}): Promise<void> {
  const { count } = await prisma.evolutionEntry.updateMany({
    where: { id: params.entryId, consultationId: params.consultationId, ...ownedIsakWhere(t.tenantId) },
    data: measuresData(params.measures),
  });
  if (count === 0) throw new IsakStudyNotFoundError();
}

/** Borrado: solo la fila ISAK de esa consulta. Nunca borra otra medición. count 0 →
 *  IsakStudyNotFoundError. */
export async function deleteIsakStudy(t: TenantRef, params: { consultationId: string; entryId: string }): Promise<void> {
  const { count } = await prisma.evolutionEntry.deleteMany({
    where: { id: params.entryId, consultationId: params.consultationId, ...ownedIsakWhere(t.tenantId) },
  });
  if (count === 0) throw new IsakStudyNotFoundError();
}

/** D15: el último estudio ISAK del paciente en una consulta con consultedAt < `before`. */
export function getPreviousIsakStudy(t: TenantRef, params: {
  patientId: string;
  before: Date;
}): Promise<(EvolutionEntry & { consultation: { id: string; consultedAt: Date } | null }) | null> {
  return prisma.evolutionEntry.findFirst({
    where: {
      patientId: params.patientId,
      ...ownedIsakWhere(t.tenantId),
      consultation: { tenantId: t.tenantId, consultedAt: { lt: params.before } },
    },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { createdAt: "desc" }],
    include: { consultation: { select: { id: true, consultedAt: true } } },
  });
}
