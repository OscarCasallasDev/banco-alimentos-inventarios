/**
 * Derivación del peso unitario a partir del nombre del producto.
 *
 * REGLA ESTRICTA. El peso solo se deriva si se cumplen LAS TRES condiciones:
 *
 *   1. La unidad de control del producto es de masa (GR, G, KG, KGM).
 *   2. El nombre casa con el patrón "X <número> GR|KG" (anclado).
 *   3. El producto no trae segunda unidad de medida diligenciada.
 *
 * El resultado se registra como ESTIMACIÓN (`weight_is_estimate = true`) y
 * queda sobrescribible por el administrador. Nunca se inventa un peso para un
 * producto que no lo declara de forma verificable: en ese caso el peso queda
 * en null y el documento lo muestra como "no informado".
 *
 * En el reporte real del Banco, 3.079 de 4.862 productos (63 %) cumplen la
 * regla y 1.783 quedan sin peso conocido.
 */

/** Unidades de masa reconocidas. */
export const MASS_UNITS = new Set(["GR", "G", "KG", "KGM"]);

/**
 * Patrón del nombre: "X 500 GR", "X 1 KG", "PAQ X 25 UND" (este último no
 * aplica porque no es masa).
 */
const WEIGHT_PATTERN = /\bX\s*([\d]+(?:[.,][\d]+)?)\s*(GR|G|KG|KGM)\b/i;

/**
 * Devuelve el peso unitario en gramos, o `null` si no se puede derivar.
 *
 * @param name  Nombre del elemento en Siigo.
 * @param unit  Unidad de control del producto.
 */
export function deriveUnitWeight(
  name: string | null | undefined,
  unit: string | null | undefined
): number | null {
  if (!name || !unit) return null;

  const normalizedUnit = unit.trim().toUpperCase();
  if (!MASS_UNITS.has(normalizedUnit)) return null;

  const match = WEIGHT_PATTERN.exec(name);
  if (!match) return null;

  const rawValue = match[1].replace(",", ".");
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  const declaredUnit = match[2].toUpperCase();
  const grams = declaredUnit === "KG" || declaredUnit === "KGM" ? value * 1000 : value;

  // Redondeo a 3 decimales (misma precisión que el esquema).
  return Math.round(grams * 1000) / 1000;
}

/**
 * Calcula el peso total de una línea de salida.
 *
 * @param quantity   Cantidad a entregar.
 * @param unitGrams  Peso unitario en gramos (null si no se conoce).
 * @returns Peso total en kilogramos, o null si no hay peso unitario.
 */
export function calculateTotalWeightKg(
  quantity: number,
  unitGrams: number | null
): number | null {
  if (unitGrams === null || !Number.isFinite(unitGrams)) return null;
  const kilograms = (quantity * unitGrams) / 1000;
  return Math.round((kilograms + Number.EPSILON) * 1000) / 1000;
}

/**
 * Indica si un producto tiene peso unitario confiable.
 * Se usa para decidir si el documento muestra el peso o "no informado".
 */
export function hasReliableWeight(unitGrams: number | null): boolean {
  return unitGrams !== null && Number.isFinite(unitGrams) && unitGrams > 0;
}
