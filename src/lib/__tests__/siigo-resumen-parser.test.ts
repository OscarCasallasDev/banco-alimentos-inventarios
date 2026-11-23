/**
 * Pruebas unitarias del lector del reporte RESUMIDO de Siigo Pyme.
 *
 * Verifican el formato oficial «Reporte resumido de productos por bodega»:
 *
 *   A  información del reporte
 *   B  código de bodega
 *   C  descripción de bodega
 *   D  ubicación
 *   E  información de ubicación
 *   F  información de ubicación
 *   G  código del producto
 *   H  descripción del producto
 *   I  entradas
 *   J  (ignorar)
 *   K  (ignorar)
 *   L  salidas
 *   M  (ignorar)
 *   N  (ignorar)
 *   O  diferencia entre entradas y salidas
 *
 * Y que el archivo se lea igual con columnas ocultas o visibles.
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

  it("lee las 2.209 filas de datos y excluye los totales", () => {
    if (!HAS_FIXTURE) return;
    expect(result.rows).toHaveLength(2_209);
    // 9 filas de totales (una por bodega + "Total general").
    expect(result.stats.skippedTotalRows).toBe(9);
    // 10 filas vacías de separación entre bodegas.
    expect(result.stats.skippedEmptyRows).toBe(10);
  });

  it("identifica las 7 bodegas y las ubicaciones", () => {
    if (!HAS_FIXTURE) return;
    expect(result.stats.warehouses).toBe(7);
    expect(result.stats.locations).toBeGreaterThanOrEqual(11);
  });

  it("usa la columna O como diferencia entre entradas y salidas", () => {
    if (!HAS_FIXTURE) return;
    // El total neto del archivo (suma de la columna O) es 125.152,282.
    const total = result.rows.reduce((sum, row) => sum + row.netQuantity, 0);
    expect(Math.round(total * 1000) / 1000).toBe(125_152.282);
  });

  it("ignora por completo las columnas J, K, M y N", () => {
    if (!HAS_FIXTURE) return;
    for (const row of result.rows.slice(0, 200)) {
      expect(row).not.toHaveProperty("qty2In");
      expect(row).not.toHaveProperty("valueIn");
      expect(row).not.toHaveProperty("qty2Out");
      expect(row).not.toHaveProperty("valueOut");
    }
  });

  it("conserva entradas y salidas por separado", () => {
    if (!HAS_FIXTURE) return;
    const conMovimiento = result.rows.find(
      (row) => row.qtyIn > 0 && row.qtyOut > 0
    );
    expect(conMovimiento).toBeDefined();
    expect(conMovimiento!.qtyIn).toBeGreaterThan(0);
    expect(conMovimiento!.qtyOut).toBeGreaterThan(0);
  });

  it("la columna O coincide con entradas menos salidas", () => {
    if (!HAS_FIXTURE) return;
    for (const row of result.rows) {
      expect(row.computedDifference).toBeCloseTo(row.qtyIn - row.qtyOut, 3);
    }
  });

  it("identifica bodegas por su código y su nombre", () => {
    if (!HAS_FIXTURE) return;
    const conBodega = result.rows.find((row) => row.bodegaName.length > 0);
    expect(conBodega).toBeDefined();
    expect(conBodega!.bodegaCode).toBeGreaterThan(0);
    // La descripción de la bodega viene de la columna C.
    expect(conBodega!.bodegaName).not.toMatch(/^\d+$/);
  });

  it("conserva la información de la ubicación", () => {
    if (!HAS_FIXTURE) return;
    const conUbicacion = result.rows.find((row) => row.locationCode > 0);
    expect(conUbicacion).toBeDefined();
    expect(conUbicacion!.locationCode).toBeGreaterThan(0);
  });

  it("conserva la descripción exacta del producto", () => {
    if (!HAS_FIXTURE) return;
    const nombres = new Set(result.rows.map((row) => row.productName));
    expect(nombres.has("COBERTURA CHOCOLATE X 500 GR - DON")).toBe(true);
    for (const nombre of nombres) {
      expect(nombre).toBe(nombre.trim());
    }
  });

  it("identifica productos por código, no por nombre", () => {
    if (!HAS_FIXTURE) return;
    const codigos = new Set(result.rows.map((row) => row.productCode));
    expect(codigos.size).toBeGreaterThan(1_000);
    for (const codigo of codigos) {
      expect(codigo).toMatch(/^\d{3}-\d{4}-\d{6}$/);
    }
  });

  it("no duplica filas: cada código+bodega+ubicación aparece una sola vez", () => {
    if (!HAS_FIXTURE) return;
    const claves = new Set(
      result.rows.map(
        (row) => `${row.productCode}|${row.bodegaCode}|${row.locationCode}`
      )
    );
    expect(claves.size).toBe(result.rows.length);
  });

  it("un mismo producto puede aparecer en varias ubicaciones de la misma bodega", () => {
    if (!HAS_FIXTURE) return;
    // Es lo que permite consolidar por código de producto y bodega sumando
    // las ubicaciones.
    const porProducto = new Map<string, number>();
    for (const row of result.rows) {
      const clave = `${row.productCode}|${row.bodegaCode}`;
      porProducto.set(clave, (porProducto.get(clave) ?? 0) + 1);
    }
    const conVarias = [...porProducto.values()].filter((n) => n > 1);
    expect(conVarias.length).toBeGreaterThan(0);
  });

  it("coincide con los totales de referencia del archivo real", () => {
    if (!HAS_FIXTURE) return;

    const productos = new Set(result.rows.map((row) => row.productCode));
    const grupos = new Set(
      result.rows.map((row) => `${row.productCode}|${row.bodegaCode}`)
    );

    expect(result.rows).toHaveLength(2_209);
    expect(productos.size).toBe(1_344);
    expect(grupos.size).toBe(1_789);
  });

  it("consolida el aceite de oliva: dos ubicaciones, una sola existencia de 5", () => {
    if (!HAS_FIXTURE) return;

    const aceite = result.rows.filter(
      (row) => row.productCode.replace(/\D/g, "") === "0010001003992"
    );
    expect(aceite).toHaveLength(2);
    expect(new Set(aceite.map((row) => row.productCode)).size).toBe(1);
    expect(new Set(aceite.map((row) => row.bodegaCode))).toEqual(new Set([1]));
    expect(new Set(aceite.map((row) => row.locationCode)).size).toBe(2);
    expect(aceite.reduce((sum, row) => sum + row.qtyIn, 0)).toBe(34);
    expect(aceite.reduce((sum, row) => sum + row.qtyOut, 0)).toBe(29);
    expect(
      aceite.reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0)
    ).toBe(5);
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
