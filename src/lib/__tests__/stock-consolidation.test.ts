/**
 * Pruebas unitarias de las existencias por producto y bodega.
 *
 * Reglas verificadas:
 *   - la clave de grupo es `código de Siigo|bodega` (NO la descripción);
 *   - dos productos con el mismo nombre pero códigos distintos NO se
 *     fusionan;
 *   - el mismo producto en bodegas distintas NO se fusiona;
 *   - un producto con el mismo nombre en la MISMA bodega pero distinto
 *     código tampoco se fusiona (ese es el caso que la dirección pidió
 *     separar).
 */

import { describe, it, expect } from "vitest";
import {
  stockGroupKey,
  consolidatedGroupKey,
  round3,
} from "@/lib/services/stock.service";

describe("Clave de grupo por producto y bodega", () => {
  it("usa el código de Siigo y la bodega", () => {
    expect(stockGroupKey("001-0001-000001", 1)).toBe("001-0001-000001|1");
  });

  it("normaliza el código a minúsculas y sin espacios", () => {
    expect(stockGroupKey("  001-0001-000001 ", 1)).toBe("001-0001-000001|1");
  });

  it("mantiene separados productos con el mismo nombre y distinto código", () => {
    expect(stockGroupKey("001-0001-000001", 1)).not.toBe(
      stockGroupKey("002-0001-000001", 1)
    );
  });

  it("mantiene separados el mismo producto en bodegas distintas", () => {
    expect(stockGroupKey("001-0001-000001", 1)).not.toBe(
      stockGroupKey("001-0001-000001", 2)
    );
  });

  it("no depende de la descripción del producto", () => {
    // Dos productos con nombres distintos pero el mismo código NO pueden
    // ocurrir (el código es único), pero la clave no debe usar el nombre.
    expect(stockGroupKey("001-0001-000001", 3)).toBe("001-0001-000001|3");
  });
});

describe("Clave histórica (descripción|unidad|bodega)", () => {
  it("se conserva para leer los registros anteriores", () => {
    expect(consolidatedGroupKey("ACEITE DE OLIVA", "UND", 1)).toBe(
      "aceite de oliva|UND|1"
    );
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
});

describe("Suma de cantidades", () => {
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
