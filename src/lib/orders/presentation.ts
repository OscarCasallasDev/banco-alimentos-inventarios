/**
 * Presentación comercial de un producto y peso operativo de una línea.
 *
 * El Banco decidió manejar TODOS los productos en unidades (UND). El saldo
 * importado de Siigo se interpreta como unidades disponibles; el peso de la
 * orden se deriva de la presentación que aparece en la descripción
 * (por ejemplo «LENTEJA X 250 GR» o «ACEITE X 1000 ML»).
 *
 * Conversiones:
 *   - Masa: gramos, kilogramos y libras se convierten a kilogramos con
 *     equivalencias exactas (1 kg = 1000 g, 1 lb = 453,59237 g).
 *   - Volumen: mililitros NO se convierten a kilogramos sin una densidad
 *     conocida. Si el producto no tiene una equivalencia configurada, el
 *     peso queda PENDIENTE y no se inventa un valor.
 */

import {
  GRAMS_PER_KILOGRAM,
  GRAMS_PER_POUND,
  computeWeightKg,
  roundQuantity,
} from "@/lib/lots/weight";

/** Contenido neto identificado en la presentación. */
export interface PresentationContent {
  /** Gramos por unidad. */
  gramsPerUnit: number | null;
  /** Mililitros por unidad. */
  mlPerUnit: number | null;
}

/** Resultado del peso de una línea. */
export interface LineWeight {
  /** Peso en kilogramos, o `null` si falta configuración. */
  kg: number | null;
  /** El producto requiere una equivalencia de peso (volumen sin densidad). */
  pending: boolean;
}

/**
 * Equivalencias operativas aprobadas por el Banco.
 *
 * Se dejan VACÍAS a propósito: el Banco todavía no ha entregado densidades
 * verificadas para sus productos líquidos. Para habilitar un producto basta
 * agregar aquí su patrón y la densidad en kg/L; el cálculo se aplica de
 * inmediato en la interfaz y en el backend.
 */
const PRODUCT_DENSITIES: { pattern: RegExp; kgPerLiter: number }[] = [
  // Ejemplo de la estructura (no activar sin validación del Banco):
  // { pattern: /aceite de oliva/i, kgPerLiter: 0.915 },
];

/** Patrón de presentación: «X 250 GR», «X 1,5 KG», «1000 ML», «Bolsa 500g». */
const PRESENTATION_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kgm|kg|gramos?|grs?|gr|g|mililitros?|ml|cc|litros?|lts?|lt|l|libras?|lb)\b/i;

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

/**
 * Extrae el contenido neto de los textos del producto (nombre, presentación
 * o descripción). Devuelve el primer dato reconocible.
 */
export function parsePresentationContent(
  ...texts: (string | null | undefined)[]
): PresentationContent {
  for (const text of texts) {
    if (!text) continue;
    const match = PRESENTATION_PATTERN.exec(text);
    if (!match) continue;

    const value = toNumber(match[1]);
    if (!Number.isFinite(value) || value <= 0) continue;

    const unit = match[2].toLowerCase();

    if (/^(kilogramos?|kilos?|kgm|kg)$/.test(unit)) {
      return { gramsPerUnit: roundQuantity(value * GRAMS_PER_KILOGRAM), mlPerUnit: null };
    }
    if (/^(gramos?|grs?|gr|g)$/.test(unit)) {
      return { gramsPerUnit: roundQuantity(value), mlPerUnit: null };
    }
    if (/^(libras?|lb)$/.test(unit)) {
      return { gramsPerUnit: roundQuantity(value * GRAMS_PER_POUND), mlPerUnit: null };
    }
    if (/^(mililitros?|ml|cc)$/.test(unit)) {
      return { gramsPerUnit: null, mlPerUnit: roundQuantity(value) };
    }
    if (/^(litros?|lts?|lt|l)$/.test(unit)) {
      return { gramsPerUnit: null, mlPerUnit: roundQuantity(value * 1000) };
    }
  }

  return { gramsPerUnit: null, mlPerUnit: null };
}

/** Densidad configurada para un producto (kg/L), o `null` si no existe. */
export function densityKgPerLiter(
  ...texts: (string | null | undefined)[]
): number | null {
  const haystack = texts.filter(Boolean).join(" ");
  for (const entry of PRODUCT_DENSITIES) {
    if (entry.pattern.test(haystack)) return entry.kgPerLiter;
  }
  return null;
}

/**
 * Peso unitario en kilogramos de un producto.
 *
 * Prioriza el contenido neto verificado del catálogo (`netWeightGrams`); si
 * no existe, lo deriva de la descripción. Los líquidos sin densidad
 * configurada quedan pendientes.
 */
export function resolveUnitWeightKg(
  name: string | null | undefined,
  presentation?: string | null,
  netWeightGrams?: number | null
): LineWeight {
  if (
    netWeightGrams !== null &&
    netWeightGrams !== undefined &&
    Number.isFinite(netWeightGrams) &&
    netWeightGrams > 0
  ) {
    return { kg: roundQuantity(netWeightGrams / GRAMS_PER_KILOGRAM), pending: false };
  }

  const content = parsePresentationContent(name, presentation);

  if (content.gramsPerUnit !== null) {
    return {
      kg: roundQuantity(content.gramsPerUnit / GRAMS_PER_KILOGRAM),
      pending: false,
    };
  }

  if (content.mlPerUnit !== null) {
    const density = densityKgPerLiter(name, presentation);
    if (density !== null) {
      return {
        kg: roundQuantity((content.mlPerUnit * density) / 1000),
        pending: false,
      };
    }
    return { kg: null, pending: true };
  }

  return { kg: null, pending: true };
}

/** Peso de una línea: cantidad de unidades x contenido de una unidad. */
export function computeLineWeightKg(
  quantity: number,
  name: string | null | undefined,
  presentation?: string | null,
  netWeightGrams?: number | null
): LineWeight {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { kg: 0, pending: false };
  }

  const unit = resolveUnitWeightKg(name, presentation, netWeightGrams);
  if (unit.kg === null) return { kg: null, pending: unit.pending };

  return {
    kg: computeWeightKg(quantity, unit.kg * GRAMS_PER_KILOGRAM),
    pending: false,
  };
}

/**
 * Formato colombiano del peso: máximo dos decimales, coma decimal y sin
 * decimales innecesarios (1 kg, 1,25 kg, 0,5 kg).
 */
export function formatWeightKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
