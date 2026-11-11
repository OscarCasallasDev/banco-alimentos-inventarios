/**
 * Importador del reporte de inventario de Siigo Pyme.
 *
 * Convierte el "Reporte detallado de inventarios x bodega" en filas de
 * movimiento normalizadas, listas para persistir.
 *
 * SEMÁNTICA VERIFICADA SOBRE EL ARCHIVO REAL DEL BANCO
 * (75.954 filas de datos crudos, 65.832 filas de movimiento):
 *
 *  - `CANTIDAD`    = ENTRADAS − SALIDAS (neto del movimiento). NO es el saldo.
 *  - `ACUM CANTIDAD` = acumulado corrido dentro del grupo
 *                    (producto, bodega, ubicación). NO se suma entre filas.
 *  - `CANT. ANTERIOR` = saldo inicial del grupo (constante en todas sus filas).
 *  - La fila con FECHA `0000/00/00` es la APERTURA del grupo: trae el saldo
 *    inicial y no es un movimiento.
 *  - Las filas cuyo rótulo de producto o de bodega empieza con `Total `
 *    son SUBTOTALES: se descartan.
 *  - `REFERENCIA` es la clasificación del ítem (texto con variantes
 *    ortográficas). NO es el código del producto.
 *  - `LIN-GRUP-ELEMEN` es el código del producto (1:1 con `NOMBRE ELEMENTO`).
 *  - `ENTRADAS 2` / `SALIDAS 2` / `SALDO 2` son la segunda unidad de medida:
 *    se capturan cuando vienen diligenciadas, pero NO se usan en el cálculo
 *    del saldo (no hay columna de saldo inicial de la segunda unidad).
 */

import {
  SIIGO_COLUMNS,
  SIIGO_FORMULA_SHEET,
  SIIGO_HEADER_ROW,
  SIIGO_HEADERS,
  SIIGO_MAIN_SHEET,
  normalizeHeader,
} from "./columns";
import {
  cellText,
  openWorkbook,
  parseFlexibleNumber,
  type CellValue,
  type XlsxSheet,
} from "./xlsx-reader";

// ============================================================
// TIPOS
// ============================================================

export type SiigoRowKind = "data" | "subtotal" | "total" | "blank";

export interface SiigoMovementRow {
  /** Número de fila en el Excel (1-based, como lo ve el usuario). */
  rowNumber: number;
  /** LIN-GRUP-ELEMEN: clave estable del producto. */
  productCode: string;
  lin: number | null;
  grup: number | null;
  elemet: number | null;
  productName: string;
  /** REFERENCIA: clasificación del ítem (texto, no clave). */
  reference: string;
  unit: string;
  brand: string;
  description: string;
  document: string;
  documentType: string | null;
  documentNumber: string | null;
  documentSequence: string | null;
  /** 'YYYY-MM-DD' o null en la fila de apertura. */
  date: string | null;
  isOpening: boolean;
  bodega: number;
  ubicacion: number;
  qtyBefore: number;
  valueMovement: number;
  qtyIn: number;
  valueIn: number;
  qtyOut: number;
  valueOut: number;
  qtyNet: number;
  qtyAccum: number;
  qty2In: number;
  qty2Out: number;
  qty2Balance: number;
}

export interface SiigoReportMeta {
  title: string;
  subtitle: string;
  periodFrom: string | null;
  periodTo: string | null;
  generatedAt: string | null;
  reportDate: string | null;
  includingClassifications: boolean;
  sheetNames: string[];
  hasFormulaSheet: boolean;
}

export interface SiigoParseIssue {
  code: string;
  message: string;
  rowNumber?: number;
}

export interface SiigoParseResult {
  meta: SiigoReportMeta;
  rows: SiigoMovementRow[];
  issues: SiigoParseIssue[];
  stats: {
    /** Filas leídas desde la fila de encabezados hacia abajo. */
    scannedRows: number;
    /** Filas de movimiento (incluidas las de apertura). */
    dataRows: number;
    /** Filas de apertura (FECHA = 0000/00/00). */
    openingRows: number;
    /** Filas de subtotal descartadas. */
    skippedSubtotalRows: number;
    /** Filas totalmente vacías. */
    skippedBlankRows: number;
  };
}

/** Fila con el tipo detectado y los valores crudos (para diagnóstico). */
export interface SiigoClassifiedRow {
  rowNumber: number;
  kind: SiigoRowKind;
  cells: CellValue[];
}

// ============================================================
// UTILIDADES
// ============================================================

/** Redondea a 3 decimales evitando el ruido de coma flotante. */
export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Extrae la fecha del encabezado A3: "De: 2026/01/01     A: 2026/08/27". */
export function parsePeriodHeader(text: string): {
  from: string | null;
  to: string | null;
} {
  const from = /De:\s*(\d{4})[/-](\d{2})[/-](\d{2})/i.exec(text);
  const to = /\bA:\s*(\d{4})[/-](\d{2})[/-](\d{2})/i.exec(text);
  const normalize = (m: RegExpExecArray | null): string | null =>
    m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return { from: normalize(from), to: normalize(to) };
}

/**
 * Extrae la fecha de proceso del encabezado A5: "Procesado en: 2026/08/27  09:21:14:57".
 *
 * Se devuelve en formato ISO 8601 válido. Siigo escribe la hora como
 * HH:MM:SS:CC (con centisegundos tras dos puntos); se normaliza a
 * HH:MM:SS.CC para que sea parseable por `new Date()`.
 */
export function parseGeneratedAt(text: string): string | null {
  const m = /Procesado en:\s*(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?::(\d{2}))?/i.exec(
    text
  );
  if (!m) return null;
  const centiseconds = m[7] ? `.${m[7]}` : "";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${centiseconds}`;
}

/** Extrae la fecha del reporte del encabezado Z1: "AGO/27/2026". */
export function parseReportDate(text: string): string | null {
  const months: Record<string, string> = {
    ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
    jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  };
  const m = /^([A-Za-z]{3})[/-](\d{1,2})[/-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = months[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].length === 1 ? `0${m[2]}` : m[2]}`;
}

/**
 * Divide el DOCUMENTO de Siigo: "F-001 00000044711-0045".
 * Tipo `F-001`, número `00000044711`, secuencia `0045`.
 */
export function parseDocument(raw: string): {
  type: string | null;
  number: string | null;
  sequence: string | null;
} {
  const match = /^([A-Z]-\d{3})\s+(\d{11})-(\d{4})$/.exec(raw.trim());
  if (!match) {
    const simple = /^([A-Z]-\d{3})$/.exec(raw.trim());
    return { type: simple ? simple[1] : null, number: null, sequence: null };
  }
  return { type: match[1], number: match[2], sequence: match[3] };
}

/** Formato válido de PRODUCT_CODE: `NNN-NNNN-NNNNNN`. */
export const PRODUCT_CODE_PATTERN = /^\d{3}-\d{4}-\d{6}$/;

/** Formato válido de DOCUMENTO de Siigo. */
export const DOCUMENT_PATTERN = /^[A-Z]-\d{3}\s+\d{11}-\d{4}$/;

// ============================================================
// CLASIFICACIÓN DE FILAS
// ============================================================

/**
 * Determina el tipo de una fila del reporte.
 *
 *  - `total`    : fila "Total general" o "Total <código de producto>".
 *  - `subtotal` : fila "Total <código de bodega>" (rótulo en la columna BODEGA).
 *  - `blank`    : fila sin contenido.
 *  - `data`     : fila de movimiento o de apertura.
 */
export function classifyRow(cells: CellValue[]): SiigoRowKind {
  const productCell = cells[SIIGO_COLUMNS.productCode];
  const bodegaCell = cells[SIIGO_COLUMNS.bodega];

  const productLabel = cellText(productCell).trim();
  const bodegaLabel = cellText(bodegaCell).trim();

  if (productLabel.toUpperCase() === "TOTAL GENERAL") return "total";
  if (productLabel.toUpperCase().startsWith("TOTAL ")) return "total";
  if (bodegaLabel.toUpperCase().startsWith("TOTAL ")) return "subtotal";
  if (productLabel === "" && bodegaLabel === "") return "blank";

  return "data";
}

// ============================================================
// LECTURA DEL REPORTE
// ============================================================

/**
 * Lee el reporte completo y devuelve las filas de movimiento normalizadas.
 *
 * @param buffer Contenido binario del .xlsx.
 */
export function parseSiigoReport(buffer: Buffer): SiigoParseResult {
  const workbook = openWorkbook(buffer);

  const mainSheet = workbook.getSheet(SIIGO_MAIN_SHEET);
  if (!mainSheet) {
    throw new Error(
      `El archivo no contiene la hoja "${SIIGO_MAIN_SHEET}". Hojas encontradas: ${workbook.sheetNames.join(", ")}`
    );
  }

  const issues: SiigoParseIssue[] = [];

  // ---------- Metadatos del reporte ----------
  const meta = readReportMeta(mainSheet, workbook.sheetNames);

  // ---------- Encabezados (fila 7) ----------
  const headerRow = mainSheet.rows[SIIGO_HEADER_ROW - 1] ?? [];
  const headerMap = mapHeaders(headerRow);

  const missing = Object.entries(SIIGO_HEADERS)
    .filter(([key, label]) => {
      if (label === "") return false;
      const typedKey = key as keyof typeof SIIGO_COLUMNS;
      return headerMap[typedKey] === undefined;
    })
    .map(([key]) => SIIGO_HEADERS[key as keyof typeof SIIGO_HEADERS]);

  if (missing.length > 0) {
    throw new Error(
      `El archivo no tiene el formato esperado. Faltan encabezados: ${missing.join(", ")}. ` +
        `Verifique que sea el reporte de Siigo Pyme "movimiento detallado de bodega por fecha".`
    );
  }

  // ---------- Recorrido de filas ----------
  const rows: SiigoMovementRow[] = [];
  let scannedRows = 0;
  let skippedSubtotalRows = 0;
  let skippedBlankRows = 0;
  let openingRows = 0;

  const startIndex = SIIGO_HEADER_ROW; // índice 0-based de la fila 8

  for (let i = startIndex; i < mainSheet.rows.length; i++) {
    const cells = mainSheet.rows[i];
    if (!cells || cells.length === 0) {
      skippedBlankRows++;
      continue;
    }
    scannedRows++;

    const kind = classifyRow(cells);
    if (kind === "total" || kind === "subtotal") {
      skippedSubtotalRows++;
      continue;
    }
    if (kind === "blank") {
      skippedBlankRows++;
      continue;
    }

    const row = toMovementRow(cells, i + 1);
    if (row.isOpening) openingRows++;
    rows.push(row);
  }

  return {
    meta,
    rows,
    issues,
    stats: {
      scannedRows,
      dataRows: rows.length,
      openingRows,
      skippedSubtotalRows,
      skippedBlankRows,
    },
  };
}

/** Lee los metadatos de las filas 1–5 y de la celda Z1. */
function readReportMeta(sheet: XlsxSheet, sheetNames: string[]): SiigoReportMeta {
  const row1 = sheet.rows[0] ?? [];
  const row2 = sheet.rows[1] ?? [];
  const row3 = sheet.rows[2] ?? [];
  const row4 = sheet.rows[3] ?? [];
  const row5 = sheet.rows[4] ?? [];

  const period = parsePeriodHeader(cellText(row3[0]));
  const generatedAt = parseGeneratedAt(cellText(row5[0]));
  const reportDate = parseReportDate(cellText(row1[25]));

  return {
    title: cellText(row1[0]).trim(),
    subtitle: cellText(row2[0]).trim(),
    periodFrom: period.from,
    periodTo: period.to,
    generatedAt,
    reportDate,
    includingClassifications: /CLASIFICACIONES/i.test(cellText(row4[0])),
    sheetNames,
    hasFormulaSheet: sheetNames.includes(SIIGO_FORMULA_SHEET),
  };
}

/**
 * Asocia cada campo del importador con el índice real de columna.
 * Se usa el encabezado leído, no una posición fija, para tolerar que Siigo
 * reordene o añada columnas.
 */
export function mapHeaders(headerCells: CellValue[]): Partial<
  Record<keyof typeof SIIGO_COLUMNS, number>
> {
  const map: Partial<Record<keyof typeof SIIGO_COLUMNS, number>> = {};

  headerCells.forEach((cell, index) => {
    const label = normalizeHeader(cellText(cell));
    if (!label) return;
    for (const [key, expected] of Object.entries(SIIGO_HEADERS)) {
      if (!expected) continue;
      if (normalizeHeader(expected) === label) {
        const typedKey = key as keyof typeof SIIGO_COLUMNS;
        if (map[typedKey] === undefined) map[typedKey] = index;
      }
    }
  });
  // Columnas whose encabezado está vacío en el reporte (VALOR ENTRADAS 2 y
  // VALOR SALIDAS 2). Se Ubican por posición relativa a las columnas con
  // nombre cuando es posible; si no, quedan undefined y se leen como 0.
  const ent2 = map.qty2In;
  if (ent2 !== undefined) {
    if (map.valueQty2In === undefined) map.valueQty2In = ent2 + 1;
    if (map.qty2Out === undefined) map.qty2Out = ent2 + 2;
    if (map.valueQty2Out === undefined) map.valueQty2Out = ent2 + 3;
    if (map.qty2Balance === undefined) map.qty2Balance = ent2 + 4;
  }

  return map;
}

/** Convierte una fila cruda en una fila de movimiento normalizada. */
export function toMovementRow(
  cells: CellValue[],
  rowNumber: number
): SiigoMovementRow {
  const get = (index: number | undefined): CellValue | undefined =>
    index === undefined ? undefined : cells[index];

  const productCode = cellText(get(SIIGO_COLUMNS.productCode)).trim();
  const document = cellText(get(SIIGO_COLUMNS.document)).trim();
  const rawDate = cellText(get(SIIGO_COLUMNS.date)).trim();
  const isOpening = rawDate === "0000/00/00" || rawDate === "";

  const doc = parseDocument(document);

  const numberAt = (index: number): number => {
    const value = get(index);
    if (!value) return 0;
    if (value.kind === "number") return value.value;
    if (value.kind === "string") return parseFlexibleNumber(value.value) ?? 0;
    return 0;
  };

  const intAt = (index: number): number | null => {
    const value = get(index);
    if (!value) return null;
    if (value.kind === "number") return Math.trunc(value.value);
    if (value.kind === "string") {
      const parsed = parseFlexibleNumber(value.value);
      return parsed === null ? null : Math.trunc(parsed);
    }
    return null;
  };

  return {
    rowNumber,
    productCode,
    lin: intAt(SIIGO_COLUMNS.lin),
    grup: intAt(SIIGO_COLUMNS.grup),
    elemet: intAt(SIIGO_COLUMNS.elemet),
    productName: cellText(get(SIIGO_COLUMNS.productName)).trim(),
    reference: cellText(get(SIIGO_COLUMNS.reference)).trim(),
    unit: cellText(get(SIIGO_COLUMNS.unit)).trim(),
    brand: cellText(get(SIIGO_COLUMNS.brand)).trim(),
    description: cellText(get(SIIGO_COLUMNS.description)).trim(),
    document,
    documentType: doc.type,
    documentNumber: doc.number,
    documentSequence: doc.sequence,
    date: isOpening ? null : normalizeDateText(rawDate),
    isOpening,
    bodega: Math.trunc(numberAt(SIIGO_COLUMNS.bodega)),
    ubicacion: Math.trunc(numberAt(SIIGO_COLUMNS.ubicacion)),
    qtyBefore: round3(numberAt(SIIGO_COLUMNS.qtyBefore)),
    valueMovement: round3(numberAt(SIIGO_COLUMNS.valueMovement)),
    qtyIn: round3(numberAt(SIIGO_COLUMNS.qtyIn)),
    valueIn: round3(numberAt(SIIGO_COLUMNS.valueIn)),
    qtyOut: round3(numberAt(SIIGO_COLUMNS.qtyOut)),
    valueOut: round3(numberAt(SIIGO_COLUMNS.valueOut)),
    qtyNet: round3(numberAt(SIIGO_COLUMNS.qtyNet)),
    qtyAccum: round3(numberAt(SIIGO_COLUMNS.qtyAccum)),
    qty2In: round3(numberAt(SIIGO_COLUMNS.qty2In)),
    qty2Out: round3(numberAt(SIIGO_COLUMNS.qty2Out)),
    qty2Balance: round3(numberAt(SIIGO_COLUMNS.qty2Balance)),
  };
}

/** Normaliza una fecha a 'YYYY-MM-DD'. */
export function normalizeDateText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "0000/00/00") return null;

  // ISO ya normalizado
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy o mm/dd/yyyy: Siigo escribe dd/mm/yyyy
  const slashes = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slashes) {
    const [, a, b, year] = slashes;
    const first = Number(a);
    const second = Number(b);
    // Si el primer componente > 12, es día; si no, se asume dd/mm (formato colombiano).
    if (first > 12) {
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
    return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
  }

  return null;
}
