/** Pruebas del cálculo de conciliación entre importaciones consecutivas. */

import { describe, it, expect } from "vitest";
import { calculateReconciliation } from "@/lib/reconciliation/calculation";

describe("Conciliación de saldos por producto y bodega", () => {
  it("saldo anterior 64, comprometido 61 y nuevo 3: sin discrepancia", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 3,
      matureOrder: true,
      toleranceMinutes: 30,
    });

    expect(result.expectedQuantity).toBe(3);
    expect(result.difference).toBe(0);
    expect(result.status).toBe("MATCHED");
    expect(result.reviewStatus).toBe("NOT_REQUIRED");
  });

  it("saldo anterior 64, comprometido 61 y nuevo 0: diferencia de 3", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 0,
      matureOrder: true,
      toleranceMinutes: 30,
    });

    expect(result.expectedQuantity).toBe(3);
    expect(result.difference).toBe(-3);
    expect(result.reviewStatus).toBe("PENDING");
  });

  it("salida reciente aún no reflejada: queda diferida, no alerta", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 64,
      matureOrder: false,
      toleranceMinutes: 30,
    });

    expect(result.difference).toBe(61);
    expect(result.reviewStatus).toBe("DEFERRED");
  });

  it("salida antigua no reflejada: genera alerta pendiente", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 64,
      matureOrder: true,
      toleranceMinutes: 30,
    });

    expect(result.difference).toBe(61);
    expect(result.reviewStatus).toBe("PENDING");
  });

  it("no atribuye la diferencia a pérdida: el texto invita a revisar", () => {
    const result = calculateReconciliation({
      previousQuantity: 64,
      committedQuantity: 61,
      newQuantity: 0,
      matureOrder: true,
      toleranceMinutes: 30,
    });

    expect(result.note).toMatch(/revisar/i);
    expect(result.note).not.toMatch(/pérdida confirmada|robo|irregularidad confirmada/i);
  });
});
