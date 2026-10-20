/**
 * Servicio de facturas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * La factura se genera a partir de un pedido: hereda sus ítems y deja el
 * pedido en estado INVOICED.
 */

import { desc, eq, like } from "drizzle-orm";
import { invoiceItems, invoices, orderItems, orders, users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { DOCUMENT_PREFIX, formatDocumentNumber } from "@/lib/utils/numbers";
import type { CreateInvoiceInput } from "@/lib/validations/schemas";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista las facturas con su pedido de origen.
 */
export async function listInvoices(executor: DbExecutor) {
  const rows = await executor
    .select({
      id: invoices.id,
      format: invoices.format,
      number: invoices.number,
      orderId: invoices.orderId,
      date: invoices.date,
      status: invoices.status,
      userId: invoices.userId,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt,
      orderNumber: orders.number,
      destination: orders.destination,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .innerJoin(users, eq(invoices.userId, users.id))
    .orderBy(desc(invoices.createdAt));

  const items = await executor.select().from(invoiceItems);

  return rows.map((row) => ({
    ...row,
    items: items.filter((item) => item.invoiceId === row.id),
  }));
}

/**
 * Obtiene una factura con su detalle.
 */
export async function getInvoice(executor: DbExecutor, id: string) {
  const [invoice] = await executor
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!invoice) {
    throw notFoundError("Factura");
  }

  const items = await executor
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id));

  return { ...invoice, items };
}

/**
 * Calcula el siguiente consecutivo de factura del año.
 */
async function nextInvoiceNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const rows = await executor
    .select({ number: invoices.number })
    .from(invoices)
    .where(like(invoices.number, `${DOCUMENT_PREFIX.INVOICE}-${year}-%`));

  const sequence =
    rows.reduce((max, row) => {
      const value = Number(row.number.split("-").pop());
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;

  return formatDocumentNumber(DOCUMENT_PREFIX.INVOICE, date, sequence);
}

/**
 * Crea una factura a partir de un pedido.
 */
export async function createInvoice(
  executor: DbExecutor,
  input: CreateInvoiceInput,
  userId: string
) {
  const invoiceDate = new Date(input.date);

  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw notFoundError("Pedido");
  }

  if (order.status === "CANCELLED") {
    throw conflictError("El pedido está cancelado y no admite facturas");
  }

  const number = input.number?.trim()
    ? input.number.trim()
    : await nextInvoiceNumber(executor, invoiceDate);

  const duplicate = await executor
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe una factura con el número ${number}`);
  }

  const [invoice] = await executor
    .insert(invoices)
    .values({
      format: input.format,
      number,
      orderId: order.id,
      date: invoiceDate.toISOString().slice(0, 10),
      status: input.status,
      userId,
    })
    .returning();

  // La factura hereda los ítems del pedido.
  const orderItemRows = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  if (orderItemRows.length > 0) {
    await executor.insert(invoiceItems).values(
      orderItemRows.map((item) => ({
        invoiceId: invoice.id,
        productId: item.productId,
        quantity: item.quantity,
      }))
    );
  }

  await executor
    .update(orders)
    .set({ status: "INVOICED", updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await createDocument(executor, {
    type: "INVOICE",
    number,
    relatedId: invoice.id,
    generatedBy: userId,
  });

  await recordAuditLog(executor, {
    userId,
    action: "INVOICE_CREATE",
    entity: "invoices",
    entityId: invoice.id,
    details: `Factura ${number} del pedido ${order.number}`,
  });

  const items = await executor
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id));

  return { ...invoice, items };
}
