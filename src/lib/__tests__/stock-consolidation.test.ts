/**
 * Pruebas unitarias de la consolidación de existencias.
 *
 * Reglas verificadas:
 *   - la clave de grupo es descripción exacta + unidad + bodega;
 *   - descripciones distintas NO se fusionan;
 *   - la misma descripción en la misma bodega y unidad SÍ se fusiona;
 *   - la bodega y la unidad forman parte de la clave (no se mezclan).
 *
 * La prueba de integración (SQL) se hace aparte en `stock-consolidation.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { consolidatedGroupKey, round3 } from "@/lib/services/stock.service";

describe("Clave del grupo consolidado", () => {
  it("ignora diferencias de espacios y mayúsculas en la descripción", () => {
    const a = consolidatedGroupKey("ACEITE DE OLIVA", "UND", 1);
    const b = consolidatedGroupKey("  aceite   de oliva  ", "UND", 1);
    expect(a).toBe(b);
  });

  it("colapsa espacios repetidos", () => {
    expect(consolidatedGroupKey("FRUTAS  X 1000 GRS - DON", "GR", 1)).toBe(
      consolidatedGroupKey("FRUTAS X 1000 GRS - DON", "GR", 1)
    );
  });

  it("mantiene separadas descripciones distintas", () => {
    expect(consolidatedGroupKey("ARROZ X 500 GR", "GR", 1)).not.toBe(
      consolidatedGroupKey("ARROZ X 1000 GR", "GR", 1)
    );
  });

  it("mantiene separadas bodegas distintas", () => {
    expect(consolidatedGroupKey("ARROZ X 500 GR", "GR", 1)).not.toBe(
      consolidatedGroupKey("ARROZ X 500 GR", "GR", 2)
    );
  });

  it("mantiene separadas unidades distintas", () => {
    expect(consolidatedGroupKey("GALLETA X 200 GR", "GR", 1)).not.toBe(
      consolidatedGroupKey("GALLETA X 200 GR", "UND", 1)
    );
  });

  it("normaliza la unidad a mayúsculas", () => {
    expect(consolidatedGroupKey("LECHE", "und", 1)).toBe(
      consolidatedGroupKey("LECHE", "UND ", 1)
    );
  });
});

describe("Suma de cantidades consolidada", () => {
  it("suma positivos y negativos y conserva el signo", () => {
    expect(round3(30 + 20)).toBe(50);
    expect(round3(30 + -42)).toBe(-12);
    expect(round3(10 + -10)).toBe(0);
  });

  it("conserva tres decimales y elimina el ruido de coma flotante", () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(round3(2968.2000000000003)).toBe(2968.2);
  });
});
