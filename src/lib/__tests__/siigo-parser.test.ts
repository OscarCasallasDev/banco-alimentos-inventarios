/**
 * Pruebas del importador contra el archivo REAL de Siigo Pyme del Banco.
 *
 * Archivo: tests/fixtures/siigo-reporte-inventarios.xlsx
 *   "Reporte detallado de inventarios x bodega - Enero a Agosto 2026
 *    (productos activos).xlsx"
 *
 * Si el archivo no está presente, la suite se omite (no falla) para que el
 * resto de las pruebas siga siendo ejecutable.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  parseSiigoReport,
  classifyRow,
  parseDocument,
  parsePeriodHeader,
  parseGeneratedAt,
  parseReportDate,
  normalizeDateText,
  round3,
} from "@/lib/siigo/import/parser";
import { openWorkbook, excelSerialToDate } from "@/lib/siigo/import/xlsx-reader";
import type { CellValue } from "@/lib/siigo/import/xlsx-reader";

const FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "siigo-reporte-inventarios.xlsx"
);
const HAS_FIXTURE = existsSync(FIXTURE);

describe("Parser del reporte de Siigo Pyme (archivo real)", () => {
  let buffer: Buffer;
  let result: ReturnType<typeof parseSiigoReport>;

  beforeAll(() => {
    if (!HAS_FIXTURE) return;
    buffer = readFileSync(FIXTURE);
    result = parseSiigoReport(buffer);
  }, 120_000);

  it("1. Lee correctamente la fila de encabezados (fila 7)", () => {
    if (!HAS_FIXTURE) return;
    expect(result.rows.length).toBeGreaterThan(60_000);

    const workbook = openWorkbook(buffer);
    const sheet = workbook.getSheet("Hoja1")!;
    const headerRow = sheet.rows[6];
    expect(headerRow).toBeDefined();
    // El encabezado de la columna A es la clave del producto.
    expect(String(headerRow[0].value).trim()).toBe("LIN-GRUP-ELEMEN");
    // El encabezado de la columna T (índice 19) es CANTIDAD.
    expect(String(headerRow[19].value).trim()).toBe("CANTIDAD");
  });

  it("2. Identifica correctamente las columnas y sus metadatos", () => {
    if (!HAS_FIXTURE) return;
    expect(result.meta.title).toContain("BANCO ARQUIDIOCESANO");
    expect(result.meta.subtitle).toContain("MOVIMIENTO DETALLADO DE BODEGA POR FECHA");
    expect(result.meta.periodFrom).toBe("2026-01-01");
    expect(result.meta.periodTo).toBe("2026-08-27");
    expect(result.meta.generatedAt).toBe("2026-08-27T09:21:14.57");
    expect(result.meta.reportDate).toBe("2026-08-27");
    expect(result.meta.includingClassifications).toBe(true);
    expect(result.meta.hasFormulaSheet).toBe(true);
  });

  it("3. Lee fechas y números correctamente", () => {
    if (!HAS_FIXTURE) return;
    const movements = result.rows.filter((r) => !r.isOpening);
    expect(movements.length).toBeGreaterThan(59_000);

    // Las fechas son ISO y están dentro del rango del reporte.
    const dates = movements.map((r) => r.date!).filter(Boolean);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect(dates.includes("2026-01-26")).toBe(true);
    expect(dates.includes("2026-08-26")).toBe(true);

    // La fecha de Excel se convierte bien (46048 = 26/01/2026).
    expect(excelSerialToDate(46048)).toBe("2026-01-26");
    expect(excelSerialToDate(46027)).toBe("2026-01-05");
  });

  it("4. Excluye subtotales y totales", () => {
    if (!HAS_FIXTURE) return;
    // 65.832 filas de datos = 60.304 movimientos + 5.528 aperturas.
    expect(result.stats.dataRows).toBe(65_832);
    expect(result.stats.openingRows).toBe(5_528);
    expect(result.stats.skippedSubtotalRows).toBe(10_122); // 5.259 + 4.862 + 1

    // Ninguna fila de datos conserva un rótulo de total.
    const withTotal = result.rows.filter((r) =>
      r.productCode.toUpperCase().startsWith("TOTAL ")
    );
    expect(withTotal).toHaveLength(0);
  });

  it("5. Identifica los productos por LIN-GRUP-ELEMEN", () => {
    if (!HAS_FIXTURE) return;
    const codes = new Set(result.rows.map((r) => r.productCode));
    expect(codes.size).toBe(4_862);

    // El código y el nombre son 1:1 (no hay un código con dos nombres).
    const nameByCode = new Map<string, Set<string>>();
    for (const row of result.rows) {
      if (!nameByCode.has(row.productCode)) nameByCode.set(row.productCode, new Set());
      nameByCode.get(row.productCode)!.add(row.productName);
    }
    const withTwoNames = [...nameByCode.values()].filter((s) => s.size > 1);
    expect(withTwoNames).toHaveLength(0);

    // Y sí hay nombres repetidos en códigos distintos (no se deben fusionar).
    const codesByName = new Map<string, Set<string>>();
    for (const row of result.rows) {
      if (!codesByName.has(row.productName)) codesByName.set(row.productName, new Set());
      codesByName.get(row.productName)!.add(row.productCode);
    }
    const duplicated = [...codesByName.entries()].filter(([, s]) => s.size > 1);
    expect(duplicated.length).toBeGreaterThan(0);
  });

  it("6. No confunde REFERENCIA con el nombre del producto", () => {
    if (!HAS_FIXTURE) return;
    const references = new Set(result.rows.map((r) => r.reference).filter(Boolean));
    // REFERENCIA es una clasificación con muchas variantes: 108 valores con
    // texto (hay además productos con la referencia vacía).
    expect(references.size).toBe(108);

    // La prueba de fondo: REFERENCIA NO identifica un producto. 48 de las
    // 109 referencias agrupan a más de un producto y una sola referencia
    // (la de mayor tamaño) llega a 1.979 productos distintos.
    const codesByReference = new Map<string, Set<string>>();
    for (const row of result.rows) {
      if (!codesByReference.has(row.reference)) {
        codesByReference.set(row.reference, new Set());
      }
      codesByReference.get(row.reference)!.add(row.productCode);
    }
    const sizes = [...codesByReference.values()].map((s) => s.size);
    expect(sizes.filter((s) => s > 1).length).toBe(48);
    expect(Math.max(...sizes)).toBe(1_979);

    // En cambio LIN-GRUP-ELEMEN sí es único: 4.862 códigos para 4.862 productos.
    expect(new Set(result.rows.map((r) => r.productCode)).size).toBe(4_862);
  });

  it("7. Identifica bodegas y ubicaciones", () => {
    if (!HAS_FIXTURE) return;
    const bodegas = new Set(result.rows.map((r) => r.bodega));
    expect(bodegas.has(1)).toBe(true);
    expect(bodegas.has(7)).toBe(true);
    // La bodega corrupta 46244 queda detectada por el validador, no aquí.
    expect(bodegas.size).toBeLessThanOrEqual(8);

    const ubicaciones = new Set(result.rows.map((r) => r.ubicacion));
    expect(ubicaciones.has(1)).toBe(true);
    expect(ubicaciones.has(0)).toBe(true);
  });

  it("8. CANTIDAD es el neto del movimiento, no el saldo", () => {
    if (!HAS_FIXTURE) return;
    const bad = result.rows.filter(
      (r) => Math.abs(r.qtyNet - (r.qtyIn - r.qtyOut)) > 0.001
    );
    expect(bad).toHaveLength(0);
  });

  it("9. Interpreta la segunda unidad de medida sin mezclarla con la principal", () => {
    if (!HAS_FIXTURE) return;
    const withSecondary = result.rows.filter(
      (r) => r.qty2In !== 0 || r.qty2Out !== 0 || r.qty2Balance !== 0
    );
    expect(withSecondary.length).toBeGreaterThan(0);
    // Las columnas de segunda unidad se capturan, pero nunca se suman a la
    // cantidad principal: la verificación del punto 8 sigue cumpliéndose.
    for (const row of withSecondary.slice(0, 500)) {
      expect(row.qtyNet).toBeCloseTo(row.qtyIn - row.qtyOut, 3);
    }
  });

  it("10. Las filas de apertura traen el saldo inicial y no son movimientos", () => {
    if (!HAS_FIXTURE) return;
    const openings = result.rows.filter((r) => r.isOpening);
    expect(openings.length).toBe(5_528);

    for (const opening of openings) {
      expect(opening.date).toBeNull();
      expect(opening.qtyIn).toBe(0);
      expect(opening.qtyOut).toBe(0);
      expect(opening.qtyAccum).toBeCloseTo(opening.qtyBefore, 3);
      expect(opening.document).toBe("-000 00000000000-0000");
    }
  });
});

describe("Utilidades del parser", () => {
  it("Clasifica las filas de total, subtotal y dato", () => {
    const dataCell = (value: string) => ({ kind: "string" as const, value });
    const numCell = (value: number) => ({ kind: "number" as const, value });

    expect(classifyRow([])).toBe("blank");
    expect(classifyRow([dataCell("001-0001-000001"), numCell(1)])).toBe("data");
    expect(classifyRow([dataCell("Total 001-0001-000001")])).toBe("total");
    expect(classifyRow([dataCell("Total general")])).toBe("total");
    // El rótulo de subtotal va en la columna BODEGA (índice 11).
    const subtotalRow: CellValue[] = [];
    subtotalRow[11] = dataCell("Total 1 ");
    expect(classifyRow(subtotalRow)).toBe("subtotal");
  });

  it("Divide el DOCUMENTO de Siigo", () => {
    expect(parseDocument("F-001 00000044711-0045")).toEqual({
      type: "F-001",
      number: "00000044711",
      sequence: "0045",
    });
    expect(parseDocument(" -000 00000000000-0000")).toEqual({
      type: null,
      number: null,
      sequence: null,
    });
  });

  it("Lee los encabezados de periodo, proceso y fecha de reporte", () => {
    expect(parsePeriodHeader("De: 2026/01/01     A: 2026/08/27")).toEqual({
      from: "2026-01-01",
      to: "2026-08-27",
    });
    expect(parseGeneratedAt("Procesado en: 2026/08/27  09:21:14:57")).toBe(
      "2026-08-27T09:21:14.57"
    );
    expect(parseReportDate("AGO/27/2026")).toBe("2026-08-27");
  });

  it("Normaliza fechas sin inventar la fecha actual", () => {
    expect(normalizeDateText("2026-01-26")).toBe("2026-01-26");
    expect(normalizeDateText("26/01/2026")).toBe("2026-01-26");
    expect(normalizeDateText("0000/00/00")).toBeNull();
    expect(normalizeDateText("")).toBeNull();
    expect(normalizeDateText("texto inválido")).toBeNull();
  });

  it("Redondea a 3 decimales eliminando el ruido de coma flotante", () => {
    expect(round3(139555.80000000005)).toBe(139555.8);
    expect(round3(2968.2000000000003)).toBe(2968.2);
  });
});
