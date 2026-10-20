/**
 * Servicio de entradas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Flujo de una entrada:
 *   1. Se valida el documento y sus ítems.
 *   2. Se guarda la cabecera (`entries`) y el detalle (`entry_items`).
 *   3. Si la entrada queda CONFIRMADA, se actualiza el inventario y se
 *      registra el movimiento (regla 6: toda entrada afecta el inventario).
 *   4. Se registra el soporte documental y la bitácora de auditoría.
 *
 * Todo el proceso ocurre dentro de una única transacción.
 */

import { desc, eq, like, sql } from "drizzle-orm";
import { entries, entryItems, users, warehouses } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { parseDocumentDate, toIsoDate } from "@/lib/utils";
import { DOCUMENT_PREFIX, formatDocumentNumber } from "@/lib/utils/numbers";
import type { CreateEntryInput } from "@/lib/validations/schemas";
import {
  applyStockMovement,
  assertActiveProduct,
  assertActiveWarehouse,
} from "./inventory.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista las entradas con su usuario y bodega de origen.
 */
export async function listEntries(executor: DbExecutor) {
  return executor
    .select({
      id: entries.id,
      format: entries.format,
      number: entries.number,
      date: entries.date,
      nit: entries.nit,
      origin: entries.origin,
      document: entries.document,
      status: entries.status,
      userId: entries.userId,
      notes: entries.notes,
      createdAt: entries.createdAt,
      updatedAt: entries.updatedAt,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(entries)
    .innerJoin(users, eq(entries.userId, users.id))
    .orderBy(desc(entries.createdAt));
}

/**
 * Obtiene una entrada con su detalle.
 */
export async function getEntry(executor: DbExecutor, id: string) {
  const [entry] = await executor
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);

  if (!entry) {
    throw notFoundError("Entrada");
  }

  const items = await executor
    .select()
    .from(entryItems)
    .where(eq(entryItems.entryId, id));

  return { ...entry, items };
}

/**
 * Calcula el siguiente consecutivo disponible para el año indicado.
 */
async function nextEntryNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const rows = await executor
    .select({ number: entries.number })
    .from(entries)
    .where(like(entries.number, `${DOCUMENT_PREFIX.ENTRY}-${year}-%`));

  const sequence =
    rows.reduce((max, row) => {
      const value = Number(row.number.split("-").pop());
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;

  return formatDocumentNumber(DOCUMENT_PREFIX.ENTRY, date, sequence);
}

/**
 * Crea una entrada. Si la entrada queda CONFIRMADA, actualiza el inventario.
 */
export async function createEntry(
  executor: DbExecutor,
  input: CreateEntryInput,
  userId: string
) {
  const entryDate = parseDocumentDate(input.date);

  const number = input.number?.trim()
    ? input.number.trim()
    : await nextEntryNumber(executor, entryDate);

  const duplicate = await executor
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe una entrada con el número ${number}`);
  }

  // Regla 2: no se permiten cantidades cero ni negativas (validado por Zod).
  // Regla 1: toda entrada debe referenciar productos y bodegas válidos.
  const referencedWarehouses = new Set<string>();
  for (const item of input.items) {
    await assertActiveProduct(executor, item.productId);
    await assertActiveWarehouse(executor, item.warehouseId);
    referencedWarehouses.add(item.warehouseId);
  }

  const [entry] = await executor
    .insert(entries)
    .values({
      format: input.format,
      number,
      date: toIsoDate(input.date),
      nit: input.nit || null,
      origin: input.origin || null,
      document: input.document || null,
      status: input.status,
      userId,
      notes: input.notes || null,
    })
    .returning();

  await executor.insert(entryItems).values(
    input.items.map((item) => ({
      entryId: entry.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
      unit: item.unit,
      presentation: item.presentation || null,
    }))
  );

  // Regla 6: toda entrada confirmada afecta el inventario.
  if (input.status === "CONFIRMED") {
    for (const item of input.items) {
      await applyStockMovement(executor, {
        type: "ENTRY",
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        documentId: entry.id,
        documentType: "ENTRY",
        userId,
        notes: `Entrada ${number} (${input.format})`,
      });
    }
  }

  await createDocument(executor, {
    type: "ENTRY",
    number,
    relatedId: entry.id,
    generatedBy: userId,
  });

  await recordAuditLog(executor, {
    userId,
    action: "ENTRY_CREATE",
    entity: "entries",
    entityId: entry.id,
    details: `Entrada ${number} con ${input.items.length} item(s)`,
  });

  const items = await executor
    .select()
    .from(entryItems)
    .where(eq(entryItems.entryId, entry.id));

  return { ...entry, items };
}

/**
 * Confirma una entrada en estado DRAFT: aplica sus ítems al inventario.
 * Regla 5: una entrada confirmada no se vuelve a confirmar.
 */
export async function confirmEntry(
  executor: DbExecutor,
  id: string,
  userId: string
) {
  const [entry] = await executor
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);

  if (!entry) {
    throw notFoundError("Entrada");
  }

  if (entry.status === "CONFIRMED") {
    throw conflictError("La entrada ya está confirmada");
  }

  if (entry.status === "CANCELLED") {
    throw conflictError("La entrada está cancelada y no puede confirmarse");
  }

  const items = await executor
    .select()
    .from(entryItems)
    .where(eq(entryItems.entryId, id));

  for (const item of items) {
    await applyStockMovement(executor, {
      type: "ENTRY",
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
      documentId: entry.id,
      documentType: "ENTRY",
      userId,
      notes: `Entrada ${entry.number} (${entry.format})`,
    });
  }

  const [updated] = await executor
    .update(entries)
    .set({ status: "CONFIRMED", updatedAt: new Date() })
    .where(eq(entries.id, id))
    .returning();

  await recordAuditLog(executor, {
    userId,
    action: "ENTRY_CONFIRM",
    entity: "entries",
    entityId: entry.id,
    details: `Entrada ${entry.number} confirmada`,
  });

  return { ...updated, items };
}

/**
 * Bodegas en las que se movementsó stock en una entrada (para el dashboard).
 */
export async function listEntryWarehouses(executor: DbExecutor) {
  return executor
    .select({ id: warehouses.id, name: warehouses.name, code: warehouses.code })
    .from(warehouses)
    .where(sql`${warehouses.status} = 'ACTIVE'`);
}
