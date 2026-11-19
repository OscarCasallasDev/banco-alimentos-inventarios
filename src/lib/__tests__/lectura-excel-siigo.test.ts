/**
 * Pruebas — Lectura del Excel de Siigo Pyme (bodega por código numérico)
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Usa un Excel pequeño con datos controlados (se construye en memoria, sin
 * tocar la base de datos) para verificar que:
 *   - La bodega se toma del CÓDIGO NUMÉRICO (columna B).
 *   - Los rótulos textuales de las columnas A y C NO cambian la bodega.
 *   - El producto se toma de la columna G, conservando sus ceros.
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseResumenReport,
  isResumenReport,
  normalizeProductCode,
} from "@/lib/siigo/import/resumen-parser";

/** Encabezados del reporte resumido (fila 7). */
const HEADERS = [
  "BODEGA", // A  rótulo de bodega
  "BODEGA", // B  CÓDIGO NUMÉRICO de bodega
  "DESCRIPCION", // C  nombre de la bodega
  "UBICACION", // D
  "UBICACION", // E  código de ubicación
  "DESCRIPCION", // F
  "PRODUCTO", // G  código del producto
  "DESCRIPCION", // H  nombre del producto
  "CANTIDAD ENTRADAS", // I
  "CANTIDAD-2 ENTRADAS", // J
  "VALOR ENTRADAS", // K
  "CANTIDAD SALIDAS", // L
  "CANTIDAD-2 SALIDAS", // M
  "VALOR SALIDAS", // N
  "", // O  diferencia
];

/** Celda de texto: conserva los ceros iniciales del código. */
function texto(valor: string) {
  return { t: "s" as const, v: valor };
}

/** Construye un reporte resumido controlado. */
function construirReporte(filas: unknown[][]): Buffer {
  const filasCompletas: unknown[][] = [
    ["RESUMEN DE MOVIMIENTO POR BODEGA"], // fila 1
    ["Reporte de prueba"], // fila 2
    [], // fila 3
    ["De : ENE 1/2026  A : NOV 30/2026"], // fila 4
    ["Procesado en: 2026-11-19 10:00:00"], // fila 5
    [], // fila 6
    HEADERS, // fila 7
    ...filas, // fila 8+
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(filasCompletas as string[][]);
  XLSX.utils.book_append_sheet(wb, ws, "Informe");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Lectura del Excel de Siigo (bodega por código numérico)", () => {
  const filas = [
    // A (rótulo)         B (código)  C (descripción)        D  E   F     G (producto)           H (descripción)   I(entradas) J K L(salidas) M N  O(dif)
    [texto("0001 PRINCIPAL"), 1, texto("Principal"), texto("U1"), 1, texto("Estante 1"), texto("001000100001"), texto("Cobertura de chocolate"), 50, 0, 0, 0, 0, 0, 50],
    [texto("0001 CAMPANA"), 1, texto("Campaña Juntos Somos Más Fuertes"), texto("U4"), 4, texto("Estante 4"), texto("001000100001"), texto("Cobertura de chocolate"), 50, 0, 0, 0, 0, 0, 50],
    [texto("0002 PRINCIPAL"), 2, texto("Bodega secundaria"), texto("U1"), 1, texto("Estante 1"), texto("001000100001"), texto("Cobertura de chocolate"), 30, 0, 0, 0, 0, 0, 30],
    [texto("0003 OTRA"), 3, texto("Otra descripción"), texto("U1"), 1, texto("Estante 1"), texto("001000100001"), texto("Cobertura de chocolate"), 20, 0, 0, 0, 0, 0, 20],
    [texto("0001 PRINCIPAL"), 1, texto("Principal"), texto("U1"), 1, texto("Estante 1"), texto("002000100001"), texto("Cobertura de chocolate"), 20, 0, 0, 0, 0, 0, 20],
  ];

  const buffer = construirReporte(filas);
  const resultado = parseResumenReport(buffer);

  it("reconoce el archivo como reporte resumido por bodega", () => {
    expect(isResumenReport(buffer)).toBe(true);
  });

  it("toma la bodega del código numérico de la columna B", () => {
    const bodegas = resultado.rows.map((r) => r.bodegaCode);
    expect(bodegas).toEqual([1, 1, 2, 3, 1]);
  });

  it("ignora los rótulos textuales de las columnas A y C", () => {
    // Las dos primeras filas tienen rótulos distintos pero el MISMO código.
    expect(resultado.rows[0].bodegaName).toBe("Principal");
    expect(resultado.rows[1].bodegaName).toContain("Campaña");
    expect(resultado.rows[0].bodegaCode).toBe(resultado.rows[1].bodegaCode);
  });

  it("toma el código del producto de la columna G", () => {
    // 12 dígitos: no encaja en el formato de 13 de Siigo, así que se
    // conserva tal cual, con sus ceros iniciales.
    expect(resultado.rows[0].productCode).toBe("001000100001");
    expect(resultado.rows[0].productName).toBe("Cobertura de chocolate");
  });

  it("conserva los ceros iniciales del código de producto", () => {
    // El código llega como texto: no debe convertirse en número (lo que
    // eliminaría los ceros iniciales: "001000100001" → "1000100001").
    expect(resultado.rows[0].productCode).toBe("001000100001");
    expect(resultado.rows[0].productCode).toHaveLength(12);
    expect(resultado.rows[4].productCode).toBe("002000100001");
  });

  it("no une productos con códigos distintos aunque compartan nombre", () => {
    const codigos = new Set(resultado.rows.map((r) => r.productCode));
    expect(codigos.size).toBe(2);
  });

  it("conserva las entradas, salidas y la diferencia reportada", () => {
    expect(resultado.rows[0].qtyIn).toBe(50);
    expect(resultado.rows[0].qtyOut).toBe(0);
    expect(resultado.rows[0].netQuantity).toBe(50);
    expect(resultado.rows[0].computedDifference).toBe(50);
  });

  it("normaliza el código de Siigo al formato canónico", () => {
    expect(normalizeProductCode("001-0001-000001")).toBe("001-0001-000001");
    expect(normalizeProductCode("0010001000001")).toBe("001-0001-000001");
  });
});
