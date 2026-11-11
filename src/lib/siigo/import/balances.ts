/**
 * Cálculo de saldos por producto, bodega y ubicación.
 *
 * REGLA FUNDAMENTAL (verificada sobre el archivo real):
 *
 *   El reporte de Siigo es un MOVIMIENTO DETALLADO. `ACUM CANTIDAD` es un
 *   acumulado corrido que se reinicia en cada grupo (producto, bodega,
 *   ubicación). SUMAR todos los valores de `ACUM CANTIDAD` produciría
 *   duplicaciones, del mismo modo que `CANTIDAD` es el neto del movimiento y
 *   no el saldo disponible.
 *
 *   El saldo de cada grupo es:
 *
 *       saldo = CANT. ANTERIOR  +  Σ (ENTRADAS − SALIDAS)
 *
 *   y se contrasta contra el último `ACUM CANTIDAD` del grupo. Cuando ambos
 *   coinciden, el grupo es consistente. Cuando no, el grupo queda marcado
 *   para revisión en lugar de ocultar la diferencia.
 *
 * En el archivo real del Banco: 5.528 de 5.530 grupos coinciden y hay 1
 * divergencia, causada por una fila corrupta en el origen.
 */

import { round3, type SiigoMovementRow } from "./parser";

/** Tolerancia de comparación de cantidades (coherente con inventory.service). */
export const QUANTITY_EPSILON = 0.0005;

/** Clave del grupo: producto + bodega de Siigo + ubicación. */
export interface GroupKey {
  productCode: string;
  bodega: number;
  ubicacion: number;
}

export function groupKeyOf(row: SiigoMovementRow): string {
  return `${row.productCode}|${row.bodega}|${row.ubicacion}`;
}

export interface GroupBalance {
  productCode: string;
  bodega: number;
  ubicacion: number;
  /** CANT. ANTERIOR del grupo (saldo al inicio del periodo). */
  openingQuantity: number;
  /** Σ(ENTRADAS − SALIDAS) del grupo. */
  netMovement: number;
  /** Saldo recalculado: la fuente de verdad. */
  calculatedQuantity: number;
  /** Último ACUM CANTIDAD reportado por Siigo (solo contraste). */
  reportedQuantity: number;
  /** calculated − reported. */
  difference: number;
  /** true cuando la diferencia supera la tolerancia. */
  reviewRequired: boolean;
  reviewNote: string | null;
  isNegative: boolean;
  /** Número de filas del grupo. */
  rowCount: number;
  /** true si el grupo tiene fila de apertura. */
  hasOpening: boolean;
  /** Suma de la segunda unidad de medida (solo si viene diligenciada). */
  secondaryIn: number;
  secondaryOut: number;
  secondaryBalance: number;
  /** Unidad principal del producto (la primera no vacía del grupo). */
  unit: string;
}

export interface BalanceComputation {
  balances: GroupBalance[];
  /** Filas agrupadas por clave de grupo (para Calculations de peso). */
  byKey: Map<string, GroupBalance>;
  issues: BalanceIssue[];
  stats: {
    groups: number;
    groupsConsistent: number;
    groupsUnderReview: number;
    negativeGroups: number;
    groupsWithoutOpening: number;
    groupsWithMultipleOpenings: number;
  };
}

export interface BalanceIssue {
  code: string;
  message: string;
  productCode: string;
  bodega: number;
  ubicacion: number;
  rowNumber?: number;
  severity: "WARNING" | "ERROR";
}

/**
 * Calcula el saldo de cada grupo (producto, bodega, ubicación).
 *
 * @param rows Filas de movimiento ya normalizadas (en el orden del archivo).
 */
export function computeGroupBalances(rows: SiigoMovementRow[]): BalanceComputation {
  const groups = new Map<string, GroupBalance>();
  const issues: BalanceIssue[] = [];

  for (const row of rows) {
    const key = groupKeyOf(row);
    let group = groups.get(key);

    if (!group) {
      group = {
        productCode: row.productCode,
        bodega: row.bodega,
        ubicacion: row.ubicacion,
        openingQuantity: 0,
        netMovement: 0,
        calculatedQuantity: 0,
        reportedQuantity: 0,
        difference: 0,
        reviewRequired: false,
        reviewNote: null,
        isNegative: false,
        rowCount: 0,
        hasOpening: false,
        secondaryIn: 0,
        secondaryOut: 0,
        secondaryBalance: 0,
        unit: "",
      };
      groups.set(key, group);
    }

    group.rowCount++;

    if (!group.unit && row.unit) group.unit = row.unit;

    if (row.isOpening) {
      group.hasOpening = true;
      group.openingQuantity = row.qtyBefore;
    } else {
      group.netMovement = round3(group.netMovement + row.qtyNet);
      group.secondaryIn = round3(group.secondaryIn + row.qty2In);
      group.secondaryOut = round3(group.secondaryOut + row.qty2Out);
    }

    // El último ACUM CANTIDAD del grupo es el saldo que reporta Siigo.
    group.reportedQuantity = row.qtyAccum;

    if (row.qty2Balance !== 0) {
      group.secondaryBalance = row.qty2Balance;
    }
  }

  let groupsConsistent = 0;
  let groupsUnderReview = 0;
  let negativeGroups = 0;
  let groupsWithoutOpening = 0;
  let groupsWithMultipleOpenings = 0;

  const balances: GroupBalance[] = [];

  // Se recorren las filas otra vez para detectar aperturas múltiples.
  const openingCount = new Map<string, number>();
  for (const row of rows) {
    if (!row.isOpening) continue;
    const key = groupKeyOf(row);
    openingCount.set(key, (openingCount.get(key) ?? 0) + 1);
  }

  for (const [key, group] of groups) {
    const openings = openingCount.get(key) ?? 0;

    if (openings === 0) {
      groupsWithoutOpening++;
      issues.push({
        code: "GRUPO_SIN_APERTURA",
        message:
          "El grupo no tiene fila de apertura: se asume saldo inicial 0. Conviene revisarlo.",
        productCode: group.productCode,
        bodega: group.bodega,
        ubicacion: group.ubicacion,
        severity: "WARNING",
      });
    } else if (openings > 1) {
      groupsWithMultipleOpenings++;
      issues.push({
        code: "GRUPO_CON_VARIAS_APERTURAS",
        message: `El grupo tiene ${openings} filas de apertura; se toma la última.`,
        productCode: group.productCode,
        bodega: group.bodega,
        ubicacion: group.ubicacion,
        severity: "WARNING",
      });
    }

    group.calculatedQuantity = round3(group.openingQuantity + group.netMovement);
    group.difference = round3(group.calculatedQuantity - group.reportedQuantity);
    group.isNegative = group.calculatedQuantity < 0;

    if (Math.abs(group.difference) > QUANTITY_EPSILON) {
      group.reviewRequired = true;
      group.reviewNote =
        `El saldo recalculado (${group.calculatedQuantity}) no coincide con el ` +
        `ACUM CANTIDAD reportado por Siigo (${group.reportedQuantity}). ` +
        `Diferencia: ${group.difference}.`;
      groupsUnderReview++;
      issues.push({
        code: "DIVERGENCIA_SALDO",
        message: group.reviewNote,
        productCode: group.productCode,
        bodega: group.bodega,
        ubicacion: group.ubicacion,
        severity: Math.abs(group.difference) > 1 ? "ERROR" : "WARNING",
      });
    } else {
      groupsConsistent++;
    }

    if (group.isNegative) {
      negativeGroups++;
    }

    balances.push(group);
  }

  const byKey = new Map<string, GroupBalance>();
  for (const group of balances) byKey.set(groupKeyOf(group as never), group);

  return {
    balances,
    byKey,
    issues,
    stats: {
      groups: balances.length,
      groupsConsistent,
      groupsUnderReview,
      negativeGroups,
      groupsWithoutOpening,
      groupsWithMultipleOpenings,
    },
  };
}

/**
 * Suma las existencias de un producto en todas sus bodegas.
 *
 * SOLO se usa cuando el usuario pide explícitamente el consolidado; la
 * consulta normal desagrega por bodega y ubicación.
 */
export function sumByProduct(balances: GroupBalance[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const group of balances) {
    totals.set(
      group.productCode,
      round3((totals.get(group.productCode) ?? 0) + group.calculatedQuantity)
    );
  }
  return totals;
}

/** Suma las existencias de una bodega. */
export function sumByWarehouse(
  balances: GroupBalance[]
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const group of balances) {
    totals.set(
      group.bodega,
      round3((totals.get(group.bodega) ?? 0) + group.calculatedQuantity)
    );
  }
  return totals;
}
