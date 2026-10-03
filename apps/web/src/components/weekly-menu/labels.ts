// HU-018b (SDD 7.4 y 7.6): textos del editor semanal que dependen del nombre de la comida o de los
// días. Puro, sin React.
import { WEEKDAY_LABELS, joinWeekdaysEs, type Weekday } from "@nutri-bot/core";

/** Nombre visible de un ítem (alimento, descripción libre o un marcador). */
export function itemLabel(item: { foodName: string | null; customLabel: string | null }): string {
  return item.foodName ?? item.customLabel ?? "(sin descripción)";
}

/** "Desayuno" → "desayuno" (en medio de una frase). */
export function lowerMealName(name: string): string {
  return name.toLocaleLowerCase("es-AR");
}

/**
 * Aviso al pasar a "Igual todos los días": "Se van a borrar los desayunos de los otros días." El plural
 * agrega "s" si el nombre no termina en "s" (Colaciones queda igual). El artículo concuerda con el
 * nombre: "las meriendas", "las cenas", "las colaciones" (terminadas en -a/-as/-ión/-iones). Con
 * nombres libres de más de una palabra el plural queda raro, así que se usa el texto genérico.
 */
export function deleteOtherDaysWarning(mealName: string): string {
  const lower = lowerMealName(mealName.trim());
  if (!lower || /\s/.test(lower)) return "Se van a borrar los ítems de los otros días.";
  const plural = lower.endsWith("s") ? lower : lower.endsWith("ión") ? `${lower.slice(0, -3)}iones` : `${lower}s`;
  const article = /(as|iones)$/.test(plural) ? "las" : "los";
  return `Se van a borrar ${article} ${plural} de los otros días.`;
}

/** "Lunes copiado a martes y miércoles" · "Lunes copiado al jueves". */
export function copiedDayMessage(from: Weekday, to: readonly Weekday[]): string {
  const target = to.length === 1 ? `al ${WEEKDAY_LABELS[to[0]!].lower}` : `a ${joinWeekdaysEs(to)}`;
  return `${WEEKDAY_LABELS[from].long} copiado ${target}`;
}

/** "Martes y miércoles ya tienen comidas. Se van a reemplazar." (null si no hay ninguno). */
export function replaceDaysWarning(days: readonly Weekday[], what = "comidas"): string | null {
  if (days.length === 0) return null;
  const list = joinWeekdaysEs(days);
  const subject = list.charAt(0).toLocaleUpperCase("es-AR") + list.slice(1);
  return `${subject} ${days.length === 1 ? "ya tiene" : "ya tienen"} ${what}. Se van a reemplazar.`;
}

/** Género y número aproximados de un nombre de comida ("merienda" f., "colaciones" f. pl.). */
function genderNumber(name: string): { feminine: boolean; plural: boolean } {
  const lower = lowerMealName(name.trim());
  const plural = lower.endsWith("s");
  const feminine = /(a|as|ión|iones)$/.test(lower);
  return { feminine, plural };
}

/** "el desayuno", "la merienda", "las colaciones" (en minúscula, para el medio de una frase). */
export function withArticle(mealName: string): string {
  const { feminine, plural } = genderNumber(mealName);
  const article = feminine ? (plural ? "las" : "la") : plural ? "los" : "el";
  return `${article} ${lowerMealName(mealName.trim())}`;
}

/** Concuerda un participio con la comida: "repetido" → "repetida" (Merienda), "repetidas" (Colaciones). */
export function agreeWithMeal(mealName: string, participle: string): string {
  const { feminine, plural } = genderNumber(mealName);
  const base = participle.replace(/o$/, feminine ? "a" : "o");
  return plural ? `${base}s` : base;
}
