/**
 * Formatos ExcelSiigo — Definición de estructuras
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Estos formatos están diseñados para ser exportados como archivos Excel
 * y luego importados a Siigo Pyme a través de la herramienta ExcelSiigo.
 */

// ============================================================
// FORMATOS DE ENTRADAS
// ============================================================

/**
 * E1 - Entrada de mercancía
 * Se usa para registrar ingresos de productos al inventario
 */
export interface E1Entry {
  // Encabezado
  formato: "E1";
  numero: string;
  fecha: string; // DD/MM/AAAA
  nit: string;
  origen: string;
  documento: string;
  estado: "BORRADOR" | "CONFIRMADO" | "CANCELADO";
  notas: string;

  // Items
  items: E1Item[];
}

export interface E1Item {
  producto: string; // Código del producto
  bodega: string; // Código de la bodega
  cantidad: number;
  unidad: string;
  presentacion: string;
}

/**
 * E3 - Entrada por donación
 * Se usa para registrar productos recibidos por donación
 */
export interface E3Entry {
  formato: "E3";
  numero: string;
  fecha: string;
  nit: string;
  donante: string;
  documento: string;
  estado: "BORRADOR" | "CONFIRMADO" | "CANCELADO";
  notas: string;
  items: E3Item[];
}

export interface E3Item {
  producto: string;
  bodega: string;
  cantidad: number;
  unidad: string;
  presentacion: string;
}

/**
 * N3 - Nota de ajuste
 * Se usa para ajustes de inventario
 */
export interface N3Entry {
  formato: "N3";
  numero: string;
  fecha: string;
  bodega: string;
  tipoAjuste: "SOBRANTE" | "FALTANTE" | "VENCIDO" | "DAÑADO";
  estado: "BORRADOR" | "CONFIRMADO" | "CANCELADO";
  notas: string;
  items: N3Item[];
}

export interface N3Item {
  producto: string;
  cantidad: number;
  unidad: string;
  causa: string;
}

/**
 * N5 - Nota de contabilización
 * Se usa para contabilizar movimientos
 */
export interface N5Entry {
  formato: "N5";
  numero: string;
  fecha: string;
  concepto: string;
  estado: "BORRADOR" | "CONFIRMADO" | "CANCELADO";
  notas: string;
  items: N5Item[];
}

export interface N5Item {
  cuenta: string;
  debito: number;
  credito: number;
  nit: string;
  centroCosto: string;
}

// ============================================================
// FORMATOS DE FACTURAS
// ============================================================

/**
 * SF1 - Factura de venta
 * Se usa para facturar productos vendidos
 */
export interface SF1Invoice {
  formato: "SF1";
  numero: string;
  fecha: string;
  nit: string;
  cliente: string;
  pedido: string;
  estado: "BORRADOR" | "GENERADA" | "ASOCIADA" | "CANCELADA";
  items: SF1Item[];
}

export interface SF1Item {
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  descuento: number;
  iva: number;
}

/**
 * F2 - Factura simplificada
 * Se usa para facturas simplificadas
 */
export interface F2Invoice {
  formato: "F2";
  numero: string;
  fecha: string;
  nit: string;
  cliente: string;
  estado: "BORRADOR" | "GENERADA" | "ASOCIADA" | "CANCELADA";
  items: F2Item[];
}

export interface F2Item {
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
}

// ============================================================
// FORMATOS DE RECIBOS
// ============================================================

/**
 * R1 - Recibo de entrega
 * Se usa para confirmar entrega de productos
 */
export interface R1Receipt {
  formato: "R1";
  numero: string;
  fecha: string;
  factura: string;
  nit: string;
  receptor: string;
  estado: "BORRADOR" | "GENERADO" | "CANCELADO";
  items: R1Item[];
}

export interface R1Item {
  producto: string;
  cantidad: number;
  unidad: string;
  bodega: string;
}

/**
 * R2 - Recibo de devolución
 * Se usa para registrar devoluciones
 */
export interface R2Receipt {
  formato: "R2";
  numero: string;
  fecha: string;
  factura: string;
  nit: string;
  motivo: string;
  estado: "BORRADOR" | "GENERADO" | "CANCELADO";
  items: R2Item[];
}

export interface R2Item {
  producto: string;
  cantidad: number;
  unidad: string;
  bodega: string;
  causa: string;
}

/**
 * R3 - Recibo de traslado
 * Se usa para traslados entre bodegas
 */
export interface R3Receipt {
  formato: "R3";
  numero: string;
  fecha: string;
  bodegaOrigen: string;
  bodegaDestino: string;
  estado: "BORRADOR" | "GENERADO" | "CANCELADO";
  items: R3Item[];
}

export interface R3Item {
  producto: string;
  cantidad: number;
  unidad: string;
}

/**
 * R4 - Recibo de ajuste
 * Se usa para ajustes de inventario
 */
export interface R4Receipt {
  formato: "R4";
  numero: string;
  fecha: string;
  bodega: string;
  tipoAjuste: string;
  estado: "BORRADOR" | "GENERADO" | "CANCELADO";
  items: R4Item[];
}

export interface R4Item {
  producto: string;
  cantidad: number;
  unidad: string;
  causa: string;
}

// ============================================================
// TIPOS UNIFICADOS
// ============================================================

export type SiigoFormat =
  | E1Entry
  | E3Entry
  | N3Entry
  | N5Entry
  | SF1Invoice
  | F2Invoice
  | R1Receipt
  | R2Receipt
  | R3Receipt
  | R4Receipt;

// ============================================================
// COLUMNAS PARA EXCEL
// ============================================================

export const SIIGO_COLUMNS = {
  E1: [
    "Formato",
    "Número",
    "Fecha",
    "NIT",
    "Origen",
    "Documento",
    "Estado",
    "Notas",
    "Producto",
    "Bodega",
    "Cantidad",
    "Unidad",
    "Presentación",
  ],
  E3: [
    "Formato",
    "Número",
    "Fecha",
    "NIT",
    "Donante",
    "Documento",
    "Estado",
    "Notas",
    "Producto",
    "Bodega",
    "Cantidad",
    "Unidad",
    "Presentación",
  ],
  N3: [
    "Formato",
    "Número",
    "Fecha",
    "Bodega",
    "Tipo Ajuste",
    "Estado",
    "Notas",
    "Producto",
    "Cantidad",
    "Unidad",
    "Causa",
  ],
  N5: [
    "Formato",
    "Número",
    "Fecha",
    "Concepto",
    "Estado",
    "Notas",
    "Cuenta",
    "Débito",
    "Crédito",
    "NIT",
    "Centro Costo",
  ],
  SF1: [
    "Formato",
    "Número",
    "Fecha",
    "NIT",
    "Cliente",
    "Pedido",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
    "Precio Unitario",
    "Descuento",
    "IVA",
  ],
  F2: [
    "Formato",
    "Número",
    "Fecha",
    "NIT",
    "Cliente",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
    "Precio Unitario",
  ],
  R1: [
    "Formato",
    "Número",
    "Fecha",
    "Factura",
    "NIT",
    "Receptor",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
    "Bodega",
  ],
  R2: [
    "Formato",
    "Número",
    "Fecha",
    "Factura",
    "NIT",
    "Motivo",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
    "Bodega",
    "Causa",
  ],
  R3: [
    "Formato",
    "Número",
    "Fecha",
    "Bodega Origen",
    "Bodega Destino",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
  ],
  R4: [
    "Formato",
    "Número",
    "Fecha",
    "Bodega",
    "Tipo Ajuste",
    "Estado",
    "Producto",
    "Cantidad",
    "Unidad",
    "Causa",
  ],
};
