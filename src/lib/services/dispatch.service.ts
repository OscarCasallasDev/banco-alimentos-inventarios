/**
 * Servicio de despachos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El despacho cierra el flujo de salida: Recibo → Despacho.
 * Los ítems se heredan del pedido asociado al recibo.
 *
 * Regla 7: todo despacho confirmado disminuye el inventario.
 * Regla 3: no se permiten despachos superiores a la existencia disponible.
 */

import { desc, eq, like } from "drizzle-orm";
import {
  dispatchItems,
  dispatches,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  receipts,
  users,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { DOCUMENT_PREFIX, formatDocumentNumber } from "@/lib/utils/numbers";
import type { CreateDispatchInput } from "@/lib/validations/schemas";
import { applyStockMovement } from "./inventory.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista los despachos con su recibo de origen.
 */
export async function listDispatches(executor: DbExecutor) {
  const rows = await executor
    .select({
      id: dispatches.id,
      number: dispatches.number,
      receiptId: dispatches.receiptId,
      date: dispatches.date,
      status: dispatches.status,
      userId: dispatches.userId,
      notes: dispatches.notes,
      createdAt: dispatches.createdAt,
      updatedAt: dispatches.updatedAt,
      receiptNumber: receipts.number,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(dispatches)
    .innerJoin(receipts, eq(dispatches.receiptId, receipts.id))
    .innerJoin(users, eq(dispatches.userId, users.id))
    .orderBy(desc(dispatches.createdAt));

  const items = await executor.select().from(dispatchItems);

  return rows.map((row) => ({
    ...row,
    items: items.filter((item) => item.dispatchId === row.id),
  }));
}

/**
 * Obtiene un despacho con su detalle.
 */
export async function getDispatch(executor: DbExecutor, id: string) {
  const [dispatch] = await executor
    .select()
    .from(dispatches)
    .where(eq(dispatches.id, id))
    .limit(1);

  if (!dispatch) {
    throw notFoundError("Despacho");
  }

  const items = await executor
    .select()
    .from(dispatchItems)
    .where(eq(dispatchItems.dispatchId, id));

  return { ...dispatch, items };
}

/**
 * Calcula el siguiente consecutivo de despacho del año.
 */
async function nextDispatchNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const rows = await executor
    .select({ number: dispatches.number })
    .from(dispatches)
    .where(like(dispatches.number, `${DOCUMENT_PREFIX.DISPATCH}-${year}-%`));

  const sequence =
    rows.reduce((max, row) => {
      const value = Number(row.number.split("-").pop());
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;

  return formatDocumentNumber(DOCUMENT_PREFIX.DISPATCH, date, sequence);
}

/**
 * Resuelve los ítems que se despachan a partir del pedido del recibo.
 */
async function resolveDispatchItems(
  executor: DbExecutor,
  receiptId: string
): Promise<{ productId: string; warehouseId: string; quantity: number }[]> {
  const [receipt] = await executor
    .select()
    .from(receipts)
    .where(eq(receipts.id, receiptId))
    .limit(1);

  if (!receipt) {
    throw notFoundError("Recibo");
  }

  const [invoice] = await executor
    .select()
    .from(invoices)
    .where(eq(invoices.id, receipt.invoiceId))
    .limit(1);

  if (!invoice) {
    throw notFoundError("Factura");
  }

  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, invoice.orderId))
    .limit(1);

  if (!order) {
    throw notFoundError("Pedido");
  }

  const orderItemRows = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  if (orderItemRows.length === 0) {
    throw conflictError("El pedido asociado no tiene ítems que despachar");
  }

  // Se cruza con los ítems de la factura para validar la trazabilidad.
  const invoiceItemRows = await executor
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id));

  const invoicedProducts = new Set(invoiceItemRows.map((item) => item.productId));

  const items = orderItemRows
    .filter((item) => invoicedProducts.has(item.productId))
    .map((item) => ({
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
    }));

  if (items.length === 0) {
    throw conflictError("La factura no tiene ítems para despachar");
  }

  return items;
}

/**
 * Crea un despacho a partir de un recibo.
 * Si el estado es DISPATCHED, descuenta el inventario.
 */
export async function createDispatch(
  executor: DbExecutor,
  input: CreateDispatchInput,
  userId: string
) {
  const dispatchDate = new Date(input.date);

  // Cada recibo genera un único despacho: sin esta validación el stock
  // podría descontarse más de una vez por la misma salida.
  const existingDispatch = await executor
    .select({ id: dispatches.id, number: dispatches.number })
    .from(dispatches)
    .where(eq(dispatches.receiptId, input.receiptId))
    .limit(1);

  if (existingDispatch.length > 0) {
    throw conflictError(
      `El recibo ya tiene el despacho ${existingDispatch[0].number} registrado`
    );
  }

  const items = await resolveDispatchItems(executor, input.receiptId);

  const number = input.number?.trim()
    ? input.number.trim()
    : await nextDispatchNumber(executor, dispatchDate);

  const duplicate = await executor
    .select({ id: dispatches.id })
    .from(dispatches)
    .where(eq(dispatches.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe un despacho con el número ${number}`);
  }

  const [dispatch] = await executor
    .insert(dispatches)
    .values({
      number,
      receiptId: input.receiptId,
      date: dispatchDate.toISOString().slice(0, 10),
      status: input.status,
      userId,
      notes: input.notes || null,
    })
    .returning();

  await executor.insert(dispatchItems).values(
    items.map((item) => ({
      dispatchId: dispatch.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
    }))
  );

  // Regla 7: todo despacho confirmado disminuye el inventario.
  if (input.status === "DISPATCHED") {
    for (const item of items) {
      await applyStockMovement(executor, {
        type: "EXIT",
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: -item.quantity,
        documentId: dispatch.id,
        documentType: "DISPATCH",
        userId,
        notes: `Despacho ${number}`,
      });
    }
  }

  // El pedido queda marcado como despachado.
  const [receipt] = await executor
    .select()
    .from(receipts)
    .where(eq(receipts.id, input.receiptId))
    .limit(1);

  if (receipt) {
    const [invoice] = await executor
      .select()
      .from(invoices)
      .where(eq(invoices.id, receipt.invoiceId))
      .limit(1);

    if (invoice) {
      await executor
        .update(orders)
        .set({ status: "DISPATCHED", updatedAt: new Date() })
        .where(eq(orders.id, invoice.orderId));
    }
  }

  await createDocument(executor, {
    type: "DISPATCH",
    number,
    relatedId: dispatch.id,
    generatedBy: userId,
  });

  await recordAuditLog(executor, {
    userId,
    action: "DISPATCH_CREATE",
    entity: "dispatches",
    entityId: dispatch.id,
    details: `Despacho ${number} con ${items.length} item(s)`,
  });

  const dispatchItemRows = await executor
    .select()
    .from(dispatchItems)
    .where(eq(dispatchItems.dispatchId, dispatch.id));

  return { ...dispatch, items: dispatchItemRows };
}
