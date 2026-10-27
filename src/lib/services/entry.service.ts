/**
 * Servicio de entradas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Flujo de una entrada:
 *   1. Se valida el documento y sus ítems (Zod).
 *   2. Se resuelve la entidad que entrega los productos (tercero).
 *   3. Se asigna el código documental (consecutivo atómico por tipo).
 *   4. Se guarda la cabecera (`entries`) y el detalle (`entry_items`).
 *   5. Se guardan los lotes y vencimientos (`entry_item_lots`).
 *   6. Si la entrada queda CONFIRMADA, se actualiza el inventario y se
 *      registra el movimiento (regla 6: toda entrada afecta el inventario).
 *   7. Se registra el soporte documental y la bitácora de auditoría.
 *
 * Todo el proceso ocurre dentro de una única transacción: si algo falla,
 * no queda una entrada guardada a medias ni inventario descuadrado.
 */

import { desc, eq } from "drizzle-orm";
import {
  costCenters,
  entries,
  entryItemLots,
  entryItems,
  products,
  thirdParties,
  users,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { businessRuleError, conflictError, notFoundError } from "@/lib/utils/errors";
import { toIsoDate } from "@/lib/utils";
import { getEntryType, type EntryTypeCode } from "@/lib/entries/entry-types";
import type { CreateEntryInput } from "@/lib/validations/schemas";
import {
  applyStockMovement,
  assertActiveProduct,
  assertActiveWarehouse,
} from "./inventory.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";
import { nextEntryDocumentCode } from "./sequence.service";
import { assertActiveThirdParty } from "./third-party.service";

/**
 * Lista las entradas con su usuario, entidad y bodega.
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
      thirdPartyId: entries.thirdPartyId,
      thirdPartyName: thirdParties.name,
      costCenterId: entries.costCenterId,
      costCenterCode: costCenters.code,
      purchaseOrder: entries.purchaseOrder,
      sellerNumber: entries.sellerNumber,
      createdAt: entries.createdAt,
      updatedAt: entries.updatedAt,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(entries)
    .innerJoin(users, eq(entries.userId, users.id))
    .leftJoin(thirdParties, eq(entries.thirdPartyId, thirdParties.id))
    .leftJoin(costCenters, eq(entries.costCenterId, costCenters.id))
    .orderBy(desc(entries.createdAt));
}

/**
 * Obtiene una entrada con su detalle y sus lotes, lista para el comprobante.
 */
export async function getEntry(executor: DbExecutor, id: string) {
  const [entry] = await executor
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
      thirdPartyId: entries.thirdPartyId,
      costCenterId: entries.costCenterId,
      purchaseOrder: entries.purchaseOrder,
      sellerNumber: entries.sellerNumber,
      createdAt: entries.createdAt,
      updatedAt: entries.updatedAt,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(entries)
    .innerJoin(users, eq(entries.userId, users.id))
    .leftJoin(thirdParties, eq(entries.thirdPartyId, thirdParties.id))
    .where(eq(entries.id, id))
    .limit(1);

  if (!entry) {
    throw notFoundError("Entrada");
  }

  const itemRows = await executor
    .select({
      id: entryItems.id,
      entryId: entryItems.entryId,
      productId: entryItems.productId,
      warehouseId: entryItems.warehouseId,
      quantity: entryItems.quantity,
      unit: entryItems.unit,
      presentation: entryItems.presentation,
      sequence: entryItems.sequence,
      description: entryItems.description,
      nit: entryItems.nit,
      costCenterId: entryItems.costCenterId,
      location: entryItems.location,
      value: entryItems.value,
      debitCredit: entryItems.debitCredit,
      productCode: products.code,
      productName: products.name,
      warehouseCode: warehouses.code,
      warehouseName: warehouses.name,
      costCenterCode: costCenters.code,
    })
    .from(entryItems)
    .innerJoin(products, eq(entryItems.productId, products.id))
    .innerJoin(warehouses, eq(entryItems.warehouseId, warehouses.id))
    .leftJoin(costCenters, eq(entryItems.costCenterId, costCenters.id))
    .where(eq(entryItems.entryId, id))
    .orderBy(entryItems.sequence);

  const lots = await executor
    .select({
      id: entryItemLots.id,
      entryItemId: entryItemLots.entryItemId,
      productId: entryItemLots.productId,
      code: entryItemLots.code,
      description: entryItemLots.description,
      expirationDate: entryItemLots.expirationDate,
      quantity: entryItemLots.quantity,
    })
    .from(entryItemLots)
    .innerJoin(entryItems, eq(entryItemLots.entryItemId, entryItems.id))
    .where(eq(entryItems.entryId, id))
    .orderBy(entryItemLots.createdAt);

  const thirdPartyRows = entry.thirdPartyId
    ? await executor
        .select({
          id: thirdParties.id,
          nit: thirdParties.nit,
          branch: thirdParties.branch,
          name: thirdParties.name,
          type: thirdParties.type,
          address: thirdParties.address,
          phone: thirdParties.phone,
          city: thirdParties.city,
        })
        .from(thirdParties)
        .where(eq(thirdParties.id, entry.thirdPartyId))
        .limit(1)
    : [];

  const thirdParty = thirdPartyRows[0] ?? null;

  return {
    ...entry,
    thirdParty: thirdParty ?? null,
    items: itemRows.map((item) => ({
      ...item,
      lots: lots.filter((lot) => lot.entryItemId === item.id),
    })),
  };
}

/**
 * Crea una entrada. Si la entrada queda CONFIRMADA, actualiza el inventario.
 */
export async function createEntry(
  executor: DbExecutor,
  input: CreateEntryInput,
  userId: string
) {
  const entryType = getEntryType(input.format);

  // --- Entidad que entrega los productos ---
  const thirdParty = input.thirdPartyId
    ? await assertActiveThirdParty(executor, input.thirdPartyId)
    : null;

  const nit = input.nit?.trim() || thirdParty?.nit || null;
  const origin = input.origin?.trim() || thirdParty?.name || null;

  // --- Número del documento ---
  // Si el usuario no escribe uno, se asigna el consecutivo del tipo.
  // El contador es atómico: dos usuarios simultáneos no repiten número.
  const number = input.number?.trim()
    ? input.number.trim()
    : await nextEntryDocumentCode(executor, input.format as EntryTypeCode);

  const duplicate = await executor
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe una entrada con el número ${number}`);
  }

  // --- Validación de productos, bodegas y lotes ---
  for (const [index, item] of input.items.entries()) {
    await assertActiveProduct(executor, item.productId);
    await assertActiveWarehouse(executor, item.warehouseId);

    // Si la línea tiene lotes, sus cantidades deben sumar la cantidad total.
    if (item.lots.length > 0) {
      const lotTotal = item.lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const difference = Math.abs(lotTotal - item.quantity);

      if (difference > 0.001) {
        throw businessRuleError(
          `El producto de la línea ${index + 1} tiene lotes por ${lotTotal} y una cantidad de ${item.quantity}. ` +
            "Las cantidades por lote deben coincidir con la cantidad total."
        );
      }
    }
  }

  // --- Cabecera ---
  const [entry] = await executor
    .insert(entries)
    .values({
      format: input.format,
      number,
      date: toIsoDate(input.date),
      nit,
      origin,
      document: input.document || null,
      status: input.status,
      userId,
      notes: input.notes || null,
      thirdPartyId: thirdParty?.id ?? null,
      costCenterId: input.costCenterId ?? null,
      purchaseOrder: input.purchaseOrder?.trim() || null,
      sellerNumber: input.sellerNumber,
    })
    .returning();

  // --- Detalle ---
  const insertedItems = [];

  for (const [index, item] of input.items.entries()) {
    const [inserted] = await executor
      .insert(entryItems)
      .values({
        entryId: entry.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unit: item.unit,
        presentation: item.presentation || null,
        sequence: index + 1,
        description: item.description || null,
        nit,
        costCenterId: item.costCenterId ?? input.costCenterId ?? null,
        location: item.location || null,
        value: item.value,
        debitCredit: item.debitCredit,
      })
      .returning();

    insertedItems.push({ ...inserted, lots: item.lots });

    // --- Lotes y vencimientos ---
    if (item.lots.length > 0) {
      await executor.insert(entryItemLots).values(
        item.lots.map((lot) => ({
          entryItemId: inserted.id,
          productId: item.productId,
          code: lot.code || null,
          description: lot.description || null,
          expirationDate: lot.expirationDate || null,
          quantity: lot.quantity,
        }))
      );
    }
  }

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
        notes: `Entrada ${number} (${entryType.documentCode})`,
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

  return { ...entry, items: insertedItems };
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
 * Bodegas activas, para el desplegable del formulario.
 */
export async function listEntryWarehouses(executor: DbExecutor) {
  return executor
    .select({ id: warehouses.id, name: warehouses.name, code: warehouses.code, type: warehouses.type })
    .from(warehouses)
    .where(eq(warehouses.status, "ACTIVE"));
}
