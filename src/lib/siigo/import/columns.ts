/**
 * Definiciones de columnas del reporte de Siigo Pyme.
 *
 * El archivo real es un "movimiento detallado de bodega por fecha" generado
 * por Siigo Pyme con clasificaciones incluidas. La hoja `Hoja1` tiene:
 *
 *   - filas 1–5 : encabezado del reporte (título, periodo, fecha de proceso)
 *   - fila 7    : encabezados de las 27 columnas
 *   - fila 8+   : datos, agrupados por producto
 *
 * Cada producto aparece como un bloque de filas (una fila de apertura + sus
 * movimientos) seguido de filas de subtotal que NO son movimientos.
 */

/** Índice de columna (base 0) de cada campo del reporte. */
export const SIIGO_COLUMNS = {
  /** Clave del producto: `LIN-GRUP-ELEMEN` (p.ej. "001-0001-000001"). */
  productCode: 0,
  lin: 1,
  grup: 2,
  elemet: 3,
  /** Nombre del elemento (producto). */
  productName: 4,
  /** Clasificación del ítem. Texto con variantes ortográficas: NO es el código. */
  reference: 5,
  /** Unidad de control del ítem (GR, ML, KGM, UN…). */
  unit: 6,
  brand: 7,
  /** Descripción del movimiento o referencia del tercero. */
  description: 8,
  /** Tipo - número de comprobante - número de documento y secuencia. */
  document: 9,
  /** Fecha del movimiento; "0000/00/00" en las filas de apertura. */
  date: 10,
  /** Bodega (código numérico en Siigo). */
  bodega: 11,
  /** Ubicación dentro de la bodega. */
  ubicacion: 12,
  /** Saldo anterior a la fecha del informe (constante dentro del grupo). */
  qtyBefore: 13,
  /** Valor del movimiento (puede existir sin cantidad: revaluaciones). */
  valueMovement: 14,
  qtyIn: 15,
  valueIn: 16,
  qtyOut: 17,
  valueOut: 18,
  /** CANTIDAD: neto del movimiento (ENTRADAS − SALIDAS). NO es el saldo. */
  qtyNet: 19,
  /** ACUM CANTIDAD: acumulado corrido dentro del grupo. NO se suma entre filas. */
  qtyAccum: 20,
  /** Segunda unidad de medida (solo si está parametrizada en Siigo). */
  qty2In: 21,
  valueQty2In: 22,
  qty2Out: 23,
  valueQty2Out: 24,
  qty2Balance: 25,
} as const;

/** Total de columnas del reporte (incluye la columna final vacía). */
export const SIIGO_COLUMN_COUNT = 27;

/**
 * Encabezados esperados en la fila 7 (normalizados: trim + colapsar espacios).
 * La comparación ignora mayúsculas y espacios repetidos porque el reporte
 * rellena los encabezados con espacios hasta un ancho fijo.
 */
export const SIIGO_HEADERS: Record<keyof typeof SIIGO_COLUMNS, string> = {
  productCode: "LIN-GRUP-ELEMEN",
  lin: "LIN",
  grup: "GRUP",
  elemet: "ELEMET",
  productName: "NOMBRE ELEMENTO",
  reference: "REFERENCIA",
  unit: "UNIDAD",
  brand: "MARCA",
  description: "DESCRIPCION \\ TERCERO",
  document: "DOCUMENTO",
  date: "FECHA",
  bodega: "BODEGA",
  ubicacion: "UBICACION",
  qtyBefore: "CANT. ANTERIOR",
  valueMovement: "VALOR MOVIMIENTO",
  qtyIn: "ENTRADAS",
  valueIn: "VALOR ENTRADAS",
  qtyOut: "SALIDAS",
  valueOut: "VALOR SALIDAS",
  qtyNet: "CANTIDAD",
  qtyAccum: "ACUM CANTIDAD",
  qty2In: "ENTRADAS 2",
  valueQty2In: "",
  qty2Out: "SALIDAS 2",
  valueQty2Out: "",
  qty2Balance: "SALDO 2",
};

/** Normaliza un encabezado para compararlo de forma tolerante. */
export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Fila (1-based) donde están los encabezados. */
export const SIIGO_HEADER_ROW = 7;

/** Nombre de la hoja principal. */
export const SIIGO_MAIN_SHEET = "Hoja1";

/** Nombre de la hoja de definiciones. */
export const SIIGO_FORMULA_SHEET = "FÓRMULAS";

/**
 * Etiquetas de las definiciones de la hoja FÓRMULAS y su lectura operativa.
 * Se citan en los comentarios del código para dejar trazabilidad de por qué
 * se calcula de una forma y no de otra.
 */
export const SIIGO_FORMULA_DEFINITIONS = {
  DOCUMENTO:
    "Tipo - número de comprobante - número de documento y secuencia donde está el movimiento.",
  FECHA: "Fecha en la que se realiza el movimiento.",
  "CANT. ANTERIOR": "Saldo anterior a la fecha del informe.",
  "ACUM CANTIDAD": "Sumatoria de las entradas menos las salidas.",
  "ENTRADAS 2":
    "La información correspondiente a estas columnas se genera cuando está parametrizada en el registro de control el manejo de la segunda unidad.",
  "SALIDAS 2":
    "La información correspondiente a estas columnas se genera cuando está parametrizada en el registro de control el manejo de la segunda unidad.",
  "SALDO 2":
    "La información correspondiente a estas columnas se genera cuando está parametrizada en el registro de control el manejo de la segunda unidad.",
} as const;
