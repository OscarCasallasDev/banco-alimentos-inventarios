/**
 * Numeración de documentos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Formato único para todos los documentos del flujo:
 *   `PREFIJO-AÑO-CONSECUTIVO`  (ej. ENT-2026-0001, PED-2026-0001)
 */

export const DOCUMENT_PREFIX = {
  ENTRY: "ENT",
  ORDER: "PED",
  INVOICE: "FAC",
  RECEIPT: "REC",
  DISPATCH: "DES",
} as const;

export type DocumentPrefix =
  (typeof DOCUMENT_PREFIX)[keyof typeof DOCUMENT_PREFIX];

/**
 * Construye el número de documento a partir del prefijo, la fecha y el
 * consecutivo. Ej: `ENT-2026-0007`.
 */
export function formatDocumentNumber(
  prefix: DocumentPrefix,
  date: Date,
  sequence: number
): string {
  return `${prefix}-${date.getFullYear()}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Extrae el año de un número de documento (`ENT-2026-0001` → `2026`).
 */
export function getDocumentYear(number: string): number | null {
  const match = /-(\d{4})-\d+$/.exec(number);
  if (!match) return null;
  return Number(match[1]);
}
