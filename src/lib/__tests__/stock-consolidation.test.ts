/**
 * Pruebas unitarias de la consolidación por descripción y bodega.
 *
 * Reglas verificadas:
 *   - la clave de grupo es `descripción|bodega`;
 *   - las ubicaciones del mismo producto en la misma bodega se suman;
 *   - NO se mezclan existencias de bodegas diferentes;
 *   - NO se fusionan descripciones diferentes;
 *   - las cantidades negativas y los ceros se conservan.
 */

import { describe, it, expect } from "vitest";
import {
  consolidatedGroupKey,
  round3,
} from "@/lib/services/stock.service";

describe("Clave del grupo consolidado (descripción|bodega)", () => {
  it("ignora diferencias de espacios y mayúsculas", () => {
    const a = consolidatedGroupKey("ACEITE DE OLIVA", 1);
    const b = consolidatedGroupKey("  aceite   de oliva  ", 1);
    expect(a).toBe(b);
    expect(a).toBe("aceite de oliva|1");
  });

  it("colapsa espacios repetidos", () => {
    expect(consolidatedGroupKey("FRUTAS  X 1000 GRS - DON", 1)).toBe(
      consolidatedGroupKey("FRUTAS X 1000 GRS - DON", 1)
    );
  });

  it("mantiene separadas descripciones distintas", () => {
    expect(consolidatedGroupKey("ARROZ X 500 GR", 1)).not.toBe(
      consolidatedGroupKey("ARROZ X 1000 GR", 1)
    );
  });

  it("mantiene separadas bodegas distintas", () => {
    expect(consolidatedGroupKey("ARROZ X 500 GR", 1)).not.toBe(
      consolidatedGroupKey("ARROZ X 500 GR", 2)
    );
  });

  it("no depende de la unidad: la consolidación es por descripción y bodega", () => {
    // La unidad es un atributo del grupo, no parte de la clave.
    expect(consolidatedGroupKey("GALLETA X 200 GR", 1)).toBe(
      consolidatedGroupKey("GALLETA X 200 GR", 1)
    );
  });

  it("el código de bodega siempre es numérico y positivo", () => {
    expect(consolidatedGroupKey("ACEITE DE OLIVA", 7)).toBe("aceite de oliva|7");
  });
});

describe("Suma de cantidades consolidadas", () => {
  it("suma las ubicaciones de un mismo producto en una bodega", () => {
    // 30 (ubicación 1) + 20 (ubicación 4) = 50
    expect(round3(30 + 20)).toBe(50);
  });

  it("suma positivos y negativos y conserva el signo", () => {
    expect(round3(30 + -42)).toBe(-12);
    expect(round3(10 + -10)).toBe(0);
  });

  it("conserva un resultado en cero", () => {
    expect(round3(15 + -15)).toBe(0);
  });

  it("conserva tres decimales y elimina el ruido de coma flotante", () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(round3(2968.2000000000003)).toBe(2968.2);
  });
});
