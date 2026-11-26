/** Pruebas del peso automático a partir de la presentación del producto. */

import { describe, it, expect } from "vitest";
import {
  computeLineWeightKg,
  formatWeightKg,
  parsePresentationContent,
  resolveUnitWeightKg,
} from "@/lib/orders/presentation";

describe("Presentación del producto", () => {
  it("lee gramos y kilogramos", () => {
    expect(parsePresentationContent("LENTEJA X 250 GR")).toEqual({
      gramsPerUnit: 250,
      mlPerUnit: null,
    });
    expect(parsePresentationContent("ARROZ X 1,5 KG")).toEqual({
      gramsPerUnit: 1500,
      mlPerUnit: null,
    });
    expect(parsePresentationContent("Bolsa 500g")).toEqual({
      gramsPerUnit: 500,
      mlPerUnit: null,
    });
  });

  it("lee mililitros y litros", () => {
    expect(parsePresentationContent("ACEITE X 1000 ML")).toEqual({
      gramsPerUnit: null,
      mlPerUnit: 1000,
    });
    expect(parsePresentationContent("LECHE X 1 L")).toEqual({
      gramsPerUnit: null,
      mlPerUnit: 1000,
    });
    expect(parsePresentationContent("LECHE X 2 L")).toEqual({
      gramsPerUnit: null,
      mlPerUnit: 2000,
    });
  });

  it("lee miligramos, toneladas y presentaciones múltiples", () => {
    expect(parsePresentationContent("PRODUCTO X 5000 MG")).toEqual({
      gramsPerUnit: 5,
      mlPerUnit: null,
    });
    expect(parsePresentationContent("PRODUCTO X 1 TON")).toEqual({
      gramsPerUnit: 1_000_000,
      mlPerUnit: null,
    });
    expect(
      parsePresentationContent("CAJA X 12 UNIDADES DE 250 GR")
    ).toEqual({ gramsPerUnit: 3000, mlPerUnit: null });
    expect(parsePresentationContent("PAQUETE X 500 GR")).toEqual({
      gramsPerUnit: 500,
      mlPerUnit: null,
    });
  });
});

describe("Peso calculado en kilogramos", () => {
  it("4 unidades de 250 g son 1 kg", () => {
    expect(computeLineWeightKg(4, "LENTEJA X 250 GR").kg).toBe(1);
  });

  it("2,5 unidades de 500 g son 1,25 kg", () => {
    expect(computeLineWeightKg(2.5, "PRODUCTO X 500 GR").kg).toBe(1.25);
  });

  it("5 unidades de 1000 g son 5 kg", () => {
    expect(computeLineWeightKg(5, "ARROZ X 1 KG").kg).toBe(5);
  });

  it("2,5 unidades de 250 g son 0,625 kg y se muestran como 0,63", () => {
    const result = computeLineWeightKg(2.5, "LENTEJA X 250 GR");
    expect(result.kg).toBe(0.625);
    expect(formatWeightKg(result.kg)).toBe("0,63");
  });

  it("1,5 unidades de 2 kg son 3 kg", () => {
    expect(computeLineWeightKg(1.5, "PRODUCTO X 2 KG").kg).toBe(3);
  });

  it("prioriza el contenido neto verificado del catálogo", () => {
    expect(resolveUnitWeightKg("Producto sin presentación", null, 200).kg).toBe(
      0.2
    );
  });

  it("no inventa el peso de un líquido sin densidad aprobada", () => {
    const result = computeLineWeightKg(5, "ACEITE DE OLIVA X 1000 ML");
    expect(result.kg).toBeNull();
    expect(result.pending).toBe(true);
    expect(result.reason).toBe("DENSITY");
  });

  it("calcula un líquido cuando el producto tiene densidad configurada", () => {
    expect(
      computeLineWeightKg(4, "ACEITE X 1000 ML", null, null, 0.915).kg
    ).toBe(3.66);
  });
});

describe("Formato colombiano del peso", () => {
  it("usa coma y máximo dos decimales, sin ceros innecesarios", () => {
    expect(formatWeightKg(1)).toBe("1");
    expect(formatWeightKg(1.25)).toBe("1,25");
    expect(formatWeightKg(0.5)).toBe("0,5");
    expect(formatWeightKg(2.756)).toBe("2,76");
  });
});
