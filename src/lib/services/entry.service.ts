/**
 * Servicio de entradas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Flujo de una entrada:
 *   1. Se valida el documento y sus ítems (Zod).
 *   2. Se resuelve la entidad que entrega los productos (tercero).
 *   3. Se asigna el código documental (consecutivo atómico por tipo).
 *   4. Se guarda la cabecera (`entries`) y el detalle (`entry_items`).
 *   5. Se crea un lote por cada lote informado. Si la línea no informa lotes,
 *      se crea un único lote automático sin fecha de vencimiento inventada.
 *   6. Si la entrada queda CONFIRMADA, se activan los lotes y se aplica el
 *      stock en la misma transacción (regla 6).
 *
 * La creación y la confirmación son idempotentes mediante
 * `entries.stock_applied_at`; un doble clic no descuenta ni suma dos veces.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  costCenters,
  entries,
  entryItems,
  lots,
  products,
  thirdParties,
  users,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { businessRuleError, conflictError, notFoundError } from "@/lib/utils/errors";
import { toIsoDate } from "@/lib/utils";
import { type EntryTypeCode } from "@/lib/entries/entry-types";
import type { CreateEntryInput } from "@/lib/validations/schemas";
import {
  activateDraftLots,
  assertActiveProduct,
  assertActiveWarehouse,
} from "./inventory.service";
import {
  applyEntryLots,
  createAutoLotForDraft,
  createEntryItemLots,
  type CreatedLot,
} from "./lot.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";
import { nextEntryDocumentCode } from "./sequence.service";
import { assertActiveThirdParty } from "./third-party.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

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
      stockAppliedAt: entries.stockAppliedAt,
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
      stockAppliedAt: entries.stockAppliedAt,
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

  const lotRows = await executor
    .select({
      id: lots.id,
      entryItemId: lots.entryItemId,
      productId: lots.productId,
      code: lots.code,
      externalCode: lots.externalCode,
      description: lots.description,
      expirationDate: lots.expirationDate,
      quantityReceived: lots.quantityReceived,
      quantityAvailable: lots.quantityAvailable,
      stockUnit: lots.stockUnit,
      unitKind: lots.unitKind,
      presentation: lots.presentation,
      status: lots.status,
      traceability: lots.traceability,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
      weightIsEstimate: lots.weightIsEstimate,
    })
    .from(lots)
    .innerJoin(entryItems, eq(lots.entryItemId, entryItems.id))
    .where(eq(entryItems.entryId, id))
    .orderBy(lots.createdAt);

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
      lots: lotRows.filter((lot) => lot.entryItemId === item.id),
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
  // --- Entidad que entrega los productos ---
  const thirdParty = input.thirdPartyId
    ? await assertActiveThirdParty(executor, input.thirdPartyId)
    : null;

  const nit = input.nit?.trim() || thirdParty?.nit || null;
  const origin = input.origin?.trim() || thirdParty?.name || null;

  // --- Número del documento ---
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
  const productsById = new Map<
    string,
    Awaited<ReturnType<typeof assertActiveProduct>>
  >();

  for (const [index, item] of input.items.entries()) {
    const product = await assertActiveProduct(executor, item.productId);
    productsById.set(item.productId, product);
    await assertActiveWarehouse(executor, item.warehouseId);

    if (item.lots.length > 0) {
      const lotTotal = item.lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const difference = Math.abs(lotTotal - item.quantity);

      if (difference > 0.001) {
        throw businessRuleError(
          `El producto de la línea ${index + 1} tiene lotes por ${lotTotal} y una cantidad de ${item.quantity}. ` +
            "Las cantidades por lote deben coincidir con la cantidad total."
        );
      }

      // Un producto que controla vencimiento exige una fecha O la
      // confirmación explícita de que no se conoce. Nunca se inventa una.
      if (product.tracksExpiration) {
        const withoutDate = item.lots.filter(
          (lot) => !lot.expirationDate && !lot.expirationUnknown
        );

        if (withoutDate.length > 0) {
          throw businessRuleError(
            `El producto ${product.code} (${product.name}) controla vencimiento. ` +
              `Informa la fecha de vencimiento del lote ${index + 1} o marca que se desconoce.`
          );
        }
      }
    }
  }

  // --- Cabecera ---
  let entry: typeof entries.$inferSelect;

  try {
    [entry] = await executor
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
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError(`Ya existe una entrada con el número ${number}`);
    }
    throw error;
  }

  // --- Detalle y lotes ---
  const insertedItems: (typeof entryItems.$inferSelect & {
    lots: CreatedLot[];
  })[] = [];
  const allLotRows: {
    id: string;
    productId: string;
    warehouseId: string;
    quantityAvailable: number;
  }[] = [];

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

    const product = productsById.get(item.productId);
    if (!product) throw notFoundError("Producto");

    const requestedLots =
      item.lots.length > 0
        ? item.lots.map((lot) => ({
            externalCode: lot.externalCode ?? lot.code,
            description: lot.description,
            expirationDate: lot.expirationDate,
            expirationUnknown: lot.expirationUnknown,
            expirationNote: lot.expirationNote,
            quantity: lot.quantity,
          }))
        : [
            {
              externalCode: undefined,
              description: "Lote generado automáticamente",
              expirationDate: undefined,
              expirationUnknown: !product.tracksExpiration,
              expirationNote: product.tracksExpiration
                ? "La entrada no informada lotes; el Banco debe completar el vencimiento."
                : undefined,
              quantity: item.quantity,
            },
          ];

    const createdLots = await createEntryItemLots(executor, {
      entryId: entry.id,
      entryItemId: inserted.id,
      product,
      warehouseId: item.warehouseId,
      entryDate: entry.date,
      userId,
      requestedLots,
      presentation: item.presentation || null,
      active: input.status === "CONFIRMED",
    });

    insertedItems.push({ ...inserted, lots: createdLots });

    if (input.status === "CONFIRMED") {
      allLotRows.push(
        ...createdLots.map((lot) => ({
          id: lot.id,
          productId: lot.productId,
          warehouseId: lot.warehouseId,
          quantityAvailable: lot.quantityAvailable,
        }))
      );
    }
  }

  // Regla 6: toda entrada confirmada afecta el inventario una sola vez.
  if (input.status === "CONFIRMED") {
    await applyEntryLots(executor, {
      entryId: entry.id,
      entryNumber: entry.number,
      userId,
      lotRows: allLotRows,
    });

    [entry] = await executor
      .update(entries)
      .set({ stockAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(entries.id, entry.id))
      .returning();
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
 * La fila se reclama atómicamente para que dos confirmaciones simultáneas
 * no apliquen el stock dos veces.
 */
export async function confirmEntry(
  executor: DbExecutor,
  id: string,
  userId: string
) {
  const [claimed] = await executor
    .update(entries)
    .set({
      status: "CONFIRMED",
      stockAppliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(entries.id, id),
        eq(entries.status, "DRAFT"),
        isNull(entries.stockAppliedAt)
      )
    )
    .returning();

  if (!claimed) {
    const [current] = await executor
      .select()
      .from(entries)
      .where(eq(entries.id, id))
      .limit(1);

    if (!current) throw notFoundError("Entrada");
    if (current.status === "CONFIRMED" || current.stockAppliedAt) {
      throw conflictError("La entrada ya está confirmada");
    }
    if (current.status === "CANCELLED") {
      throw conflictError("La entrada está cancelada y no puede confirmarse");
    }
    throw conflictError("La entrada no se puede confirmar en su estado actual");
  }

  const items = await executor
    .select()
    .from(entryItems)
    .where(eq(entryItems.entryId, id));

  const movementLots: {
    id: string;
    productId: string;
    warehouseId: string;
    quantityAvailable: number;
  }[] = [];

  for (const item of items) {
    const product = await assertActiveProduct(executor, item.productId);
    const itemLots = await executor
      .select()
      .from(lots)
      .where(eq(lots.entryItemId, item.id));

    if (itemLots.length === 0) {
      const autoLot = await createAutoLotForDraft(executor, {
        entryId: id,
        entryItemId: item.id,
        product,
        warehouseId: item.warehouseId,
        entryDate: claimed.date,
        quantity: item.quantity,
        userId,
        presentation: item.presentation || null,
      });

      movementLots.push({
        id: autoLot.id,
        productId: autoLot.productId,
        warehouseId: autoLot.warehouseId,
        quantityAvailable: autoLot.quantityAvailable,
      });
      continue;
    }

    // Se activan los lotes en borrador: pasan a ACTIVE y su cantidad
    // disponible es la cantidad recibida. Cada lote se contabiliza UNA vez.
    const draftIds = itemLots
      .filter((lot) => lot.status === "DRAFT")
      .map((lot) => lot.id);

    const activated = draftIds.length
      ? await activateDraftLots(executor, draftIds)
      : [];

    const activatedIds = new Set(activated.map((lot) => lot.id));

    for (const lot of itemLots) {
      if (lot.status === "DRAFT") continue;
      if (activatedIds.has(lot.id)) continue;

      movementLots.push({
        id: lot.id,
        productId: lot.productId,
        warehouseId: lot.warehouseId,
        quantityAvailable: lot.quantityReceived,
      });
    }

    movementLots.push(
      ...activated.map((lot) => ({
        id: lot.id,
        productId: lot.productId,
        warehouseId: lot.warehouseId,
        quantityAvailable: lot.quantityAvailable,
      }))
    );
  }

  await applyEntryLots(executor, {
    entryId: claimed.id,
    entryNumber: claimed.number,
    userId,
    lotRows: movementLots,
  });

  await recordAuditLog(executor, {
    userId,
    action: "ENTRY_CONFIRM",
    entity: "entries",
    entityId: claimed.id,
    details: `Entrada ${claimed.number} confirmada`,
  });

  return { ...claimed, items };
}

/**
 * Bodegas activas, para el desplegable del formulario.
 */
export async function listEntryWarehouses(executor: DbExecutor) {
  return executor
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
      type: warehouses.type,
    })
    .from(warehouses)
    .where(eq(warehouses.status, "ACTIVE"));
}
