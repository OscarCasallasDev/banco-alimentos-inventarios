/**
 * Pruebas unitarias — Códigos de lote
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import {
  formatLotCode,
  formatLotLabel,
  lotDatePart,
  lotPrefix,
  lotSequenceScope,
} from "@/lib/lots/lot-code";

describe("lotPrefix", () => {
  it("normaliza el código del producto a un prefijo legible", () => {
    expect(lotPrefix("ARR-001")).toBe("ARR001");
    expect(lotPrefix("arr-001")).toBe("ARR001");
  });

  it("elimina acentos y caracteres no alfanuméricos", () => {
    expect(lotPrefix("FRÍJOL-01")).toBe("FRIJOL01");
    expect(lotPrefix("PED#2")).toBe("PED2");
  });

  it("usa PRODUCTO cuando el código no tiene caracteres utilizables", () => {
    expect(lotPrefix("---")).toBe("PRODUCTO");
    expect(lotPrefix("")).toBe("PRODUCTO");
  });

  it("limita la longitud del prefijo", () => {
    expect(lotPrefix("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toHaveLength(12);
  });
});

describe("formatLotCode", () => {
  it("arma el código con prefijo, fecha de ingreso y consecutivo", () => {
    expect(formatLotCode("ARR-001", "2026-10-27", 1)).toBe("L-ARR001-20261027-0001");
  });

  it("rellena el consecutivo con ceros a la izquierda", () => {
    expect(formatLotCode("ARR-001", "2026-10-27", 42)).toBe("L-ARR001-20261027-0042");
    expect(formatLotCode("ARR-001", "2026-10-27", 1234)).toBe("L-ARR001-20261027-1234");
  });

  it("no depende de la cantidad ni del vencimiento", () => {
    // El código se genera una sola vez: dos ingresos del mismo producto
    // con la misma fecha se diferencian solo por el consecutivo.
    expect(formatLotCode("ARR-001", "2026-10-27", 1)).not.toBe(
      formatLotCode("ARR-001", "2026-10-27", 2)
    );
  });
});

describe("lotDatePart", () => {
  it("compacta la fecha", () => {
    expect(lotDatePart("2026-10-27")).toBe("20261027");
  });
});

describe("lotSequenceScope", () => {
  it("crea un ámbito por prefijo y fecha", () => {
    expect(lotSequenceScope("ARR-001", "2026-10-27")).toBe(
      "LOT:ARR001:2026-10-27"
    );
  });

  it("comparte el ámbito entre productos con el mismo prefijo normalizado", () => {
    // "ARR-001" y "ARR001" producen el mismo prefijo, así que comparten el
    // contador: nunca pueden generar el mismo código el mismo día.
    expect(lotSequenceScope("ARR-001", "2026-10-27")).toBe(
      lotSequenceScope("ARR001", "2026-10-27")
    );
  });

  it("distingue productos con prefijos distintos", () => {
    expect(lotSequenceScope("ARR-001", "2026-10-27")).not.toBe(
      lotSequenceScope("FRI-001", "2026-10-27")
    );
  });

  it("distingue días distintos", () => {
    expect(lotSequenceScope("ARR-001", "2026-10-27")).not.toBe(
      lotSequenceScope("ARR-001", "2026-10-28")
    );
  });
});

describe("formatLotLabel", () => {
  it("añade el vencimiento cuando se conoce", () => {
    expect(
      formatLotLabel({ code: "L-ARR001-20261027-0001", expirationDate: "2026-11-01" })
    ).toBe("L-ARR001-20261027-0001 · Vence 01/11/2026");
  });

  it("deja el código intacto cuando no hay vencimiento", () => {
    expect(
      formatLotLabel({ code: "L-ARR001-20261027-0001", expirationDate: null })
    ).toBe("L-ARR001-20261027-0001");
  });
});
