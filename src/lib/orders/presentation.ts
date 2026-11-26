/**
 * Presentación comercial de un producto y peso operativo de una línea.
 *
 * El Banco maneja todos los productos en unidades (UND). El saldo importado
 * de Siigo se interpreta como unidades disponibles y el peso se deriva de la
 * presentación de la descripción:
 *   «X 250 GR», «X 1 KG», «X 1000 ML», «X 2 L», «X 5000 MG», «X 1 TON»,
 *   «Caja x 12 unidades de 250 GR», etc.
 *
 * Masa: gramos, miligramos, kilogramos, toneladas y libras se convierten a
 * kilogramos con equivalencias exactas.
 * Volumen: mililitros/litros SOLO se convierten si el producto tiene una
 * densidad aprobada configurada en `products.density_kg_per_liter`. Nunca se
 * asume densidad 1 kg/L.
 */

import {
  GRAMS_PER_KILOGRAM,
  GRAMS_PER_POUND,
  computeWeightKg,
  roundQuantity,
} from "@/lib/lots/weight";

export interface PresentationContent {
  /** Gramos por unidad. */
  gramsPerUnit: number | null;
  /** Mililitros por unidad. */
  mlPerUnit: number | null;
}

/** Motivo por el que un peso queda pendiente. */
export type WeightPendingReason = "DENSITY" | "PRESENTATION" | null;

export interface LineWeight {
  /** Peso en kilogramos, o `null` si falta configuración. */
  kg: number | null;
  /** El producto requiere un dato adicional para calcular el peso. */
  pending: boolean;
  reason: WeightPendingReason;
}

/**
 * Unidades reconocidas. El orden importa: las expresiones largas van antes
 * que sus abreviaturas para que «ML» no se lea como «L» ni «MG» como «G».
 */
const UNIT =
  "toneladas?|tons?|tn|t|kilogramos?|kilos?|kgm|kg|miligramos?|mgs?|mg|gramos?|gms?|grs?|gr|g|mililitros?|ml|cc|litros?|lts?|lt|l|libras?|lb";

/** «12 unidades de 250 GR», «6 UND x 500 ML», «12 x 250 GR». */
const MULTI_PATTERN = new RegExp(
  `(\\d+)\\s*(?:unidades?|unds?|unids?|piezas?|bolsas?|paquetes?|latas?|frascos?|docenas?)\\s*(?:de\\s+|x\\s+|de\\s*x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\b`,
  "i"
);

/** «Caja x 6 x 500 ML», «Paquete de 12 de 250 GR». */
const CONTAINER_PATTERN = new RegExp(
  `(?:caja|paquete|bolsa|saco|fardo|display|estuche)\\s*(?:x|de)?\\s*(\\d+)\\s*(?:x|de)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\b`,
  "i"
);

/** Presentación simple: «X 250 GR», «1000 ML», «2,5 KG». */
const SIMPLE_PATTERN = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\b`,
  "i"
);

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

type UnitKind = "mass" | "volume";

/** Convierte una cantidad y su unidad a gramos o mililitros. */
function convertUnit(
  value: number,
  rawUnit: string
): { kind: UnitKind; amount: number } | null {
  const unit = rawUnit.toLowerCase();

  if (/^(toneladas?|tons?|tn|t)$/.test(unit)) {
    return { kind: "mass", amount: value * 1_000_000 };
  }
  if (/^(kilogramos?|kilos?|kgm|kg)$/.test(unit)) {
    return { kind: "mass", amount: value * GRAMS_PER_KILOGRAM };
  }
  if (/^(miligramos?|mgs?|mg)$/.test(unit)) {
    return { kind: "mass", amount: value / 1000 };
  }
  if (/^(gramos?|gms?|grs?|gr|g)$/.test(unit)) {
    return { kind: "mass", amount: value };
  }
  if (/^(libras?|lb)$/.test(unit)) {
    return { kind: "mass", amount: value * GRAMS_PER_POUND };
  }
  if (/^(mililitros?|ml|cc)$/.test(unit)) {
    return { kind: "volume", amount: value };
  }
  if (/^(litros?|lts?|lt|l)$/.test(unit)) {
    return { kind: "volume", amount: value * 1000 };
  }

  return null;
}

function contentFromMatch(
  amount: number,
  unit: string
): PresentationContent | null {
  const converted = convertUnit(amount, unit);
  if (!converted || !Number.isFinite(converted.amount) || converted.amount <= 0) {
    return null;
  }

  return converted.kind === "mass"
    ? {
        gramsPerUnit: roundQuantity(converted.amount),
        mlPerUnit: null,
      }
    : {
        gramsPerUnit: null,
        mlPerUnit: roundQuantity(converted.amount),
      };
}

/**
 * Extrae el contenido neto de los textos del producto (nombre, presentación
 * o descripción). Primero reconoce presentaciones con multiplicador
 * («12 unidades de 250 GR») y después la presentación simple.
 */
export function parsePresentationContent(
  ...texts: (string | null | undefined)[]
): PresentationContent {
  for (const text of texts) {
    if (!text) continue;

    const multi = MULTI_PATTERN.exec(text);
    if (multi) {
      const count = Number(multi[1]);
      const content = contentFromMatch(Number(multi[2].replace(",", ".")), multi[3]);
      if (content && Number.isFinite(count) && count > 0) {
        return content.gramsPerUnit !== null
          ? { gramsPerUnit: roundQuantity(count * content.gramsPerUnit), mlPerUnit: null }
          : { gramsPerUnit: null, mlPerUnit: roundQuantity(count * content.mlPerUnit!) };
      }
    }

    const container = CONTAINER_PATTERN.exec(text);
    if (container) {
      const count = Number(container[1]);
      const content = contentFromMatch(
        Number(container[2].replace(",", ".")),
        container[3]
      );
      if (content && Number.isFinite(count) && count > 0) {
        return content.gramsPerUnit !== null
          ? { gramsPerUnit: roundQuantity(count * content.gramsPerUnit), mlPerUnit: null }
          : { gramsPerUnit: null, mlPerUnit: roundQuantity(count * content.mlPerUnit!) };
      }
    }

    const simple = SIMPLE_PATTERN.exec(text);
    if (simple) {
      const content = contentFromMatch(
        Number(simple[1].replace(",", ".")),
        simple[2]
      );
      if (content) return content;
    }
  }

  return { gramsPerUnit: null, mlPerUnit: null };
}

/**
 * Peso unitario en kilogramos.
 *
 * Prioriza el contenido neto verificado del catálogo (`netWeightGrams`).
 * Si no existe, usa la presentación de la descripción. Para volumen exige
 * una densidad aprobada (`densityKgPerLiter`) asociada al producto.
 */
export function resolveUnitWeightKg(
  name: string | null | undefined,
  presentation?: string | null,
  netWeightGrams?: number | null,
  densityKgPerLiter?: number | null
): LineWeight {
  if (
    netWeightGrams !== null &&
    netWeightGrams !== undefined &&
    Number.isFinite(netWeightGrams) &&
    netWeightGrams > 0
  ) {
    return {
      kg: roundQuantity(netWeightGrams / GRAMS_PER_KILOGRAM),
      pending: false,
      reason: null,
    };
  }

  const content = parsePresentationContent(name, presentation);

  if (content.gramsPerUnit !== null) {
    return {
      kg: roundQuantity(content.gramsPerUnit / GRAMS_PER_KILOGRAM),
      pending: false,
      reason: null,
    };
  }

  if (content.mlPerUnit !== null) {
    if (
      densityKgPerLiter !== null &&
      densityKgPerLiter !== undefined &&
      Number.isFinite(densityKgPerLiter) &&
      densityKgPerLiter > 0
    ) {
      return {
        kg: roundQuantity((content.mlPerUnit * densityKgPerLiter) / 1000),
        pending: false,
        reason: null,
      };
    }
    return { kg: null, pending: true, reason: "DENSITY" };
  }

  return { kg: null, pending: true, reason: "PRESENTATION" };
}

/** Peso de una línea: cantidad de unidades x contenido de una unidad. */
export function computeLineWeightKg(
  quantity: number,
  name: string | null | undefined,
  presentation?: string | null,
  netWeightGrams?: number | null,
  densityKgPerLiter?: number | null
): LineWeight {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { kg: 0, pending: false, reason: null };
  }

  const unit = resolveUnitWeightKg(
    name,
    presentation,
    netWeightGrams,
    densityKgPerLiter
  );
  if (unit.kg === null) return unit;

  return {
    kg: computeWeightKg(quantity, unit.kg * GRAMS_PER_KILOGRAM),
    pending: false,
    reason: null,
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
