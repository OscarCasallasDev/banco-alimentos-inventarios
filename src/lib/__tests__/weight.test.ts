/**
 * Pruebas unitarias — Cálculo de peso y volumen
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import {
  GRAMS_PER_POUND,
  computeVolumeL,
  computeWeightCoverage,
  computeWeightKg,
  groupQuantityByUnitKind,
  multiplyExact,
  netWeightGramsFromLegacy,
  roundQuantity,
} from "@/lib/lots/weight";

describe("computeWeightKg", () => {
  it("calcula 150 kg para 300 bolsas de 500 g", () => {
    expect(computeWeightKg(300, 500)).toBe(150);
  });

  it("calcula 200 kg para 400 bolsas de 500 g", () => {
    expect(computeWeightKg(400, 500)).toBe(200);
  });

  it("devuelve 350 kg para los dos lotes juntos", () => {
    const primerLote = computeWeightKg(300, 500) ?? 0;
    const segundoLote = computeWeightKg(400, 500) ?? 0;
    expect(primerLote + segundoLote).toBe(350);
  });

  it("devuelve null cuando no hay peso unitario conocido", () => {
    expect(computeWeightKg(300, null)).toBeNull();
    expect(computeWeightKg(300, undefined)).toBeNull();
  });

  it("devuelve null cuando el contenido neto es cero", () => {
    // 0 gramos no es "cero gramos": es un dato desconocido.
    expect(computeWeightKg(300, 0)).toBeNull();
  });

  it("maneja cantidades fraccionarias sin perder precisión", () => {
    // 12,5 kg de arroz de 500 g: 25 bolsas exactas.
    expect(computeWeightKg(25, 500)).toBe(12.5);
    expect(computeWeightKg(12.5, 1000)).toBe(12.5);
  });

  it("devuelve 0 cuando la cantidad es cero", () => {
    expect(computeWeightKg(0, 500)).toBe(0);
  });

  it("convierte libras con la equivalencia estándar", () => {
    const grams = netWeightGramsFromLegacy(1, "lb");
    expect(grams).toBeCloseTo(GRAMS_PER_POUND, 3);
    expect(computeWeightKg(240, grams)).toBeCloseTo(108.862, 3);
  });
});

describe("computeVolumeL", () => {
  it("calcula el volumen de botellas de 1,5 L", () => {
    expect(computeVolumeL(250, 1500)).toBe(375);
  });

  it("devuelve null cuando el volumen no es conocido", () => {
    expect(computeVolumeL(250, null)).toBeNull();
  });
});

describe("multiplyExact", () => {
  it("evita el error de coma flotante clásico", () => {
    expect(multiplyExact(0.1, 0.2)).toBe(0.02);
    expect(multiplyExact(1.1, 3)).toBe(3.3);
  });
});

describe("roundQuantity", () => {
  it("redondea a tres decimales", () => {
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(1.0004)).toBe(1);
  });
});

describe("groupQuantityByUnitKind", () => {
  it("no mezcla unidades de naturaleza distinta", () => {
    const totals = groupQuantityByUnitKind([
      { quantity: 300, unitKind: "COUNT" },
      { quantity: 400, unitKind: "COUNT" },
      { quantity: 240, unitKind: "MASS" },
      { quantity: 50, unitKind: "VOLUME" },
    ]);

    expect(totals.COUNT.quantity).toBe(700);
    expect(totals.MASS.quantity).toBe(240);
    expect(totals.VOLUME.quantity).toBe(50);
    expect(totals.COUNT.lots).toBe(2);
  });
});

describe("computeWeightCoverage", () => {
  it("informa el porcentaje de lotes con peso conocido", () => {
    const coverage = computeWeightCoverage({
      lotsWithWeight: 18,
      lotsWithoutWeight: 2,
      knownWeightKg: 1949.85,
    });

    expect(coverage.coveragePercent).toBe(90);
    expect(coverage.lotsWithoutWeight).toBe(2);
  });

  it("informa 100 % cuando no hay lotes", () => {
    expect(
      computeWeightCoverage({
        lotsWithWeight: 0,
        lotsWithoutWeight: 0,
        knownWeightKg: 0,
      }).coveragePercent
    ).toBe(100);
  });
});

describe("netWeightGramsFromLegacy", () => {
  it("convierte kilogramos a gramos", () => {
    expect(netWeightGramsFromLegacy(1, "kg")).toBe(1000);
    expect(netWeightGramsFromLegacy(0.5, "KG")).toBe(500);
  });

  it("convierte gramos sin cambios", () => {
    expect(netWeightGramsFromLegacy(500, "g")).toBe(500);
  });

  it("devuelve null cuando la unidad no es conocida", () => {
    expect(netWeightGramsFromLegacy(500, "unidad")).toBeNull();
    expect(netWeightGramsFromLegacy(0, "kg")).toBeNull();
  });
});
