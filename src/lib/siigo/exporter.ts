/**
 * Exportador ExcelSiigo — Generación de archivos planos
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Este módulo genera archivos Excel (.xlsx) con el formato
 * requerido por la herramienta ExcelSiigo para importar datos a Siigo Pyme.
 */

import * as XLSX from "xlsx";
import type {
  E1Entry,
  E3Entry,
  N3Entry,
  N5Entry,
  SF1Invoice,
  F2Invoice,
  R1Receipt,
  R2Receipt,
  R3Receipt,
  R4Receipt,
} from "./formats";

// ============================================================
// E1 - Entrada de mercancía
// ============================================================

export function exportE1ToExcel(entry: E1Entry): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Hoja de encabezado
  const headerData = [
    ["Formato", entry.formato],
    ["Número", entry.numero],
    ["Fecha", entry.fecha],
    ["NIT", entry.nit],
    ["Origen", entry.origen],
    ["Documento", entry.documento],
    ["Estado", entry.estado],
    ["Notas", entry.notas],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  // Hoja de items
  const itemsData = [
    ["Producto", "Bodega", "Cantidad", "Unidad", "Presentación"],
    ...entry.items.map((item) => [
      item.producto,
      item.bodega,
      item.cantidad,
      item.unidad,
      item.presentacion,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// E3 - Entrada por donación
// ============================================================

export function exportE3ToExcel(entry: E3Entry): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", entry.formato],
    ["Número", entry.numero],
    ["Fecha", entry.fecha],
    ["NIT", entry.nit],
    ["Donante", entry.donante],
    ["Documento", entry.documento],
    ["Estado", entry.estado],
    ["Notas", entry.notas],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Bodega", "Cantidad", "Unidad", "Presentación"],
    ...entry.items.map((item) => [
      item.producto,
      item.bodega,
      item.cantidad,
      item.unidad,
      item.presentacion,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// N3 - Nota de ajuste
// ============================================================

export function exportN3ToExcel(entry: N3Entry): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", entry.formato],
    ["Número", entry.numero],
    ["Fecha", entry.fecha],
    ["Bodega", entry.bodega],
    ["Tipo Ajuste", entry.tipoAjuste],
    ["Estado", entry.estado],
    ["Notas", entry.notas],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Causa"],
    ...entry.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.causa,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// N5 - Nota de contabilización
// ============================================================

export function exportN5ToExcel(entry: N5Entry): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", entry.formato],
    ["Número", entry.numero],
    ["Fecha", entry.fecha],
    ["Concepto", entry.concepto],
    ["Estado", entry.estado],
    ["Notas", entry.notas],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Cuenta", "Débito", "Crédito", "NIT", "Centro Costo"],
    ...entry.items.map((item) => [
      item.cuenta,
      item.debito,
      item.credito,
      item.nit,
      item.centroCosto,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// SF1 - Factura de venta
// ============================================================

export function exportSF1ToExcel(invoice: SF1Invoice): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", invoice.formato],
    ["Número", invoice.numero],
    ["Fecha", invoice.fecha],
    ["NIT", invoice.nit],
    ["Cliente", invoice.cliente],
    ["Pedido", invoice.pedido],
    ["Estado", invoice.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Precio Unitario", "Descuento", "IVA"],
    ...invoice.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.precioUnitario,
      item.descuento,
      item.iva,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// F2 - Factura simplificada
// ============================================================

export function exportF2ToExcel(invoice: F2Invoice): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", invoice.formato],
    ["Número", invoice.numero],
    ["Fecha", invoice.fecha],
    ["NIT", invoice.nit],
    ["Cliente", invoice.cliente],
    ["Estado", invoice.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Precio Unitario"],
    ...invoice.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.precioUnitario,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// R1 - Recibo de entrega
// ============================================================

export function exportR1ToExcel(receipt: R1Receipt): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", receipt.formato],
    ["Número", receipt.numero],
    ["Fecha", receipt.fecha],
    ["Factura", receipt.factura],
    ["NIT", receipt.nit],
    ["Receptor", receipt.receptor],
    ["Estado", receipt.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Bodega"],
    ...receipt.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.bodega,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// R2 - Recibo de devolución
// ============================================================

export function exportR2ToExcel(receipt: R2Receipt): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", receipt.formato],
    ["Número", receipt.numero],
    ["Fecha", receipt.fecha],
    ["Factura", receipt.factura],
    ["NIT", receipt.nit],
    ["Motivo", receipt.motivo],
    ["Estado", receipt.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Bodega", "Causa"],
    ...receipt.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.bodega,
      item.causa,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// R3 - Recibo de traslado
// ============================================================

export function exportR3ToExcel(receipt: R3Receipt): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", receipt.formato],
    ["Número", receipt.numero],
    ["Fecha", receipt.fecha],
    ["Bodega Origen", receipt.bodegaOrigen],
    ["Bodega Destino", receipt.bodegaDestino],
    ["Estado", receipt.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad"],
    ...receipt.items.map((item) => [item.producto, item.cantidad, item.unidad]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// R4 - Recibo de ajuste
// ============================================================

export function exportR4ToExcel(receipt: R4Receipt): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerData = [
    ["Formato", receipt.formato],
    ["Número", receipt.numero],
    ["Fecha", receipt.fecha],
    ["Bodega", receipt.bodega],
    ["Tipo Ajuste", receipt.tipoAjuste],
    ["Estado", receipt.estado],
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  XLSX.utils.book_append_sheet(wb, wsHeader, "Encabezado");

  const itemsData = [
    ["Producto", "Cantidad", "Unidad", "Causa"],
    ...receipt.items.map((item) => [
      item.producto,
      item.cantidad,
      item.unidad,
      item.causa,
    ]),
  ];
  const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Items");

  return wb;
}

// ============================================================
// FUNCIÓN GENERAL DE EXPORTACIÓN
// ============================================================

export function exportToExcel(data: unknown, format: string): XLSX.WorkBook {
  switch (format) {
    case "E1":
      return exportE1ToExcel(data as E1Entry);
    case "E3":
      return exportE3ToExcel(data as E3Entry);
    case "N3":
      return exportN3ToExcel(data as N3Entry);
    case "N5":
      return exportN5ToExcel(data as N5Entry);
    case "SF1":
      return exportSF1ToExcel(data as SF1Invoice);
    case "F2":
      return exportF2ToExcel(data as F2Invoice);
    case "R1":
      return exportR1ToExcel(data as R1Receipt);
    case "R2":
      return exportR2ToExcel(data as R2Receipt);
    case "R3":
      return exportR3ToExcel(data as R3Receipt);
    case "R4":
      return exportR4ToExcel(data as R4Receipt);
    default:
      throw new Error(`Formato no soportado: ${format}`);
  }
}

export function downloadExcel(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
