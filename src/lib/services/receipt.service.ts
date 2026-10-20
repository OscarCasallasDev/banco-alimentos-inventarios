/**
 * Servicio de recibos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El recibo se genera a partir de una factura y deja la factura en estado
 * ASSOCIATED_TO_RECEIPT.
 */

import { desc, eq, like } from "drizzle-orm";
import { invoices, receipts, users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { DOCUMENT_PREFIX, formatDocumentNumber } from "@/lib/utils/numbers";
import type { CreateReceiptInput } from "@/lib/validations/schemas";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista los recibos con su factura de origen.
 */
export async function listReceipts(executor: DbExecutor) {
  return executor
    .select({
      id: receipts.id,
      format: receipts.format,
      number: receipts.number,
      invoiceId: receipts.invoiceId,
      date: receipts.date,
      status: receipts.status,
      userId: receipts.userId,
      createdAt: receipts.createdAt,
      updatedAt: receipts.updatedAt,
      invoiceNumber: invoices.number,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(receipts)
    .innerJoin(invoices, eq(receipts.invoiceId, invoices.id))
    .innerJoin(users, eq(receipts.userId, users.id))
    .orderBy(desc(receipts.createdAt));
}

/**
 * Obtiene un recibo.
 */
export async function getReceipt(executor: DbExecutor, id: string) {
  const [receipt] = await executor
    .select()
    .from(receipts)
    .where(eq(receipts.id, id))
    .limit(1);

  if (!receipt) {
    throw notFoundError("Recibo");
  }

  return receipt;
}

/**
 * Calcula el siguiente consecutivo de recibo del año.
 */
async function nextReceiptNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const rows = await executor
    .select({ number: receipts.number })
    .from(receipts)
    .where(like(receipts.number, `${DOCUMENT_PREFIX.RECEIPT}-${year}-%`));

  const sequence =
    rows.reduce((max, row) => {
      const value = Number(row.number.split("-").pop());
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;

  return formatDocumentNumber(DOCUMENT_PREFIX.RECEIPT, date, sequence);
}

/**
 * Crea un recibo a partir de una factura.
 */
export async function createReceipt(
  executor: DbExecutor,
  input: CreateReceiptInput,
  userId: string
) {
  const receiptDate = new Date(input.date);

  const [invoice] = await executor
    .select()
    .from(invoices)
    .where(eq(invoices.id, input.invoiceId))
    .limit(1);

  if (!invoice) {
    throw notFoundError("Factura");
  }

  if (invoice.status === "CANCELLED") {
    throw conflictError("La factura está cancelada y no admite recibos");
  }

  const number = input.number?.trim()
    ? input.number.trim()
    : await nextReceiptNumber(executor, receiptDate);

  const duplicate = await executor
    .select({ id: receipts.id })
    .from(receipts)
    .where(eq(receipts.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe un recibo con el número ${number}`);
  }

  const [receipt] = await executor
    .insert(receipts)
    .values({
      format: input.format,
      number,
      invoiceId: invoice.id,
      date: receiptDate.toISOString().slice(0, 10),
      status: input.status,
      userId,
    })
    .returning();

  await executor
    .update(invoices)
    .set({ status: "ASSOCIATED_TO_RECEIPT", updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));

  await createDocument(executor, {
    type: "RECEIPT",
    number,
    relatedId: receipt.id,
    generatedBy: userId,
  });

  await recordAuditLog(executor, {
    userId,
    action: "RECEIPT_CREATE",
    entity: "receipts",
    entityId: receipt.id,
    details: `Recibo ${number} de la factura ${invoice.number}`,
  });

  return receipt;
}
