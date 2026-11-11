/**
 * Validación de las filas del reporte de Siigo Pyme.
 *
 * Cada fila del archivo se valida de forma independiente. Las filas que no
 * cumplen las reglas se RECHAZAN (se registran con su motivo y no alteran el
 * inventario); las que cumplen pero tienen datos incompletos generan
 * ADVERTENCIAS que se muestran al usuario sin detener la importación.
 *
 * En el archivo real del Banco hay exactamente 1 fila inválida (la 4024, con
 * la fecha movida a la columna DOCUMENTO y la bodega con un valor inválido).
 */

import {
  DOCUMENT_PATTERN,
  PRODUCT_CODE_PATTERN,
  type SiigoMovementRow,
} from "./parser";
import { QUANTITY_EPSILON } from "./balances";

export type RejectionCode =
  | "PRODUCTO_INVALIDO"
  | "FECHA_INVALIDA"
  | "DOCUMENTO_INVALIDO"
  | "BODEGA_INVALIDA"
  | "UBICACION_INVALIDA"
  | "CANTIDAD_INCONSISTENTE"
  | "APERTURA_INVALIDA"
  | "APERTURA_SIN_SALDO_INICIAL";

export type WarningCode =
  | "UNIDAD_VACIA"
  | "UNIDAD_NO_ESTANDAR"
  | "REFERENCIA_VACIA"
  | "MARCA_VACIA"
  | "SECUNDARIA_RELLENA";

export interface RowRejection {
  rowNumber: number;
  code: RejectionCode;
  reason: string;
}

export interface RowWarning {
  rowNumber: number;
  code: WarningCode;
  reason: string;
}

export interface RowValidation {
  rejections: RowRejection[];
  warnings: RowWarning[];
}

/** Unidades de control habituales en Siigo para productos de alimentos. */
export const STANDARD_UNITS = new Set([
  "GR",
  "G",
  "KG",
  "KGM",
  "ML",
  "MLT",
  "L",
  "LTS",
  "LTR",
  "LT",
  "UN",
  "UND",
  "CMQ",
  "GE",
]);

/**
 * Salvaguarda contra Corruption de la fila: las bodegas de Siigo del reporte
 * real van de 1 a 7 y las ubicaciones de 0 a 5.
 */
export const MAX_BODEGA_CODE = 999;
export const MAX_LOCATION_CODE = 999;

/**
 * Valida una fila de movimiento.
 *
 * @param row Fila normalizada.
 * @param groupOpeningCount Cuántas filas de apertura lleva ya el grupo (para
 *        detectar más de una apertura por grupo).
 */
export function validateRow(
  row: SiigoMovementRow,
  groupOpeningCount: number
): RowValidation {
  const rejections: RowRejection[] = [];
  const warnings: RowWarning[] = [];

  // ---------- Producto ----------
  if (!PRODUCT_CODE_PATTERN.test(row.productCode)) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "PRODUCTO_INVALIDO",
      reason: `LIN-GRUP-ELEMEN inválido: "${row.productCode}". Se espera el formato NNN-NNNN-NNNNNN.`,
    });
  }

  // ---------- Fecha ----------
  if (!row.isOpening && !row.date) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "FECHA_INVALIDA",
      reason: `FECHA no interpretable: "${row.document}". No se convierte a la fecha actual.`,
    });
  }

  // ---------- Documento ----------
  if (!row.isOpening) {
    if (!row.document) {
      rejections.push({
        rowNumber: row.rowNumber,
        code: "DOCUMENTO_INVALIDO",
        reason: "DOCUMENTO vacío en una fila de movimiento.",
      });
    } else if (!DOCUMENT_PATTERN.test(row.document)) {
      rejections.push({
        rowNumber: row.rowNumber,
        code: "DOCUMENTO_INVALIDO",
        reason: `DOCUMENTO con formato inesperado: "${row.document}".`,
      });
    }
  }

  // ---------- Bodega y ubicación ----------
  if (!Number.isInteger(row.bodega) || row.bodega < 0) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "BODEGA_INVALIDA",
      reason: `BODEGA inválida: "${row.bodega}".`,
    });
  } else if (row.bodega > MAX_BODEGA_CODE) {
    // Salvaguarda: en el reporte real las bodegas de Siigo son 1..7. Un código
    // mayor indica corrupción de la fila (así viene la fila 4024 del archivo
    // real, con BODEGA = 46244).
    rejections.push({
      rowNumber: row.rowNumber,
      code: "BODEGA_INVALIDA",
      reason:
        `BODEGA fuera de rango: "${row.bodega}". El máximo admitido es ${MAX_BODEGA_CODE}.`,
    });
  }
  if (!Number.isInteger(row.ubicacion) || row.ubicacion < 0) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "UBICACION_INVALIDA",
      reason: `UBICACION inválida: "${row.ubicacion}".`,
    });
  } else if (row.ubicacion > MAX_LOCATION_CODE) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "UBICACION_INVALIDA",
      reason:
        `UBICACION fuera de rango: "${row.ubicacion}". El máximo admitido es ${MAX_LOCATION_CODE}.`,
    });
  }

  // ---------- Coherencia de cantidades ----------
  if (Math.abs(row.qtyNet - (row.qtyIn - row.qtyOut)) > QUANTITY_EPSILON) {
    rejections.push({
      rowNumber: row.rowNumber,
      code: "CANTIDAD_INCONSISTENTE",
      reason:
        `CANTIDAD (${row.qtyNet}) no corresponde a ENTRADAS − SALIDAS ` +
        `(${row.qtyIn} − ${row.qtyOut} = ${round(row.qtyIn - row.qtyOut)}).`,
    });
  }

  // ---------- Fila de apertura ----------
  if (row.isOpening) {
    if (row.qtyIn !== 0 || row.qtyOut !== 0) {
      rejections.push({
        rowNumber: row.rowNumber,
        code: "APERTURA_INVALIDA",
        reason:
          "La fila de apertura (FECHA 0000/00/00) tiene ENTRADAS o SALIDAS: no puede ser una apertura.",
      });
    }
    if (groupOpeningCount > 1) {
      rejections.push({
        rowNumber: row.rowNumber,
        code: "APERTURA_SIN_SALDO_INICIAL",
        reason: "El grupo ya tenía una fila de apertura anterior.",
      });
    }
  }

  // ---------- Advertencias (no bloquean) ----------
  if (!row.unit) {
    warnings.push({
      rowNumber: row.rowNumber,
      code: "UNIDAD_VACIA",
      reason: "La fila no trae UNIDAD; se usará la de otra fila del mismo producto.",
    });
  } else if (!STANDARD_UNITS.has(row.unit.toUpperCase())) {
    warnings.push({
      rowNumber: row.rowNumber,
      code: "UNIDAD_NO_ESTANDAR",
      reason: `UNIDAD fuera del catálogo conocido: "${row.unit}".`,
    });
  }
  if (!row.reference) {
    warnings.push({
      rowNumber: row.rowNumber,
      code: "REFERENCIA_VACIA",
      reason: "La fila no trae REFERENCIA (clasificación).",
    });
  }
  if (!row.brand) {
    warnings.push({
      rowNumber: row.rowNumber,
      code: "MARCA_VACIA",
      reason: "La fila no trae MARCA.",
    });
  }
  if (row.qty2In !== 0 || row.qty2Out !== 0 || row.qty2Balance !== 0) {
    warnings.push({
      rowNumber: row.rowNumber,
      code: "SECUNDARIA_RELLENA",
      reason:
        "La fila trae segunda unidad de medida; se conserva como dato, sin mezclar con la principal.",
    });
  }

  return { rejections, warnings };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Valida el archivo completo y separa filas admitidas de rechazadas.
 *
 * @param rows Filas normalizadas del reporte.
 */
export function validateRows(rows: SiigoMovementRow[]): {
  accepted: SiigoMovementRow[];
  rejections: RowRejection[];
  warnings: RowWarning[];
  summary: Record<string, number>;
} {
  const accepted: SiigoMovementRow[] = [];
  const rejections: RowRejection[] = [];
  const warnings: RowWarning[] = [];
  const openingCounts = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.productCode}|${row.bodega}|${row.ubicacion}`;
    const openingsSoFar = openingCounts.get(key) ?? 0;
    const result = validateRow(row, openingsSoFar);

    if (row.isOpening) openingCounts.set(key, openingsSoFar + 1);

    rejections.push(...result.rejections);
    warnings.push(...result.warnings);

    if (result.rejections.length === 0) {
      accepted.push(row);
    }
  }

  const summary: Record<string, number> = {};
  for (const rejection of rejections) {
    summary[rejection.code] = (summary[rejection.code] ?? 0) + 1;
  }

  return { accepted, rejections, warnings, summary };
}
