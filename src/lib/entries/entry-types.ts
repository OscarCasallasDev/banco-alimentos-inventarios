/**
 * Tipos de entrada — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Catálogo único y fuente de verdad para:
 *   • el tipo de entrada (E1, E3, N3, N5) soportado por el sistema;
 *   • el título del documento que se imprime en el comprobante;
 *   • el código documental (E-001, E-003…) con el que se arma el número;
 *   • la bodega sugerida según la clasificación de la bodega del catálogo.
 *
 * PROCEDIMIENTO DEL BANCO (Siigo Pyme)
 *   E1 → Entrada por donación.
 *   E3 → Entrada de productos otros (por ejemplo, productos elaborados).
 *   N3 → Nota de ajuste.
 *   N5 → Nota de contabilización.
 *
 * NOTA: el procedimiento de Siigo maneja además E2, E4 y E5, que NO están
 * soportados por este sistema (el enum `entry_format` solo tiene E1, E3,
 * N3 y N5). No se agregan hasta que el Banco defina su equivalencia.
 */

export type EntryTypeCode = "E1" | "E3" | "N3" | "N5";

export interface EntryTypeDefinition {
  /** Código del tipo de entrada. */
  code: EntryTypeCode;
  /** Nombre corto para los desplegables. */
  label: string;
  /** Título del documento, tal como se imprime en mayúsculas. */
  documentTitle: string;
  /** Prefijo del código documental: E-001, E-003, N-003… */
  documentCode: string;
  /** Descripción de la operación. */
  description: string;
  /**
   * Tipo de bodega sugerida según la clasificación del catálogo.
   * `null` = el usuario debe elegir la bodega.
   */
  suggestedWarehouseType: "PROPIA" | "TERCERO" | null;
  /** Si la entrada se confirma automáticamente al guardarla. */
  autoConfirm: boolean;
}

export const ENTRY_TYPES: Record<EntryTypeCode, EntryTypeDefinition> = {
  E1: {
    code: "E1",
    label: "Entrada por donación",
    documentTitle: "NOTA ENTRADA DONACIÓN",
    documentCode: "E-001",
    description:
      "Ingreso de productos entregados por un tercero (donación, cliente o parroquia).",
    suggestedWarehouseType: "TERCERO",
    autoConfirm: true,
  },
  E3: {
    code: "E3",
    label: "Entrada productos otros",
    documentTitle: "NOTA ENTRADA PRODUCCIÓN OTROS",
    documentCode: "E-003",
    description:
      "Ingreso de productos elaborados por el Banco o clasificados como propios.",
    suggestedWarehouseType: "PROPIA",
    autoConfirm: true,
  },
  N3: {
    code: "N3",
    label: "Nota de ajuste",
    documentTitle: "NOTA AJUSTE",
    documentCode: "N-003",
    description: "Ajuste de existencias por sobrante, faltante o deterioro.",
    suggestedWarehouseType: null,
    autoConfirm: true,
  },
  N5: {
    code: "N5",
    label: "Nota de contabilización",
    documentTitle: "NOTA CONTABILIZACIÓN",
    documentCode: "N-005",
    description: "Contabilización de movimientos de inventario.",
    suggestedWarehouseType: null,
    autoConfirm: true,
  },
};

/**
 * Lista de tipos de entrada para los desplegables.
 */
export const ENTRY_TYPE_LIST: EntryTypeDefinition[] = Object.values(ENTRY_TYPES);

/**
 * Devuelve la definición de un tipo de entrada.
 */
export function getEntryType(code: string): EntryTypeDefinition {
  const definition = ENTRY_TYPES[code as EntryTypeCode];

  if (!definition) {
    throw new Error(`Tipo de entrada no soportado: ${code}`);
  }

  return definition;
}

/**
 * Construye el código documental completo.
 * Ejemplo: `E-003-28`.
 */
export function formatDocumentCode(code: EntryTypeCode, sequence: number): string {
  return `${ENTRY_TYPES[code].documentCode}-${sequence}`;
}

/**
 * Presenta el código documental con el espaciado del comprobante.
 * Ejemplo: `E - 003 - 28`.
 */
export function formatDocumentCodeForPrint(code: string): string {
  return code
    .split("-")
    .map((part) => (part.length === 1 ? ` ${part} ` : part))
    .join(" - ")
    .replace(/\s+/g, " ")
    .trim();
}
