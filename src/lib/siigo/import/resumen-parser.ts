/**
 * Lector del reporte «RESUMEN DE MOVIMIENTO POR BODEGA» de Siigo Pyme.
 *
 * Estructura real del archivo (inspeccionada en el archivo del Banco):
 *
 *   Hoja  : "Informe"          (A1:O2235)
 *   Fila 1: título + N1 = fecha del reporte (NOV/09/2026)
 *   Fila 2: "RESUMEN DE MOVIMIENTO POR BODEGA"
 *   Fila 4: periodo  ("De : ENE 1/2026  A : NOV 30/2026")
 *   Fila 5: "Procesado en: ..."
 *   Fila 7: ENCABEZADOS
 *   Fila 8+: datos, y al final filas de totales.
 *
 * Columnas:
 *   A  BODEGA (rótulo compuesto, p.ej. "0001 PRINCIPAL")
 *   B  BODEGA (código numérico)
 *   C  DESCRIPCION (nombre de la bodega)
 *   D  UBICACION (rótulo compuesto)
 *   E  UBICACION (código)
 *   F  DESCRIPCION (nombre de la ubicación)
 *   G  PRODUCTO (código del producto)
 *   H  DESCRIPCION (nombre del producto)
 *   I  CANTIDAD ENTRADAS
 *   J  CANTIDAD-2 ENTRADAS (segunda unidad)
 *   K  VALOR ENTRADAS
 *   L  CANTIDAD SALIDAS
 *   M  CANTIDAD-2 SALIDAS (segunda unidad)
 *   N  VALOR SALIDAS
 *   O  (sin encabezado) diferencia entre entradas y salidas
 *
 * ⚠️ ADVERTENCIA CRÍTICA
 *
 *   Este reporte es un RESUMEN DE MOVIMIENTOS de un periodo. La columna O
 *   es `CANTIDAD ENTRADAS − CANTIDAD SALIDAS` (verificado: coincide en las
 *   2.209 filas de datos), es decir, el MOVIMIENTO NETO del periodo.
 *
 *   NO es el inventario disponible: el archivo no trae saldo inicial ni
 *   saldo final. Por eso estas filas se guardan como MOVIMIENTOS y nunca
 *   como existencias. Las existencias solo pueden venir del reporte
 *   detallado (que sí trae `CANT. ANTERIOR`).
 */

import { SIIGO_COLUMN_COUNT } from "./columns";
import { cellNumber, cellText, openWorkbook } from "./xlsx-reader";
import { round3 } from "./parser";

/** Fila de encabezados del reporte resumido. */
export const RESUMEN_HEADER_ROW = 7;

/** Nombre de la hoja del reporte resumido. */
export const RESUMEN_SHEET = "Informe";

/**
 * Normaliza el código de producto al formato canónico `LIN-GRUP-ELEMEN`.
 *
 * Siigo usa dos codificaciones según el reporte:
 *
 *   - Reporte DETALLADO: "001-0001-000001" (con guiones)
 *   - Reporte RESUMEN:   "0010001000001" (13 dígitos, sin guiones)
 *
 * Son el MISMO producto. Sin normalizar, el catálogo tendría cada producto
 * duplicado y el inventario mostraría existencias inconsistentes.
 *
 *   001 | 0001 | 000001  →  001-0001-000001
 */
export function normalizeProductCode(code: string): string {
  const clean = code.trim();
  if (/^\d{3}-\d{4}-\d{6}$/.test(clean)) return clean;
  const match = /^(\d{3})(\d{4})(\d{6})$/.exec(clean);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return clean;
}

export interface ResumenRow {
  rowNumber: number;
  /** Código de bodega (numérico, tal como viene de Siigo). */
  bodegaCode: number;
  /** Nombre de la bodega (puede venir truncado en el reporte). */
  bodegaName: string;
  /** Código de ubicación. */
  locationCode: number;
  /** Nombre de la ubicación. */
  locationName: string;
  /** Código de producto (identificador estable). */
  productCode: string;
  /** Descripción del producto. */
  productName: string;
  qtyIn: number;
  qtyOut: number;
  /**
   * Diferencia entre entradas y salidas (columna O del reporte).
   *
   * Es el dato que el Banco entrega como «cantidad». NO es el saldo
   * físico: es el movimiento neto del periodo del reporte.
   */
  netQuantity: number;
  /** Entradas − salidas calculado (contraste de la columna O). */
  computedDifference: number;
}

export interface ResumenParseResult {
  rows: ResumenRow[];
  meta: {
    title: string;
    subtitle: string;
    periodFrom: string | null;
    periodTo: string | null;
    generatedAt: string | null;
    reportDate: string | null;
    sheetNames: string[];
  };
  stats: {
    scannedRows: number;
    dataRows: number;
    skippedTotalRows: number;
    /** Filas sin c?digo de producto (vac?as o de relleno). */
    skippedEmptyRows: number;
    warehouses: number;
    locations: number;
    products: number;
  };
  issues: { code: string; message: string; rowNumber?: number }[];
}

/** Convierte un rótulo de Siigo en fecha ISO (ej. "NOV/09/2026"). */
function parseSiigoDate(text: string): string | null {
  const months: Record<string, string> = {
    ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  };
  const match = /^([A-Za-z]{3})[/-](\d{1,2})[/-](\d{4})$/.exec(text.trim());
  if (!match) return null;
  const month = months[match[1].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}

/** Convierte "ENE  1/2026" (periodo de Siigo) a 'YYYY-MM'. */
function parseSiigoMonth(text: string): string | null {
  const months: Record<string, string> = {
    ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  };
  const match = /([A-Za-z]{3})\s*(\d{1,2})\/(\d{4})/.exec(text);
  if (!match) return null;
  const month = months[match[1].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-01`;
}

/** Indica si el archivo es el reporte resumido por bodega. */
export function isResumenReport(buffer: Buffer): boolean {
  try {
    const workbook = openWorkbook(buffer, RESUMEN_HEADER_ROW + 2);
    const sheet =
      workbook.getSheet(RESUMEN_SHEET) ?? workbook.getSheet(workbook.sheetNames[0]);
    if (!sheet) return false;
    const header = sheet.rows[RESUMEN_HEADER_ROW - 1] ?? [];
    const headers = header.map((cell) => cellText(cell).trim().toUpperCase());
    return (
      headers.includes("BODEGA") &&
      headers.includes("PRODUCTO") &&
      headers.includes("CANTIDAD ENTRADAS")
    );
  } catch {
    return false;
  }
}

/**
 * Interpreta el reporte resumido por bodega.
 */
export function parseResumenReport(buffer: Buffer): ResumenParseResult {
  const workbook = openWorkbook(buffer);
  const sheet =
    workbook.getSheet(RESUMEN_SHEET) ?? workbook.getSheet(workbook.sheetNames[0]);

  if (!sheet) {
    throw new Error(
      `El archivo no contiene la hoja "${RESUMEN_SHEET}". Hojas encontradas: ${workbook.sheetNames.join(", ")}`
    );
  }

  const rows: ResumenRow[] = [];
  const issues: ResumenParseResult["issues"] = [];
  const warehouses = new Set<string>();
  const locations = new Set<string>();
  const products = new Set<string>();

  let scannedRows = 0;
  let skippedTotalRows = 0;
  let skippedEmptyRows = 0;

  const lastRow = sheet.rows.length;
  for (let index = RESUMEN_HEADER_ROW; index < lastRow; index++) {
    const cells = sheet.rows[index];
    if (!cells || cells.length === 0) continue;
    scannedRows++;

    const rowNumber = index + 1;
    const labelA = cellText(cells[0]).trim();
    // El código se normaliza al formato canónico LIN-GRUP-ELEMEN para que
    // el reporte resumido y el detallado se refieran al MISMO producto.
    const productCode = normalizeProductCode(cellText(cells[6]));

    // Filas de totales: "Total 0007 Bodega alterna", "Total general".
    if (
      labelA.toUpperCase().startsWith("TOTAL ") ||
      labelA.toUpperCase() === "TOTAL GENERAL"
    ) {
      skippedTotalRows++;
      continue;
    }

    // Sin código de producto no es una fila de datos.
    if (!productCode) {
      skippedEmptyRows++;
      continue;
    }

    const bodegaCode = Math.trunc(cellNumber(cells[1]));
    const bodegaName = cellText(cells[2]).trim();
    const locationCode = Math.trunc(cellNumber(cells[4]));
    const locationName = cellText(cells[5]).trim();
    const productName = cellText(cells[7]).trim();

    if (!Number.isFinite(bodegaCode) || bodegaCode < 0) {
      issues.push({
        code: "BODEGA_INVALIDA",
        message: `BODEGA inválida en la fila ${rowNumber}.`,
        rowNumber,
      });
      continue;
    }
    if (!productName) {
      issues.push({
        code: "PRODUCTO_SIN_DESCRIPCION",
        message: `El producto ${productCode} no trae descripción.`,
        rowNumber,
      });
    }

    // Columnas J (9), K (10), M (12) y N (13) se IGNORAN por completo:
    // corresponden a la segunda unidad y a los valores, y no participan
    // en la actualización solicitada.
    const qtyIn = round3(cellNumber(cells[8])); // I — entradas
    const qtyOut = round3(cellNumber(cells[11])); // L — salidas

    // La columna O es la diferencia que entrega Siigo. En 3 filas del
    // archivo real llega vacía: en ese caso se usa I − L como respaldo.
    const hasDifference =
      cells[14] !== undefined && cellText(cells[14]).trim() !== "";
    const computedDifference = round3(qtyIn - qtyOut);
    const netQuantity = round3(
      hasDifference ? cellNumber(cells[14]) : computedDifference
    );

    if (hasDifference && Math.abs(netQuantity - computedDifference) > 0.001) {
      issues.push({
        code: "DIFERENCIA_NO_COINCIDE",
        message:
          `La columna O (${netQuantity}) no coincide con I ? L (${computedDifference}) en la fila ${rowNumber}. Se usa la columna O.`,
        rowNumber,
      });
    }

    rows.push({
      rowNumber,
      bodegaCode,
      bodegaName,
      locationCode,
      locationName,
      productCode,
      productName,
      qtyIn,
      qtyOut,
      netQuantity,
      computedDifference,
    });

    warehouses.add(String(bodegaCode));
    locations.add(`${bodegaCode}|${locationCode}`);
    products.add(productCode);
  }

  // Metadatos del reporte.
  const row1 = sheet.rows[0] ?? [];
  const row2 = sheet.rows[1] ?? [];
  const row4 = sheet.rows[3] ?? [];
  const row5 = sheet.rows[4] ?? [];

  const periodText = cellText(row4[0]);
  const periodMatch =
    /De\s*:\s*([A-Za-z]{3})\s*(\d{1,2})\/(\d{4}).*?A\s*:\s*([A-Za-z]{3})\s*(\d{1,2})\/(\d{4})/i.exec(
      periodText
    );

  const periodFrom = periodMatch
    ? parseSiigoMonth(`${periodMatch[1]} ${periodMatch[2]}/${periodMatch[3]}`)
    : null;
  const periodTo = periodMatch
    ? parseSiigoMonth(`${periodMatch[4]} ${periodMatch[5]}/${periodMatch[6]}`)
    : null;

  const generatedText = cellText(row5[0]);
  const generatedMatch = /Procesado en:\s*(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(
    generatedText
  );

  return {
    rows,
    meta: {
      title: cellText(row1[0]).trim(),
      subtitle: cellText(row2[0]).trim(),
      periodFrom,
      periodTo,
      generatedAt: generatedMatch
        ? `${generatedMatch[1]}-${generatedMatch[2]}-${generatedMatch[3]}T${generatedMatch[4]}:${generatedMatch[5]}:${generatedMatch[6]}`
        : null,
      reportDate: parseSiigoDate(cellText(row1[13])),
      sheetNames: workbook.sheetNames,
    },
    stats: {
      scannedRows,
      dataRows: rows.length,
      skippedTotalRows,
      skippedEmptyRows,
      warehouses: warehouses.size,
      locations: locations.size,
      products: products.size,
    },
    issues,
  };
}

export { SIIGO_COLUMN_COUNT };
