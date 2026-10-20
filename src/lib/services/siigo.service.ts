/**
 * Servicio de integración con Siigo Pyme (ExcelSiigo)
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Genera los archivos planos que el Banco importa a Siigo Pyme mediante la
 * herramienta ExcelSiigo.
 *
 * ESTADO: DEMO. Los datos provienen de la base de datos real del sistema
 * (entradas, facturas y recibos). Los campos contables que solo existen en
 * Siigo Pyme (cuenta, centro de costo, precio unitario) se dejan vacíos
 * hasta que el Banco valide la plantilla definitiva.
 * Ver `docs/INTEGRACION_SIIGO.md`.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  entries,
  entryItems,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  products,
  receipts,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { notFoundError } from "@/lib/utils/errors";
import type {
  E1Entry,
  E1Item,
  E3Entry,
  E3Item,
  F2Invoice,
  F2Item,
  N3Entry,
  N3Item,
  N5Entry,
  N5Item,
  R1Receipt,
  R1Item,
  R2Receipt,
  R2Item,
  R3Receipt,
  R3Item,
  R4Receipt,
  R4Item,
  SF1Invoice,
  SF1Item,
} from "@/lib/siigo/formats";

export const SIIGO_FORMATS = [
  "E1",
  "E3",
  "N3",
  "N5",
  "SF1",
  "F2",
  "R1",
  "R2",
  "R3",
  "R4",
] as const;

export type SiigoFormatCode = (typeof SIIGO_FORMATS)[number];

export type SiigoPayload =
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

/**
 * Formatea una fecha ISO como DD/MM/AAAA (formato usado por Siigo).
 */
export function formatSiigoDate(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Traduce el estado interno al vocabulario de Siigo.
 */
function translateStatus(
  status: string,
  family: "entry" | "invoice" | "receipt"
): string {
  if (family === "invoice") {
    switch (status) {
      case "GENERATED":
        return "GENERADA";
      case "ASSOCIATED_TO_RECEIPT":
        return "ASOCIADA";
      case "CANCELLED":
        return "CANCELADA";
      default:
        return "BORRADOR";
    }
  }

  if (status === "CONFIRMED") return "CONFIRMADO";
  if (status === "CANCELLED") return "CANCELADO";
  return "BORRADOR";
}

/**
 * Construye el contenido del archivo ExcelSiigo a partir de la base de datos.
 *
 * @param format     Formato a exportar.
 * @param documentId Documento concreto. Si se omite, se usa el más reciente.
 */
export async function buildSiigoPayload(
  executor: DbExecutor,
  format: SiigoFormatCode,
  documentId?: string
): Promise<SiigoPayload> {
  if (format === "E1" || format === "E3" || format === "N3" || format === "N5") {
    return buildEntryPayload(executor, format, documentId);
  }

  if (format === "SF1" || format === "F2") {
    return buildInvoicePayload(executor, format, documentId);
  }

  return buildReceiptPayload(executor, format, documentId);
}

/**
 * Entradas (E1, E3, N3, N5).
 */
async function buildEntryPayload(
  executor: DbExecutor,
  format: "E1" | "E3" | "N3" | "N5",
  documentId?: string
): Promise<E1Entry | E3Entry | N3Entry | N5Entry> {
  const conditions = [eq(entries.format, format)];
  if (documentId) conditions.push(eq(entries.id, documentId));

  const [entry] = await executor
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(entries.createdAt))
    .limit(1);

  if (!entry) {
    throw notFoundError(`Documento de formato ${format}`);
  }

  const items = await executor
    .select({
      id: entryItems.id,
      productId: entryItems.productId,
      warehouseId: entryItems.warehouseId,
      quantity: entryItems.quantity,
      unit: entryItems.unit,
      presentation: entryItems.presentation,
      productCode: products.code,
      warehouseCode: warehouses.code,
    })
    .from(entryItems)
    .innerJoin(products, eq(entryItems.productId, products.id))
    .innerJoin(warehouses, eq(entryItems.warehouseId, warehouses.id))
    .where(eq(entryItems.entryId, entry.id));

  const fecha = formatSiigoDate(entry.date);
  const estado = translateStatus(entry.status, "entry");
  const notas = entry.notes ?? "";

  if (format === "E1") {
    const payload: E1Entry = {
      formato: "E1",
      numero: entry.number,
      fecha,
      nit: entry.nit ?? "",
      origen: entry.origin ?? "",
      documento: entry.document ?? "",
      estado: estado as E1Entry["estado"],
      notas,
      items: items.map<E1Item>((item) => ({
        producto: item.productCode,
        bodega: item.warehouseCode,
        cantidad: item.quantity,
        unidad: item.unit,
        presentacion: item.presentation ?? "",
      })),
    };
    return payload;
  }

  if (format === "E3") {
    const payload: E3Entry = {
      formato: "E3",
      numero: entry.number,
      fecha,
      nit: entry.nit ?? "",
      donante: entry.origin ?? "",
      documento: entry.document ?? "",
      estado: estado as E3Entry["estado"],
      notas,
      items: items.map<E3Item>((item) => ({
        producto: item.productCode,
        bodega: item.warehouseCode,
        cantidad: item.quantity,
        unidad: item.unit,
        presentacion: item.presentation ?? "",
      })),
    };
    return payload;
  }

  if (format === "N3") {
    const payload: N3Entry = {
      formato: "N3",
      numero: entry.number,
      fecha,
      bodega: items[0]?.warehouseCode ?? "",
      // El tipo de ajuste lo define el Banco al validar la plantilla.
      tipoAjuste: "SOBRANTE",
      estado: estado as N3Entry["estado"],
      notas,
      items: items.map<N3Item>((item) => ({
        producto: item.productCode,
        cantidad: item.quantity,
        unidad: item.unit,
        causa: notas,
      })),
    };
    return payload;
  }

  const payload: N5Entry = {
    formato: "N5",
    numero: entry.number,
    fecha,
    concepto: entry.origin ?? entry.document ?? "",
    estado: estado as N5Entry["estado"],
    notas,
    items: items.map<N5Item>(() => ({
      // La cuenta contable se valida con el Banco (PENDIENTE).
      cuenta: "",
      debito: 0,
      credito: 0,
      nit: entry.nit ?? "",
      centroCosto: "",
    })),
  };
  return payload;
}

/**
 * Facturas (SF1, F2).
 */
async function buildInvoicePayload(
  executor: DbExecutor,
  format: "SF1" | "F2",
  documentId?: string
): Promise<SF1Invoice | F2Invoice> {
  const conditions = [eq(invoices.format, format)];
  if (documentId) conditions.push(eq(invoices.id, documentId));

  const [invoice] = await executor
    .select({
      id: invoices.id,
      format: invoices.format,
      number: invoices.number,
      orderId: invoices.orderId,
      date: invoices.date,
      status: invoices.status,
    })
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(1);

  if (!invoice) {
    throw notFoundError(`Documento de formato ${format}`);
  }

  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, invoice.orderId))
    .limit(1);

  const items = await executor
    .select({
      productId: invoiceItems.productId,
      quantity: invoiceItems.quantity,
      productCode: products.code,
      productName: products.name,
      unit: products.unit,
    })
    .from(invoiceItems)
    .innerJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, invoice.id));

  const fecha = formatSiigoDate(invoice.date);
  const estado = translateStatus(invoice.status, "invoice");

  if (format === "SF1") {
    const payload: SF1Invoice = {
      formato: "SF1",
      numero: invoice.number,
      fecha,
      nit: order?.nit ?? "",
      cliente: order?.destination ?? "",
      pedido: order?.number ?? "",
      estado: estado as SF1Invoice["estado"],
      items: items.map<SF1Item>((item) => ({
        producto: item.productCode,
        cantidad: item.quantity,
        unidad: item.unit,
        // El precio vive en Siigo Pyme; queda pendiente de validación.
        precioUnitario: 0,
        descuento: 0,
        iva: 0,
      })),
    };
    return payload;
  }

  const payload: F2Invoice = {
    formato: "F2",
    numero: invoice.number,
    fecha,
    nit: order?.nit ?? "",
    cliente: order?.destination ?? "",
    estado: estado as F2Invoice["estado"],
    items: items.map<F2Item>((item) => ({
      producto: item.productCode,
      cantidad: item.quantity,
      unidad: item.unit,
      precioUnitario: 0,
    })),
  };
  return payload;
}

/**
 * Recibos (R1, R2, R3, R4).
 */
async function buildReceiptPayload(
  executor: DbExecutor,
  format: "R1" | "R2" | "R3" | "R4",
  documentId?: string
): Promise<R1Receipt | R2Receipt | R3Receipt | R4Receipt> {
  const conditions = [eq(receipts.format, format)];
  if (documentId) conditions.push(eq(receipts.id, documentId));

  const [receipt] = await executor
    .select()
    .from(receipts)
    .where(and(...conditions))
    .orderBy(desc(receipts.createdAt))
    .limit(1);

  if (!receipt) {
    throw notFoundError(`Documento de formato ${format}`);
  }

  const [invoice] = await executor
    .select()
    .from(invoices)
    .where(eq(invoices.id, receipt.invoiceId))
    .limit(1);

  const [order] = invoice
    ? await executor
        .select()
        .from(orders)
        .where(eq(orders.id, invoice.orderId))
        .limit(1)
    : [null];

  const orderItemRows = order
    ? await executor
        .select({
          productId: orderItems.productId,
          warehouseId: orderItems.warehouseId,
          quantity: orderItems.quantity,
          productCode: products.code,
          unit: products.unit,
          warehouseCode: warehouses.code,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .innerJoin(warehouses, eq(orderItems.warehouseId, warehouses.id))
        .where(eq(orderItems.orderId, order.id))
    : [];

  const fecha = formatSiigoDate(receipt.date);
  const estado = translateStatus(receipt.status, "receipt");
  const nit = order?.nit ?? "";
  const factura = invoice?.number ?? "";
  const receptor = order?.destination ?? "";

  if (format === "R1") {
    const payload: R1Receipt = {
      formato: "R1",
      numero: receipt.number,
      fecha,
      factura,
      nit,
      receptor,
      estado: estado as R1Receipt["estado"],
      items: orderItemRows.map<R1Item>((item) => ({
        producto: item.productCode,
        cantidad: item.quantity,
        unidad: item.unit,
        bodega: item.warehouseCode,
      })),
    };
    return payload;
  }

  if (format === "R2") {
    const payload: R2Receipt = {
      formato: "R2",
      numero: receipt.number,
      fecha,
      factura,
      nit,
      motivo: "",
      estado: estado as R2Receipt["estado"],
      items: orderItemRows.map<R2Item>((item) => ({
        producto: item.productCode,
        cantidad: item.quantity,
        unidad: item.unit,
        bodega: item.warehouseCode,
        causa: "",
      })),
    };
    return payload;
  }

  if (format === "R3") {
    const payload: R3Receipt = {
      formato: "R3",
      numero: receipt.number,
      fecha,
      bodegaOrigen: orderItemRows[0]?.warehouseCode ?? "",
      bodegaDestino: orderItemRows[0]?.warehouseCode ?? "",
      estado: estado as R3Receipt["estado"],
      items: orderItemRows.map<R3Item>((item) => ({
        producto: item.productCode,
        cantidad: item.quantity,
        unidad: item.unit,
      })),
    };
    return payload;
  }

  const payload: R4Receipt = {
    formato: "R4",
    numero: receipt.number,
    fecha,
    bodega: orderItemRows[0]?.warehouseCode ?? "",
    tipoAjuste: "",
    estado: estado as R4Receipt["estado"],
    items: orderItemRows.map<R4Item>((item) => ({
      producto: item.productCode,
      cantidad: item.quantity,
      unidad: item.unit,
      causa: "",
    })),
  };
  return payload;
}
