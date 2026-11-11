/**
 * Pruebas unitarias — Selección FEFO de lotes
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import {
  allocateByFefo,
  sortByFefo,
  type FefoCandidate,
} from "@/lib/lots/fefo";

const HOY = "2026-10-27";

function lote(
  code: string,
  quantityAvailable: number,
  expirationDate: string | null,
  receivedAt = "2026-10-01T12:00:00Z"
): FefoCandidate {
  return {
    id: `id-${code}`,
    code,
    quantityAvailable,
    expirationDate,
    receivedAt,
  };
}

describe("sortByFefo", () => {
  it("ordena por vencimiento más próximo", () => {
    const ordered = sortByFefo(
      [
        lote("L-1", 10, "2026-12-01"),
        lote("L-2", 10, "2026-11-01"),
        lote("L-3", 10, "2026-10-28"),
      ],
      HOY
    );

    expect(ordered.map((item) => item.code)).toEqual(["L-3", "L-2", "L-1"]);
  });

  it("deja los lotes sin vencimiento al final", () => {
    const ordered = sortByFefo(
      [lote("L-1", 10, null), lote("L-2", 10, "2026-12-01")],
      HOY
    );

    expect(ordered.map((item) => item.code)).toEqual(["L-2", "L-1"]);
  });

  it("a igual vencimiento sale primero el más antiguo", () => {
    const ordered = sortByFefo(
      [
        lote("L-2", 10, "2026-11-01", "2026-10-05T12:00:00Z"),
        lote("L-1", 10, "2026-11-01", "2026-10-01T12:00:00Z"),
      ],
      HOY
    );

    expect(ordered.map((item) => item.code)).toEqual(["L-1", "L-2"]);
  });
});

describe("allocateByFefo", () => {
  it("cubre la cantidad con el lote que vence antes", () => {
    const result = allocateByFefo(
      [lote("L-1", 100, "2026-12-01"), lote("L-2", 100, "2026-11-01")],
      50,
      HOY
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].lotCode).toBe("L-2");
    expect(result.allocations[0].quantity).toBe(50);
    expect(result.shortfall).toBe(0);
  });

  it("reparte la cantidad entre varios lotes", () => {
    const result = allocateByFefo(
      [lote("L-1", 100, "2026-11-01"), lote("L-2", 100, "2026-12-01")],
      150,
      HOY
    );

    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].quantity).toBe(100);
    expect(result.allocations[1].quantity).toBe(50);
  });

  it("excluye los lotes vencidos", () => {
    const result = allocateByFefo(
      [lote("L-VENCIDO", 100, "2026-10-01"), lote("L-VIGENTE", 100, "2026-12-01")],
      50,
      HOY
    );

    expect(result.expiredExcluded).toBe(1);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].lotCode).toBe("L-VIGENTE");
  });

  it("permite consumir vencidos solo con autorización explícita", () => {
    const result = allocateByFefo(
      [lote("L-VENCIDO", 100, "2026-10-01")],
      50,
      HOY,
      { allowExpired: true }
    );

    expect(result.expiredExcluded).toBe(0);
    expect(result.allocations[0].lotCode).toBe("L-VENCIDO");
  });

  it("informa el faltante cuando no hay existencias suficientes", () => {
    const result = allocateByFefo(
      [lote("L-1", 30, "2026-12-01")],
      100,
      HOY
    );

    expect(result.allocations[0].quantity).toBe(30);
    expect(result.shortfall).toBe(70);
  });

  it("ignora los lotes agotados", () => {
    const result = allocateByFefo(
      [lote("L-1", 0, "2026-11-01"), lote("L-2", 10, "2026-12-01")],
      5,
      HOY
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].lotCode).toBe("L-2");
  });

  it("nunca asigna más de lo disponible en un lote", () => {
    const result = allocateByFefo(
      [lote("L-1", 30, "2026-12-01"), lote("L-2", 30, "2026-12-05")],
      50,
      HOY
    );

    for (const allocation of result.allocations) {
      expect(allocation.quantity).toBeLessThanOrEqual(30);
    }
    expect(result.shortfall).toBe(0);
  });
});
