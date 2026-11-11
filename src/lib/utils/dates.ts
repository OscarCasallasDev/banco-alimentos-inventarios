/**
 * Fechas del Banco — Sistema de Gestión, Trazabilidad y Conciliación
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Todas las fechas del sistema se manejan como `YYYY-MM-DD` (sin hora) y se
 * comparan contra la fecha local de Colombia (America/Bogota, UTC-5).
 *
 * Reglas que este módulo Concentra:
 *   • Una fecha sin hora NUNCA pasa por `new Date("YYYY-MM-DD")`: JavaScript
 *     la interpreta como UTC y en Colombia mostraría el día anterior.
 *   • La fecha de hoy se calcula con la zona horaria del Banco, no con la
 *     del servidor (Vercel corre en UTC).
 *   • Las sumas de días se hacen con `Date.UTC` para no cruzar husos.
 */

export const BANK_TIME_ZONE = "America/Bogota";

/**
 * Formatea una fecha a formato legible en español.
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Formatea una fecha y hora a formato legible en español.
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Formatea una fecha SIN hora (columna `date` de PostgreSQL).
 *
 * Importante: una fecha sin hora no debe pasar por `new Date()`, porque
 * JavaScript la interpreta como UTC y en Colombia (UTC-5) mostraría el día
 * anterior. Ej: "2026-10-20" → "20/10/2026".
 */
export function formatDateOnly(date: string | Date | null | undefined): string {
  if (!date) return "—";

  const value =
    typeof date === "string"
      ? date.slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return String(value);

  return `${day}/${month}/${year}`;
}

/**
 * Devuelve la fecha local de hoy como `YYYY-MM-DD`.
 *
 * No usar `toISOString()`: en Colombia (UTC-5) después de las 19:00 devuelve
 * el día siguiente, lo que haría que un documento quedara fechado mañana.
 */
export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Fecha de hoy en la zona horaria del Banco, incluso si el servidor corre en UTC.
 */
export function bankTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Suma días a una fecha `YYYY-MM-DD` sin pasar por UTC.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = toIsoDate(isoDate).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Diferencia en días calendario entre dos fechas `YYYY-MM-DD`.
 * Positivo cuando `toIso` es posterior a `fromIso`.
 */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = Date.parse(`${toIsoDate(fromIso)}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate(toIso)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Normaliza la fecha de un documento al formato `YYYY-MM-DD` que usa la
 * columna `date` de PostgreSQL.
 *
 * Se evita `new Date(...).toISOString()` porque convierte a UTC y puede
 * desplazar el día según la zona horaria del equipo.
 */
export function toIsoDate(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (match) return match[0];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return todayIsoDate();
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Devuelve la fecha de un documento como `Date` a medianoche local.
 * Se usa para numerar documentos (el año del consecutivo).
 */
export function parseDocumentDate(value: string): Date {
  const [year, month, day] = toIsoDate(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Valida que un texto tenga forma de fecha `YYYY-MM-DD` y que corresponda
 * a una fecha real del calendario.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
