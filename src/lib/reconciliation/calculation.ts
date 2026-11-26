/**
 * Cálculo puro de la conciliación entre dos importaciones consecutivas.
 *
 * Saldo esperado = saldo anterior − unidades comprometidas del intervalo.
 * Diferencia = saldo nuevo importado − saldo esperado.
 */

import { round3 } from "@/lib/siigo/import/parser";

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
  /** true = la orden ya debía reflejarse; false = aún está en tolerancia. */
  matureOrder: boolean | null;
  toleranceMinutes: number;
}

export interface ReconciliationCalculation {
  delta: number;
  expectedQuantity: number;
  difference: number;
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

  if (Math.abs(difference) <= EPSILON) {
    return {
      delta,
      expectedQuantity,
      difference,
      status:
        committedQuantity > 0 && delta < 0
          ? "MATCHED"
          : delta === 0
            ? "NO_CHANGE"
            : "MATCHED",
      reviewStatus: "NOT_REQUIRED",
      note:
        committedQuantity > 0 && delta < 0
          ? "La reducción de Siigo Pyme coincide con las unidades comprometidas."
          : "El saldo nuevo coincide con el saldo esperado.",
    };
  }

  if (committedQuantity > 0 && input.matureOrder === false) {
    return {
      delta,
      expectedQuantity,
      difference,
      status: "REVIEW",
      reviewStatus: "DEFERRED",
      note:
        "Salida reciente pendiente de reflejarse en Siigo Pyme. " +
        `Se dará tolerancia de ${input.toleranceMinutes} minutos antes de alertar.`,
    };
  }

  return {
    delta,
    expectedQuantity,
    difference,
    status: "REVIEW",
    reviewStatus: "PENDING",
    note:
      difference > 0
        ? "La reducción registrada en Siigo Pyme es menor que las unidades comprometidas. " +
          "Revisar si la salida ya se registró o si hubo otros movimientos."
        : "Siigo Pyme redujo más unidades de las comprometidas en el sistema. " +
          "Revisar posibles movimientos adicionales; no se presume pérdida ni irregularidad.",
  };
}
