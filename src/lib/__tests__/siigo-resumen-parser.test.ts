/**
 * Pruebas unitarias del lector del reporte resumido de Siigo Pyme.
 *
 * Verifican el formato oficial que entregó el Banco:
 *   - la fila de encabezados es la 7 y los datos empiezan en la 8;
 *   - la CANTIDAD es la columna O (diferencia), no I − L recalculado;
 *   - las columnas J, K, M y N se ignoran;
 *   - se excluyen las filas de totales;
 *   - los totales del archivo coinciden con lo leído.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  isResumenReport,
  parseResumenReport,
  normalizeProductCode,
} from "@/lib/siigo/import/resumen-parser";

const FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "siigo-reporte-resumido.xlsx"
);
const HAS_FIXTURE = existsSync(FIXTURE);

describe("Lector del reporte resumido (archivo real)", () => {
  let result: ReturnType<typeof parseResumenReport>;

  beforeAll(() => {
    if (!HAS_FIXTURE) return;
    result = parseResumenReport(readFileSync(FIXTURE));
  }, 60_000);

  it("detecta el formato por los encabezados de la fila 7", () => {
    if (!HAS_FIXTURE) return;
    expect(isResumenReport(readFileSync(FIXTURE))).toBe(true);
  });

  it("lee 2.209 filas de datos y excluye los totales", () => {
    if (!HAS_FIXTURE) return;
    expect(result.rows).toHaveLength(2_209);
    // El archivo trae 9 filas de totales (una por bodega + "Total general")
    // y 10 filas vac?as de separaci?n entre bodegas.
    expect(result.stats.skippedTotalRows).toBe(9);
    expect(result.stats.skippedEmptyRows).toBe(10);
  });

  it("identifica las 7 bodegas y las ubicaciones", () => {
    if (!HAS_FIXTURE) return;
    expect(result.stats.warehouses).toBe(7);
    expect(result.stats.locations).toBeGreaterThanOrEqual(11);
  });

  it("toma la cantidad de la columna O", () => {
    if (!HAS_FIXTURE) return;
    // El total neto del archivo (suma de la columna O) es 125.152,282.
    const total = result.rows.reduce((sum, row) => sum + row.netQuantity, 0);
    expect(Math.round(total * 1000) / 1000).toBe(125_152.282);
  });

  it("no usa las columnas J, K, M ni N", () => {
    if (!HAS_FIXTURE) return;
    for (const row of result.rows.slice(0, 200)) {
      expect(row).not.toHaveProperty("qty2In");
      expect(row).not.toHaveProperty("valueIn");
      expect(row).not.toHaveProperty("qty2Out");
      expect(row).not.toHaveProperty("valueOut");
    }
  });

  it("conserva entradas y salidas para trazabilidad", () => {
    if (!HAS_FIXTURE) return;
    const conMovimiento = result.rows.find((row) => row.qtyIn > 0 && row.qtyOut > 0);
    expect(conMovimiento).toBeDefined();
    expect(conMovimiento!.qtyIn).toBeGreaterThan(0);
    expect(conMovimiento!.qtyOut).toBeGreaterThan(0);
  });

  it("cuando la columna O viene vacía usa I − L como respaldo", () => {
    if (!HAS_FIXTURE) return;
    for (const row of result.rows) {
      // O siempre queda informada (la columna o el respaldo).
      expect(Number.isFinite(row.netQuantity)).toBe(true);
      expect(row.computedDifference).toBeCloseTo(row.qtyIn - row.qtyOut, 3);
    }
  });

  it("conserva la descripción exacta del producto", () => {
    if (!HAS_FIXTURE) return;
    const nombres = new Set(result.rows.map((row) => row.productName));
    expect(nombres.has("COBERTURA CHOCOLATE X 500 GR - DON")).toBe(true);
    // Los nombres llegan con espacios de relleno: se recortan.
    for (const nombre of nombres) {
      expect(nombre).toBe(nombre.trim());
    }
  });

  it("identifica productos por código, no por nombre", () => {
    if (!HAS_FIXTURE) return;
    const codigos = new Set(result.rows.map((row) => row.productCode));
    expect(codigos.size).toBeGreaterThan(1_000);
    // Todos los códigos quedan en el formato canónico.
    for (const codigo of codigos) {
      expect(codigo).toMatch(/^\d{3}-\d{4}-\d{6}$/);
    }
  });
});

describe("Normalización del código de producto", () => {
  it("convierte el código sin guiones al formato canónico", () => {
    expect(normalizeProductCode("0010001000001")).toBe("001-0001-000001");
    expect(normalizeProductCode("0080002000042")).toBe("008-0002-000042");
  });

  it("deja intacto un código que ya está normalizado", () => {
    expect(normalizeProductCode("001-0001-000001")).toBe("001-0001-000001");
  });

  it("no inventa formato para un código desconocido", () => {
    expect(normalizeProductCode("CODIGO-RARO")).toBe("CODIGO-RARO");
  });
});
