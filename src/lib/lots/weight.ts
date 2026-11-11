/**
 * Cálculo de peso y volumen — Sistema de Gestión, Trazabilidad y Conciliación
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Este módulo es la ÚNICA fuente de cálculo de peso del proyecto. Lo usan
 * los servicios (backend), la API y la interfaz, de modo que un kilo se
 * calcule siempre igual en todas partes.
 *
 * Reglas de negocio:
 *   1. El contenido neto del producto (`netWeightGrams` / `netVolumeMl`) se
 *      expresa por UNA unidad de stock. 300 bolsas de 500 g son 150 kg.
 *   2. Si no hay contenido neto conocido, el peso NO se calcula: se devuelve
 *      `null`. Nunca se inventa un valor ni se reporta 0 kg como si fuera real.
 *   3. Las cantidades se expresan en la unidad de stock del producto. No se
 *      suman unidades de naturaleza distinta (conteo, masa y volumen).
 *   4. Toda la aritmética se hace con enteros escalados para evitar los
 *      errores de coma flotante de IEEE-754.
 */

/** Gramos por kilogramo. */
export const GRAMS_PER_KILOGRAM = 1000;

/** Mililitros por litro. */
export const MILLILITERS_PER_LITER = 1000;

/** Gramos por libra. */
export const GRAMS_PER_POUND = 453.59237;

/** Decimales con los que se manejan las cantidades. */
export const QUANTITY_DECIMALS = 3;

/**
 * Naturaleza de la unidad de stock. Determina si las cantidades son
 * comparables entre sí.
 */
export type UnitKind = "COUNT" | "MASS" | "VOLUME" | "UNKNOWN";

/**
 * Redondea a la precisión de cantidades del sistema (3 decimales).
 */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

/**
 * Redondea a la precisión de pesos (3 decimales).
 */
export function roundWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

/**
 * Multiplica dos decimales de 3 cifras sin perder precisión.
 *
 * Escala ambos operandos a enteros, multiplica (exacto en coma flotante
 * mientras el producto quepa en 2^53) y vuelve a escalar.
 */
export function multiplyExact(a: number, b: number): number {
  const scale = 10 ** QUANTITY_DECIMALS;
  const left = Math.round(a * scale);
  const right = Math.round(b * scale);
  return (left * right) / (scale * scale);
}

/**
 * Convierte gramos a kilogramos con 3 decimales.
 */
export function gramsToKilograms(grams: number): number {
  return roundWeight(grams / GRAMS_PER_KILOGRAM);
}

/**
 * Convierte mililitros a litros con 3 decimales.
 */
export function millilitersToLiters(milliliters: number): number {
  return roundWeight(milliliters / MILLILITERS_PER_LITER);
}

/**
 * Peso en kilogramos de una cantidad de unidades de stock.
 *
 * @returns El peso en kg, o `null` cuando el contenido neto no es conocido.
 */
export function computeWeightKg(
  quantity: number,
  netWeightGrams: number | null | undefined
): number | null {
  if (netWeightGrams === null || netWeightGrams === undefined) return null;
  if (!Number.isFinite(netWeightGrams) || netWeightGrams <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const grams = multiplyExact(quantity, netWeightGrams);
  return gramsToKilograms(grams);
}

/**
 * Volumen en litros de una cantidad de unidades de stock.
 *
 * @returns El volumen en L, o `null` cuando el contenido neto no es conocido.
 */
export function computeVolumeL(
  quantity: number,
  netVolumeMl: number | null | undefined
): number | null {
  if (netVolumeMl === null || netVolumeMl === undefined) return null;
  if (!Number.isFinite(netVolumeMl) || netVolumeMl <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const milliliters = multiplyExact(quantity, netVolumeMl);
  return millilitersToLiters(milliliters);
}

/**
 * Peso total recibido de un lote, en kilogramos.
 */
export function lotReceivedWeightKg(lot: {
  quantityReceived: number;
  netWeightGrams: number | null;
}): number | null {
  return computeWeightKg(lot.quantityReceived, lot.netWeightGrams);
}

/**
 * Peso disponible de un lote, en kilogramos.
 */
export function lotAvailableWeightKg(lot: {
  quantityAvailable: number;
  netWeightGrams: number | null;
}): number | null {
  return computeWeightKg(lot.quantityAvailable, lot.netWeightGrams);
}

/**
 * Agrupa cantidades por naturaleza de unidad.
 *
 * Devuelve un mapa `unitKind -> { quantity, lots }` para poder informar
 * "unidades de conteo", "kilogramos manejados" y "litros manejados" por
 * separado, sin sumar magnitudes incompatibles.
 */
export interface UnitKindTotals {
  quantity: number;
  lots: number;
}

export function groupQuantityByUnitKind(
  rows: { quantity: number; unitKind: UnitKind }[]
): Record<UnitKind, UnitKindTotals> {
  const totals: Record<UnitKind, UnitKindTotals> = {
    COUNT: { quantity: 0, lots: 0 },
    MASS: { quantity: 0, lots: 0 },
    VOLUME: { quantity: 0, lots: 0 },
    UNKNOWN: { quantity: 0, lots: 0 },
  };

  for (const row of rows) {
    const bucket = totals[row.unitKind] ?? totals.UNKNOWN;
    bucket.quantity = roundQuantity(bucket.quantity + Number(row.quantity || 0));
    bucket.lots += 1;
  }

  return totals;
}

/**
 * Cobertura del indicador de peso.
 *
 * Explica qué parte de la mercancía se pudo pesar. Sin esto, un total de
 * peso parcial se presenta como si fuera el peso real del inventario.
 */
export interface WeightCoverage {
  /** Lotes con contenido neto conocido. */
  lotsWithWeight: number;
  /** Lotes activos sin contenido neto conocido. */
  lotsWithoutWeight: number;
  /** Porcentaje de lotes con peso conocido (0–100). */
  coveragePercent: number;
  /** Peso total conocido en kg. */
  knownWeightKg: number;
}

export function computeWeightCoverage(input: {
  lotsWithWeight: number;
  lotsWithoutWeight: number;
  knownWeightKg: number;
}): WeightCoverage {
  const total = input.lotsWithWeight + input.lotsWithoutWeight;

  return {
    lotsWithWeight: input.lotsWithWeight,
    lotsWithoutWeight: input.lotsWithoutWeight,
    coveragePercent:
      total === 0 ? 100 : Math.round((input.lotsWithWeight / total) * 1000) / 10,
    knownWeightKg: roundWeight(input.knownWeightKg),
  };
}

/**
 * Convierte el contenido neto de un producto expresado en la unidad
 * `legacy` (peso de la presentación) a gramos por unidad de stock.
 *
 * El Banco maneja indistintamente kilos, gramos y libras. Esta función
 * centraliza la conversión para que el peso de un producto sea siempre
 * interpretable.
 */
export function netWeightGramsFromLegacy(
  weight: number,
  legacyUnit: string
): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null;

  const unit = legacyUnit.trim().toLowerCase();

  if (unit === "kg" || unit.startsWith("kilo")) {
    return roundQuantity(weight * GRAMS_PER_KILOGRAM);
  }

  if (unit === "g" || unit === "gr" || unit === "gramo" || unit === "gramos") {
    return roundQuantity(weight);
  }

  if (unit === "lb" || unit === "libra" || unit === "libras") {
    return roundQuantity(weight * GRAMS_PER_POUND);
  }

  return null;
}
