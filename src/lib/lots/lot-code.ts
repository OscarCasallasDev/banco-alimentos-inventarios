/**
 * Códigos de lote — Sistema de Gestión de Inventarios
 *
 * Formato: L-{PREFIJO_PRODUCTO}-{AAAAMMDD}-{NNNN}
 * Ejemplo: L-ARR-20261027-0001
 *
 * El código generado es interno, único e inmutable.
 * El código del proveedor se guarda aparte en `external_code`.
 *
 * Reglas de unicidad:
 *   • El consecutivo se reserva de forma atómica en `lot_sequences`
 *     (upsert). NUNCA se calcula con MAX()+1.
 *   • El ámbito del consecutivo es el prefijo y la fecha, de modo que dos
 *     productos con prefijos equivalentes nunca generan el mismo código.
 *   • La base de datos impone `UNIQUE (code)`: es la garantía final.
 *   • El código NO depende de la cantidad ni del vencimiento: sigue siendo
 *     válido aunque el lote se consuma por completo o se corrija su fecha.
 *   • La fecha de vencimiento se muestra aparte (etiqueta), porque puede ser
 *     desconocida o corregirse sin que el lote pierda su identidad.
 */

const PREFIX_MAX_LENGTH = 12;

/** Limpia el código de producto para usarlo como prefijo legible. */
export function lotPrefix(productCode: string): string {
  const normalized = productCode
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return (normalized || "PRODUCTO").slice(0, PREFIX_MAX_LENGTH);
}

/** Fecha compacta usada en el código. */
export function lotDatePart(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

/** Construye el código a partir de una secuencia ya reservada. */
export function formatLotCode(
  productCode: string,
  isoDate: string,
  sequence: number
): string {
  return `L-${lotPrefix(productCode)}-${lotDatePart(isoDate)}-${String(
    sequence
  ).padStart(4, "0")}`;
}

/**
 * Etiqueta legible para la interfaz y los comprobantes.
 * Incluye el vencimiento cuando se conoce, sin alterar el código.
 */
export function formatLotLabel(input: {
  code: string;
  expirationDate?: string | null;
}): string {
  if (!input.expirationDate) return input.code;

  const [year, month, day] = input.expirationDate.slice(0, 10).split("-");
  if (!year || !month || !day) return input.code;

  return `${input.code} · Vence ${day}/${month}/${year}`;
}

/**
 * Ámbito del consecutivo: un contador por prefijo y día.
 *
 * El prefijo (no el UUID) es lo que aparece en el código; usar el prefijo
 * como ámbito evita que dos productos con prefijos equivalentes generen el
 * mismo código el mismo día.
 */
export function lotSequenceScope(productCode: string, isoDate: string): string {
  return `LOT:${lotPrefix(productCode)}:${isoDate.slice(0, 10)}`;
}
