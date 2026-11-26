/** Pruebas del cálculo de conciliación entre importaciones consecutivas. */

import { describe, it, expect } from "vitest";
import { calculateReconciliation } from "@/lib/reconciliation/calculation";

describe("Conciliación de saldos por producto y bodega", () => {
  it("64 → 64 con orden de 61: SIN CAMBIOS, sin alerta", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 64,
    });

    expect(result.movementType).toBe("NO_CHANGE");
    expect(result.reviewStatus).toBe("NOT_REQUIRED");
    expect(result.delta).toBe(0);
  });

  it("64 → 70 con orden de 61: INCREMENTO de 6, sin alerta", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 70,
    });

    expect(result.movementType).toBe("INCREASE");
    expect(result.reviewStatus).toBe("NOT_REQUIRED");
    expect(result.delta).toBe(6);
  });

  it("64 → 3 con orden de 61: DISMINUCIÓN CORRECTA, sin alerta", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 3,
    });

    expect(result.expectedQuantity).toBe(3);
    expect(result.difference).toBe(0);
    expect(result.movementType).toBe("DECREASE_MATCHED");
    expect(result.reviewStatus).toBe("NOT_REQUIRED");
  });

  it("64 → 0 con orden de 61: DISMINUCIÓN CON DISCREPANCIA de 3", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 0,
    });

    expect(result.expectedQuantity).toBe(3);
    expect(result.difference).toBe(-3);
    expect(result.movementType).toBe("DECREASE_DISCREPANCY");
    expect(result.reviewStatus).toBe("PENDING");
  });

  it("una disminución sin órdenes queda pendiente de revisión", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 0,
      newQuantity: 60,
    });

    expect(result.difference).toBe(-4);
    expect(result.movementType).toBe("DECREASE_DISCREPANCY");
    expect(result.reviewStatus).toBe("PENDING");
  });

  it("no atribuye la diferencia a pérdida: el texto invita a revisar", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 0,
    });

    expect(result.note).toMatch(/revisar/i);
    expect(result.note).not.toMatch(/pérdida confirmada|robo|irregularidad confirmada/i);
  });
});
