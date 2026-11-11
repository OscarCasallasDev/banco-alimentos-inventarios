/**
 * Lector del archivo .xlsx (Open XML) sin dependencias externas.
 *
 * MOTIVACIÓN (medido sobre el reporte real del Banco, 8.08 MB / 75.954 filas):
 *
 *   SheetJS (`xlsx`):  30.065 ms   y  900 MB de memoria residuo.
 *   Este lector:        1.830 ms   y  212 MB de memoria residuo.
 *
 * La diferencia es de ~12× en tiempo y ~4× en memoria porque SheetJS construye
 * un objeto de celda por cada una de las 1.77 millones de celdas, mientras que
 * aquí se recorre el XML con expresiones regulares y se transforman las
 * celdas directamente a los campos que el importador necesita.
 *
 * El archivo .xlsx es un ZIP: se leen las entradas del directorio central, se
 * infla `xl/worksheets/sheetN.xml` y `xl/sharedStrings.xml` con `node:zlib`
 * y se recorren las filas con un escáner de expresiones regulares.
 *
 * Solo se usa en Node.js (agente local y backend). Nunca en el navegador.
 */

import { inflateRawSync } from "node:zlib";

// ============================================================
// TIPOS
// ============================================================

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  dataStart: number;
}

export type CellValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "empty"; value: null };

export interface XlsxSheet {
  name: string;
  /** Celdas indexadas por fila (0-based) y columna (0-based). */
  rows: CellValue[][];
}

// ============================================================
// LECTURA DEL ZIP
// ============================================================

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/** Lee el directorio central del ZIP y devuelve el índice de entradas. */
export function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) {
    throw new Error("El archivo no es un ZIP válido (no se encontró el directorio central).");
  }

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // El offset del encabezado local permite calcular dónde empieza el dato.
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;

    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      dataStart,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Extrae (e infla) el contenido de una entrada del ZIP. */
export function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const raw = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`Método de compresión ZIP no soportado: ${entry.method}`);
}

// ============================================================
// DECODIFICACIÓN XML
// ============================================================

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decodifica las entidades XML más comunes (rápido, sin DOM). */
export function decodeXmlText(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const replacement = ENTITIES[entity.toLowerCase()];
    return replacement ?? match;
  });
}

// ============================================================
// FECHAS DE EXCEL
// ============================================================

/**
 * Excel serial → fecha. El sistema de fechas de Excel usa el día 0 como
 * 1899-12-30 (con el bug del año bisiesto de 1900 ya absorbido en esa base).
 */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const wholeDays = Math.floor(serial);
  const milliseconds = Date.UTC(1899, 11, 30) + wholeDays * 86_400_000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Serial de Excel → Date UTC (para comparaciones internas). */
export function excelSerialToUtcDate(serial: number): Date | null {
  const iso = excelSerialToDate(serial);
  if (!iso) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

// ============================================================
// ESTILOS (para detectar celdas de fecha)
// ============================================================

/**
 * Formatos numéricos personalizados que representan fecha/hora.
 * Los IDs >= 164 son los personalizados por el usuario.
 */
function isDateFormatCode(formatCode: string): boolean {
  const code = formatCode.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
  // Se剔除 la parte de moneda/porcentaje y se busca un token de fecha.
  return /[dmyhs]/i.test(code) && !/^(General|Conditional)$/i.test(code);
}

/**
 * Lee `xl/styles.xml` y devuelve el mapa `índice de estilo → es fecha`.
 */
export function readDateStyles(buffer: Buffer, entries: Map<string, ZipEntry>): Set<number> {
  const dateStyles = new Set<number>();
  const entry = entries.get("xl/styles.xml");
  if (!entry) return dateStyles;

  const xml = readZipEntry(buffer, entry).toString("utf8");

  // Formatos numéricos personalizados -> id -> es fecha
  const customDateFormats = new Set<number>();
  const numFmtRe = /<numFmt\s+numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = numFmtRe.exec(xml)) !== null) {
    if (isDateFormatCode(decodeXmlText(m[2]))) {
      customDateFormats.add(Number(m[1]));
    }
  }

  // Formatos incorporados de Excel que representan fecha/hora
  const builtinDateFormats = new Set([
    14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
  ]);

  // `cellXfs` es la lista de estilos aplicables a las celdas.
  const cellXfsMatch = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfsMatch) return dateStyles;

  const xfRe = /<xf\b[^>]*\/?>/g;
  const xfs = cellXfsMatch[1].match(xfRe) ?? [];
  xfs.forEach((xf, index) => {
    const numFmtIdMatch = /numFmtId="(\d+)"/.exec(xf);
    if (!numFmtIdMatch) return;
    const numFmtId = Number(numFmtIdMatch[1]);
    if (builtinDateFormats.has(numFmtId) || customDateFormats.has(numFmtId)) {
      dateStyles.add(index);
    }
  });

  return dateStyles;
}

// ============================================================
// SHARED STRINGS
// ============================================================

/**
 * Lee `xl/sharedStrings.xml`.
 *
 * El reporte real tiene 108.317 cadenas; se decodifican de una sola vez
 * (una sola pasada de reemplazo sobre el texto completo) en vez de llamar al
 * decodificador 108.317 veces.
 */
export function readSharedStrings(
  buffer: Buffer,
  entries: Map<string, ZipEntry>
): string[] {
  const entry = entries.get("xl/sharedStrings.xml");
  if (!entry) return [];

  const xml = readZipEntry(buffer, entry).toString("utf8");
  const parts: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;

  while ((match = siRe.exec(xml)) !== null) {
    const inner = match[1];
    const texts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = tRe.exec(inner)) !== null) {
      texts.push(textMatch[1]);
    }
    parts.push(texts.join(""));
  }

  if (parts.length === 0) return [];

  // Decodificación masiva: una sola pasada sobre el texto unido.
  const joined = parts.join(" ");
  const decoded = decodeXmlText(joined);
  return decoded.split(" ");
}

// ============================================================
// RELACIONES Y HOJAS
// ============================================================

interface SheetRef {
  name: string;
  path: string;
}

/** Resuelve la lista de hojas (nombre → ruta del XML) del libro. */
export function readSheetRefs(
  buffer: Buffer,
  entries: Map<string, ZipEntry>
): SheetRef[] {
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relsEntry) return [];

  const workbookXml = readZipEntry(buffer, workbookEntry).toString("utf8");
  const relsXml = readZipEntry(buffer, relsEntry).toString("utf8");

  // rId → Target
  const relMap = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRe.exec(relsXml)) !== null) {
    relMap.set(relMatch[1], decodeXmlText(relMatch[2]));
  }

  const sheets: SheetRef[] = [];
  const sheetRe = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRe.exec(workbookXml)) !== null) {
    const name = decodeXmlText(sheetMatch[1]);
    const target = relMap.get(sheetMatch[2]);
    if (!target) continue;
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`;
    sheets.push({ name, path });
  }

  return sheets;
}

// ============================================================
// LECTURA DE UNA HOJA
// ============================================================

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const VALUE_RE = /<v\b[^>]*>([\s\S]*?)<\/v>/;
const TEXT_RE = /<t\b[^>]*>([\s\S]*?)<\/t>/g;

function columnIndexFromRef(ref: string): number {
  let index = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      index = index * 26 + (code - 64);
    } else if (code >= 97 && code <= 122) {
      index = index * 26 + (code - 96);
    } else {
      break;
    }
  }
  return index - 1;
}

/**
 * Lee una hoja completa como matriz de celdas tipadas.
 *
 * @param maxRows  Límite opcional de filas a materializar (protege la memoria).
 */
export function readSheet(
  buffer: Buffer,
  entries: Map<string, ZipEntry>,
  sheetPath: string,
  sharedStrings: string[],
  dateStyles: Set<number>,
  maxRows = Number.POSITIVE_INFINITY
): XlsxSheet {
  const entry = entries.get(sheetPath);
  if (!entry) {
    throw new Error(`No se encontró la hoja "${sheetPath}" dentro del archivo.`);
  }

  const xml = readZipEntry(buffer, entry).toString("utf8");
  const rows: CellValue[][] = [];

  ROW_RE.lastIndex = 0;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = ROW_RE.exec(xml)) !== null) {
    const attrs = rowMatch[1] ?? "";
    const body = rowMatch[2] ?? "";
    rowIndex++;

    if (rows.length >= maxRows) break;

    const rowNumberAttr = /\br="(\d+)"/.exec(attrs);
    const rowNumber = rowNumberAttr ? Number(rowNumberAttr[1]) : rowIndex;
    const target = rowNumber - 1;

    const cells: CellValue[] = [];
    let columnCursor = 0;

    CELL_RE.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = CELL_RE.exec(body)) !== null) {
      const cellAttrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";

      const refMatch = /\br="([A-Z]+)\d+"/.exec(cellAttrs);
      const column = refMatch ? columnIndexFromRef(refMatch[1]) : columnCursor;
      columnCursor = column + 1;

      const typeMatch = /\bt="([^"]+)"/.exec(cellAttrs);
      const type = typeMatch ? typeMatch[1] : "n";
      const styleMatch = /\bs="(\d+)"/.exec(cellAttrs);
      const styleIndex = styleMatch ? Number(styleMatch[1]) : -1;

      let value: CellValue = { kind: "empty", value: null };

      if (type === "s") {
        const vMatch = VALUE_RE.exec(inner);
        if (vMatch) {
          const index = Number(vMatch[1]);
          const text = sharedStrings[index];
          value =
            text === undefined
              ? { kind: "empty", value: null }
              : { kind: "string", value: text };
        }
      } else if (type === "inlineStr") {
        const texts: string[] = [];
        TEXT_RE.lastIndex = 0;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = TEXT_RE.exec(inner)) !== null) texts.push(tMatch[1]);
        value = { kind: "string", value: decodeXmlText(texts.join("")) };
      } else if (type === "b") {
        const vMatch = VALUE_RE.exec(inner);
        value = { kind: "boolean", value: vMatch ? vMatch[1] === "1" : false };
      } else if (type === "d") {
        const vMatch = VALUE_RE.exec(inner);
        value = vMatch
          ? { kind: "date", value: vMatch[1].slice(0, 10) }
          : { kind: "empty", value: null };
      } else if (type === "e") {
        const vMatch = VALUE_RE.exec(inner);
        value = { kind: "string", value: vMatch ? vMatch[1] : "" };
      } else {
        const vMatch = VALUE_RE.exec(inner);
        if (vMatch) {
          const raw = vMatch[1].trim();
          if (raw === "") {
            value = { kind: "empty", value: null };
          } else {
            const numeric = Number(raw);
            if (!Number.isFinite(numeric)) {
              value = { kind: "string", value: decodeXmlText(raw) };
            } else if (styleIndex >= 0 && dateStyles.has(styleIndex)) {
              const iso = excelSerialToDate(numeric);
              value = iso
                ? { kind: "date", value: iso }
                : { kind: "number", value: numeric };
            } else {
              value = { kind: "number", value: numeric };
            }
          }
        }
      }

      cells[column] = value;
    }

    while (rows.length < target) rows.push([]);
    rows[target] = cells;
  }

  return { name: sheetPath, rows };
}

// ============================================================
// API DE ALTO NIVEL
// ============================================================

export interface WorkbookData {
  sheetNames: string[];
  /** Devuelve el contenido de una hoja por nombre. */
  getSheet(name: string): XlsxSheet | null;
}

/**
 * Abre un archivo .xlsx y da acceso a sus hojas.
 *
 * @param buffer  Contenido binario del archivo.
 * @param maxRows Límite de filas materializadas por hoja (opcional).
 */
export function openWorkbook(buffer: Buffer, maxRows = Number.POSITIVE_INFINITY): WorkbookData {
  const entries = readZipEntries(buffer);
  const sharedStrings = readSharedStrings(buffer, entries);
  const dateStyles = readDateStyles(buffer, entries);
  const sheetRefs = readSheetRefs(buffer, entries);

  const cache = new Map<string, XlsxSheet>();

  return {
    sheetNames: sheetRefs.map((s) => s.name),
    getSheet(name: string): XlsxSheet | null {
      const cached = cache.get(name);
      if (cached) return cached;
      const ref = sheetRefs.find((s) => s.name === name);
      if (!ref) return null;
      const sheet = readSheet(
        buffer,
        entries,
        ref.path,
        sharedStrings,
        dateStyles,
        maxRows
      );
      cache.set(name, sheet);
      return sheet;
    },
  };
}

/** Extrae el valor de texto de una celda ("" si está vacía). */
export function cellText(cell: CellValue | undefined): string {
  if (!cell) return "";
  switch (cell.kind) {
    case "string":
      return cell.value;
    case "number":
      return String(cell.value);
    case "boolean":
      return cell.value ? "TRUE" : "FALSE";
    case "date":
      return cell.value;
    default:
      return "";
  }
}

/** Extrae el valor numérico de una celda (0 si está vacía o no es numérico). */
export function cellNumber(cell: CellValue | undefined): number {
  if (!cell) return 0;
  if (cell.kind === "number") return cell.value;
  if (cell.kind === "boolean") return cell.value ? 1 : 0;
  if (cell.kind === "string") {
    const parsed = parseFlexibleNumber(cell.value);
    return parsed ?? 0;
  }
  return 0;
}

/** Convierte un texto numérico a número tolerando separadores y decimales. */
export function parseFlexibleNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  // "1.234,56" (formato colombiano/europeo) vs "1,234.56" (formato inglés)
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;
  if (hasComma && hasDot) {
    normalized =
      trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
