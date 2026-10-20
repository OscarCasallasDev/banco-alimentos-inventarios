import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS con Tailwind merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha a formato legible en español
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Formatea una fecha y hora a formato legible en español
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
    return new Date().toISOString().slice(0, 10);
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
 * Formatea un número con separador de miles
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("es-CO").format(num);
}

/**
 * Genera un UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Valida si un string es un UUID válido
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Trunca un string a una longitud máxima
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Capitaliza la primera letra de cada palabra
 */
export function capitalize(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}
