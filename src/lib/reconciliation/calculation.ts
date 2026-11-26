/**
 * Cálculo puro de la conciliación entre dos importaciones consecutivas.
 *
 * Regla principal:
 *   - Sin cambio de existencias: no hay discrepancia.
 *   - Aumento de existencias: es una entrada; no hay discrepancia.
 *   - Disminución: se compara la disminución real contra las unidades
 *     justificadas por las órdenes del intervalo.
 *
 * Saldo esperado = saldo anterior − unidades justificadas.
 * Diferencia = saldo nuevo − saldo esperado.
 */

import { round3 } from "@/lib/siigo/import/parser";

export type MovementType =
  | "INCREASE"
  | "NO_CHANGE"
  | "DECREASE_MATCHED"
  | "DECREASE_DISCREPANCY";

export type ReconciliationStatus =
  | "MATCHED"
  | "PARTIAL"
  | "UNMATCHED"
  | "NO_CHANGE"
  | "REVIEW";

export type ReconciliationReviewStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "DEFERRED"
  | "VALIDATED";

export interface ReconciliationCalculationInput {
  previousQuantity: number;
  newQuantity: number;
  committedQuantity: number;
}

export interface ReconciliationCalculation {
  delta: number;
  expectedQuantity: number;
  difference: number;
  movementType: MovementType;
  status: ReconciliationStatus;
  reviewStatus: ReconciliationReviewStatus;
  note: string;
}

const EPSILON = 0.0005;

export function calculateReconciliation(
  input: ReconciliationCalculationInput
): ReconciliationCalculation {
  const previousQuantity = Number(input.previousQuantity ?? 0);
  const newQuantity = Number(input.newQuantity ?? 0);
  const committedQuantity = Number(input.committedQuantity ?? 0);

  const delta = round3(newQuantity - previousQuantity);
  const expectedQuantity = round3(previousQuantity - committedQuantity);
  const difference = round3(newQuantity - expectedQuantity);

  // Sin cambios: la salida todavía no se refleja en Siigo Pyme. Es una
  // demora operativa normal, no una discrepancia.
  if (Math.abs(delta) <= EPSILON) {
    return {
      delta,
      expectedQuantity,
      difference,
      movementType: "NO_CHANGE",
      status: "NO_CHANGE",
      reviewStatus: "NOT_REQUIRED",
      note:
        "Sin cambios en las existencias. La salida, si existe, aún no se ha reflejado en Siigo Pyme.",
    };
  }

  // Aumento: entrada o incremento de inventario. No se descuentan órdenes.
  if (delta > 0) {
    return {
      delta,
      expectedQuantity,
      difference,
      movementType: "INCREASE",
      status: "NO_CHANGE",
      reviewStatus: "NOT_REQUIRED",
      note: `Incremento de inventario de ${delta} unidades entre importaciones.`,
    };
  }

  // Disminución que coincide con las unidades justificadas por las órdenes.
  if (Math.abs(difference) <= EPSILON) {
    return {
      delta,
      expectedQuantity,
      difference,
      movementType: "DECREASE_MATCHED",
      status: "MATCHED",
      reviewStatus: "NOT_REQUIRED",
      note:
        "La disminución registrada en Siigo Pyme coincide con las unidades justificadas por las órdenes.",
    };
  }

  // Disminución con diferencia: requiere revisión.
  return {
    delta,
    expectedQuantity,
    difference,
    movementType: "DECREASE_DISCREPANCY",
    status: "REVIEW",
    reviewStatus: "PENDING",
    note:
      difference < 0
        ? "Siigo Pyme descontó más unidades de las justificadas por las órdenes. " +
          "Revisar posibles movimientos adicionales; no se presume pérdida ni irregularidad."
        : "Siigo Pyme descontó menos unidades de las justificadas por las órdenes. " +
          "Revisar si la salida quedó registrada parcialmente o si hubo otros movimientos.",
  };
}
