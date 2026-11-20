/**
 * Pruebas — Cálculo de existencias del reporte resumen de Siigo Pyme
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * REGLA DEL BANCO:
 *
 *     existencia = Σ(ENTRADAS, col I) − Σ(SALIDAS, col L)
 *
 * agrupado por CÓDIGO DE PRODUCTO (col G) + CÓDIGO DE BODEGA (col B).
 *
 * Las columnas D, E, F (ubicación) se ignoran y la columna O no se usa para
 * el cálculo.
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseResumenReport,
  type ResumenRow,
} from "@/lib/siigo/import/resumen-parser";
import { round3 } from "@/lib/services/stock.service";

const HEADERS = [
  "BODEGA", // A  rótulo
  "BODEGA", // B  código numérico
  "DESCRIPCION", // C  descripción
  "UBICACION", // D  (ignorado)
  "UBICACION", // E  (ignorado)
  "DESCRIPCION", // F  (ignorado)
  "PRODUCTO", // G  código del producto
  "DESCRIPCION", // H  descripción del producto
  "CANTIDAD ENTRADAS", // I
  "CANTIDAD-2 ENTRADAS", // J  (ignorado)
  "VALOR ENTRADAS", // K  (ignorado)
  "CANTIDAD SALIDAS", // L
  "CANTIDAD-2 SALIDAS", // M  (ignorado)
  "VALOR SALIDAS", // N  (ignorado)
  "", // O  (ignorado para el cálculo)
];

function texto(valor: string) {
  return { t: "s" as const, v: valor };
}

/** Fila del reporte: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O */
type Fila = unknown[];

function construirReporte(filas: Fila[]): Buffer {
  const completas: unknown[][] = [
    ["RESUMEN DE MOVIMIENTO POR BODEGA"],
    ["Reporte de prueba"],
    [],
    ["De : ENE 1/2026  A : NOV 30/2026"],
    ["Procesado en: 2026-11-19 10:00:00"],
    [],
    HEADERS,
    ...filas,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(completas as string[][]);
  XLSX.utils.book_append_sheet(wb, ws, "Informe");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Calcula las existencias con la regla del Banco.
 *
 * Es la MISMA fórmula que aplica `importResumen` al guardar.
 */
function calcularExistencias(rows: ResumenRow[]) {
  const porGrupo = new Map<
    string,
    { productCode: string; bodegaCode: number; qtyIn: number; qtyOut: number }
  >();

  for (const row of rows) {
    const key = `${row.productCode}|${row.bodegaCode}`;
    const actual = porGrupo.get(key) ?? {
      productCode: row.productCode,
      bodegaCode: row.bodegaCode,
      qtyIn: 0,
      qtyOut: 0,
    };
    actual.qtyIn = round3(actual.qtyIn + row.qtyIn);
    actual.qtyOut = round3(actual.qtyOut + row.qtyOut);
    porGrupo.set(key, actual);
  }

  return new Map(
    [...porGrupo.entries()].map(([key, value]) => [
      key,
      round3(value.qtyIn - value.qtyOut),
    ])
  );
}

describe("Existencias del reporte resumen de Siigo Pyme", () => {
  it("ejemplo 1: suma entradas y salidas y da un resultado NEGATIVO", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Cobertura chocolate 500 GR"), 90, 0, 0, 116, 0, 0, 0],
        ["0001 PRINCIPAL", 1, "Principal", "U4", 4, "Estante 4", texto("00010001"), texto("Cobertura chocolate 500 GR"), 0, 0, 0, 6, 0, 0, 0],
      ])
    ).rows;

    const existencias = calcularExistencias(rows);

    // Entradas 90 − Salidas 122 = −32
    expect(existencias.get("00010001|1")).toBe(-32);
    expect(existencias.size).toBe(1);
  });

  it("ejemplo 2: suma entradas y salidas y da un resultado POSITIVO", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Cobertura chocolate 500 GR"), 90, 0, 0, 116, 0, 0, 0],
        ["0001 PRINCIPAL", 1, "Principal", "U4", 4, "Estante 4", texto("00010001"), texto("Cobertura chocolate 500 GR"), 90, 0, 0, 6, 0, 0, 0],
      ])
    ).rows;

    const existencias = calcularExistencias(rows);

    // Entradas 180 − Salidas 122 = 58
    expect(existencias.get("00010001|1")).toBe(58);
  });

  it("ejemplo 3: el mismo producto en dos bodegas mantiene existencias independientes", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Cobertura chocolate 500 GR"), 90, 0, 0, 20, 0, 0, 0],
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Cobertura chocolate 500 GR"), 30, 0, 0, 10, 0, 0, 0],
        ["0002 PRINCIPAL", 2, "Bodega secundaria", "U1", 1, "Estante 1", texto("00010001"), texto("Cobertura chocolate 500 GR"), 100, 0, 0, 15, 0, 0, 0],
      ])
    ).rows;

    const existencias = calcularExistencias(rows);

    // Bodega 1: (90 + 30) − (20 + 10) = 90
    expect(existencias.get("00010001|1")).toBe(90);
    // Bodega 2: 100 − 15 = 85
    expect(existencias.get("00010001|2")).toBe(85);
    expect(existencias.size).toBe(2);
  });

  it("un resultado cero se conserva como cero", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 10, 0, 0, 0],
      ])
    ).rows;

    expect(calcularExistencias(rows).get("00010001|1")).toBe(0);
  });

  it("productos con códigos distintos no se unen aunque tengan la misma descripción", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("MISMA DESCRIPCION"), 10, 0, 0, 0, 0, 0, 0],
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010002"), texto("MISMA DESCRIPCION"), 20, 0, 0, 0, 0, 0, 0],
      ])
    ).rows;

    const existencias = calcularExistencias(rows);

    expect(existencias.get("00010001|1")).toBe(10);
    expect(existencias.get("00010002|1")).toBe(20);
    expect(existencias.size).toBe(2);
  });

  it("conserva los ceros iniciales del código de producto", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
      ])
    ).rows;

    expect(rows[0].productCode).toBe("00010001");
    expect(calcularExistencias(rows).has("00010001|1")).toBe(true);
  });

  it("ignora las columnas D, E, F, J, K, M, N y O", () => {
    // Dos filas idénticas salvo la ubicación (D, E, F) y la columna O:
    // al consolidar por producto y bodega deben sumar igual.
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, "Principal", "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 999, 999, 4, 999, 999, 999],
        ["0001 PRINCIPAL", 1, "Principal", "U9", 9, "Estante 9", texto("00010001"), texto("Producto"), 10, 999, 999, 4, 999, 999, 999],
      ])
    ).rows;

    // Las ubicaciones no generan grupos distintos.
    expect(calcularExistencias(rows).size).toBe(1);
    expect(calcularExistencias(rows).get("00010001|1")).toBe(12);
    // La columna O no influye en el cálculo.
    expect(rows[0].netQuantity).toBe(6);
  });

  it("rechaza los códigos de bodega fuera del rango 1-7 e informa", () => {
    const resultado = parseResumenReport(
      construirReporte([
        ["0008 OTRA", 8, "Bodega fuera de rango", "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
        ["0000 CERO", 0, "Bodega cero", "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
      ])
    );

    // Ninguna fila se asigna a ninguna bodega.
    expect(resultado.rows).toHaveLength(0);
    expect(
      resultado.issues.filter((i) => i.code === "BODEGA_INVALIDA")
    ).toHaveLength(2);
  });

  it("agrupa los nombres de una misma bodega numérica", () => {
    const rows = parseResumenReport(
      construirReporte([
        ["0001 PRINCIPAL", 1, texto("PRINCIPAL"), "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
        ["0001 PRINCIPAL", 1, texto("CAMPAÑA JUNTOS SOMOS MÁS FUERTES"), "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
        ["0002 OTRA", 2, texto("BODEGA PROPIA"), "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
        ["0002 OTRA", 2, texto("CAMPAÑA"), "U1", 1, "Estante 1", texto("00010001"), texto("Producto"), 10, 0, 0, 0, 0, 0, 0],
      ])
    ).rows;

    const porBodega = new Map<number, Set<string>>();
    for (const row of rows) {
      const set = porBodega.get(row.bodegaCode) ?? new Set<string>();
      set.add(row.bodegaName);
      set.add(row.bodegaLabel);
      porBodega.set(row.bodegaCode, set);
    }

    // La bodega 1 tiene dos nombres distintos y sigue siendo UNA bodega.
    expect(porBodega.get(1)?.size).toBe(3);
    expect(porBodega.get(2)?.size).toBe(3);
    // Dos bodegas en total, no cuatro.
    expect(porBodega.size).toBe(2);
  });
});
