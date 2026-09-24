import { ISAK_MEASURE_KEYS, ISAK_TEXT, dayKeyInTz, dayKeyToNoonUtc, type IsakMeasures } from "@nutri-bot/core";
import { Prisma, prisma, type EvolutionEntry } from "../index";
import { getProfessional } from "./availability";

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

/** El estudio de la consulta, o null. */
export function getIsakStudy(consultationId: string): Promise<EvolutionEntry | null> {
  return prisma.evolutionEntry.findFirst({ where: { consultationId, study: "ISAK" } });
}

/** Alta. Misma fecha que addEvolutionEntryToConsultation (mediodía del día de la consulta en la
 *  zona de la profesional), patientId de la consulta, study "ISAK", las 21 medidas (null donde no
 *  hay), note null. Si Prisma tira P2002 (el @@unique) → IsakStudyExistsError. */
export async function createIsakStudy(params: {
  consultationId: string;
  measures: IsakMeasures;
}): Promise<EvolutionEntry> {
  const pro = await getProfessional();
  const consultation = await prisma.consultation.findUniqueOrThrow({
    where: { id: params.consultationId },
    select: { id: true, patientId: true, consultedAt: true },
  });
  try {
    return await prisma.evolutionEntry.create({
      data: {
        ...measuresData(params.measures),
        patientId: consultation.patientId,
        recordedAt: dayKeyToNoonUtc(dayKeyInTz(consultation.consultedAt, pro.timezone), pro.timezone),
        consultationId: consultation.id,
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
export async function updateIsakStudy(params: {
  consultationId: string;
  entryId: string;
  measures: IsakMeasures;
}): Promise<void> {
  const { count } = await prisma.evolutionEntry.updateMany({
    where: { id: params.entryId, consultationId: params.consultationId, study: "ISAK" },
    data: measuresData(params.measures),
  });
  if (count === 0) throw new IsakStudyNotFoundError();
}

/** Borrado: solo la fila ISAK de esa consulta. Nunca borra otra medición. count 0 →
 *  IsakStudyNotFoundError. */
export async function deleteIsakStudy(params: { consultationId: string; entryId: string }): Promise<void> {
  const { count } = await prisma.evolutionEntry.deleteMany({
    where: { id: params.entryId, consultationId: params.consultationId, study: "ISAK" },
  });
  if (count === 0) throw new IsakStudyNotFoundError();
}

/** D15: el último estudio ISAK del paciente en una consulta con consultedAt < `before`. */
export function getPreviousIsakStudy(params: {
  patientId: string;
  before: Date;
}): Promise<(EvolutionEntry & { consultation: { id: string; consultedAt: Date } | null }) | null> {
  return prisma.evolutionEntry.findFirst({
    where: { patientId: params.patientId, study: "ISAK", consultation: { consultedAt: { lt: params.before } } },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { createdAt: "desc" }],
    include: { consultation: { select: { id: true, consultedAt: true } } },
  });
}
