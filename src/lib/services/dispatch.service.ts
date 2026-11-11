/**
 * Servicio de despachos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El despacho cierra el flujo de salida: Recibo → Despacho.
 * Los ítems se heredan del pedido asociado al recibo.
 *
 * Regla 7: todo despacho confirmado disminuye el inventario.
 * Regla 3: no se permiten despachos superiores a la existencia disponible.
 *
 * La salida consume LOTES, no solo el saldo agregado. Si el usuario no
 * elige lotes, se aplica FEFO (primero vence, primero sale). La selección
 * manual solo se acepta si la suma coincide con la línea.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  dispatchItemLots,
  dispatchItems,
  dispatches,
  invoiceItems,
  invoices,
  lots,
  orderItems,
  orders,
  receipts,
  users,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import {
  businessRuleError,
  conflictError,
  notFoundError,
} from "@/lib/utils/errors";
import { parseDocumentDate, toIsoDate } from "@/lib/utils";
import type { CreateDispatchInput } from "@/lib/validations/schemas";
import { recordStockMovements } from "./inventory.service";
import { allocateDispatchItemLots, getAvailableLotsForSelection } from "./lot.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";
import { nextDispatchDocumentCode } from "./sequence.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

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
      stockAppliedAt: dispatches.stockAppliedAt,
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

  if (rows.length === 0) return [];

  const items = await executor
    .select()
    .from(dispatchItems)
    .where(
      inArray(
        dispatchItems.dispatchId,
        rows.map((row) => row.id)
      )
    );

  const allocations = await executor
    .select({
      id: dispatchItemLots.id,
      dispatchItemId: dispatchItemLots.dispatchItemId,
      lotId: dispatchItemLots.lotId,
      lotCode: lots.code,
      quantity: dispatchItemLots.quantity,
      expirationDate: lots.expirationDate,
    })
    .from(dispatchItemLots)
    .innerJoin(lots, eq(dispatchItemLots.lotId, lots.id))
    .where(
      inArray(
        dispatchItemLots.dispatchItemId,
        items.map((item) => item.id)
      )
    );

  return rows.map((row) => ({
    ...row,
    items: items
      .filter((item) => item.dispatchId === row.id)
      .map((item) => ({
        ...item,
        lots: allocations.filter(
          (allocation) => allocation.dispatchItemId === item.id
        ),
      })),
  }));
}

/**
 * Obtiene un despacho con su detalle y los lotes asignados.
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

  const allocations = await executor
    .select({
      id: dispatchItemLots.id,
      dispatchItemId: dispatchItemLots.dispatchItemId,
      lotId: dispatchItemLots.lotId,
      lotCode: lots.code,
      quantity: dispatchItemLots.quantity,
      netWeightGrams: dispatchItemLots.netWeightGrams,
      netVolumeMl: dispatchItemLots.netVolumeMl,
      expirationDate: lots.expirationDate,
    })
    .from(dispatchItemLots)
    .innerJoin(lots, eq(dispatchItemLots.lotId, lots.id))
    .where(
      inArray(
        dispatchItemLots.dispatchItemId,
        items.map((item) => item.id)
      )
    );

  return {
    ...dispatch,
    items: items.map((item) => ({
      ...item,
      lots: allocations.filter(
        (allocation) => allocation.dispatchItemId === item.id
      ),
    })),
  };
}

/**
 * Disponibilidad de lotes para un despacho.
 *
 * Devuelve los ítems que se despacharían (heredados del pedido) y, para
 * cada uno, los lotes disponibles ordenados por FEFO con la cantidad
 * sugerida. Es la vista previa que el usuario confirma antes de despachar.
 */
export async function getDispatchAvailability(
  executor: DbExecutor,
  receiptId: string
) {
  const items = await resolveDispatchItems(executor, receiptId);

  const rows = [];

  for (const item of items) {
    const lots = await getAvailableLotsForSelection(executor, {
      productId: item.productId,
      warehouseId: item.warehouseId,
    });

    const usable = lots.filter((lot) => !lot.isExpired);
    const available = usable.reduce(
      (sum, lot) => sum + lot.quantityAvailable,
      0
    );

    // Propuesta FEFO: se cubren las primeras necesidades en orden.
    let remaining = item.quantity;
    const suggested = usable.map((lot) => {
      if (remaining <= 0) {
        return { lotId: lot.id, lotCode: lot.code, quantity: 0 };
      }

      const take = Math.min(remaining, lot.quantityAvailable);
      remaining -= take;

      return { lotId: lot.id, lotCode: lot.code, quantity: take };
    });

    rows.push({
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
      availableQuantity: available,
      sufficient: available + 0.0005 >= item.quantity,
      hasExpiredLots: lots.some((lot) => lot.isExpired),
      lots: lots.map((lot) => ({
        ...lot,
        suggestedQuantity:
          suggested.find((entry) => entry.lotId === lot.id)?.quantity ?? 0,
      })),
    });
  }

  return rows;
}

/**
 * Calcula el siguiente consecutivo de despacho del año.
 * Usa el contador atómico de `document_sequences`: nunca MAX()+1.
 */
async function nextDispatchNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  return nextDispatchDocumentCode(executor, date);
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

async function applyDispatchStock(
  executor: DbExecutor,
  input: {
    dispatchId: string;
    dispatchNumber: string;
    items: {
      id: string;
      productId: string;
      warehouseId: string;
      quantity: number;
    }[];
    allocations?: CreateDispatchInput["allocations"];
    userId: string;
  }
) {
  const movements = [];

  for (const item of input.items) {
    // La asignación manual se identifica por la línea del despacho. Si el
    // cliente no envía el id de la línea, se empareja por producto y bodega
    // (único cuando el pedido no repite producto en la misma bodega).
    const matching = (input.allocations ?? []).filter(
      (allocation) =>
        allocation.dispatchItemId === item.id ||
        (!allocation.dispatchItemId &&
          allocation.productId === item.productId &&
          allocation.warehouseId === item.warehouseId)
    );

    // Una misma asignación no puede aplicarse a dos líneas: se rechazaría
    // por falta de existencias, pero es mejor avisar antes.
    if (
      matching.length > 1 &&
      matching.every((allocation) => !allocation.dispatchItemId)
    ) {
      throw businessRuleError(
        "Hay más de una línea con el mismo producto y bodega: " +
          "indica el lote por línea para evitar repetir la asignación."
      );
    }

    const explicit = matching.flatMap((allocation) => allocation.lots);

    const itemMovements = await allocateDispatchItemLots(executor, {
      dispatchItemId: item.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
      explicit,
    });

    movements.push(...itemMovements);
  }

  await recordStockMovements(executor, movements, {
    type: "EXIT",
    documentId: input.dispatchId,
    documentType: "DISPATCH",
    userId: input.userId,
    notes: `Despacho ${input.dispatchNumber}`,
  });
}

/**
 * Crea un despacho a partir de un recibo.
 * Si el estado es DISPATCHED, descuenta los lotes y el inventario.
 */
export async function createDispatch(
  executor: DbExecutor,
  input: CreateDispatchInput,
  userId: string
) {
  const dispatchDate = parseDocumentDate(input.date);

  // Cada recibo genera un único despacho: el índice único lo garantiza
  // incluso si dos usuarios envían el formulario al mismo tiempo.
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

  let dispatch: typeof dispatches.$inferSelect;

  try {
    [dispatch] = await executor
      .insert(dispatches)
      .values({
        number,
        receiptId: input.receiptId,
        date: toIsoDate(input.date),
        status: input.status,
        userId,
        notes: input.notes || null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("El recibo ya tiene un despacho registrado");
    }
    throw error;
  }

  const insertedItems = await executor
    .insert(dispatchItems)
    .values(
      items.map((item) => ({
        dispatchId: dispatch.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
      }))
    )
    .returning();

  // Regla 7: todo despacho confirmado disminuye el inventario una sola vez.
  if (input.status === "DISPATCHED") {
    await applyDispatchStock(executor, {
      dispatchId: dispatch.id,
      dispatchNumber: number,
      items: insertedItems,
      allocations: input.allocations,
      userId,
    });

    [dispatch] = await executor
      .update(dispatches)
      .set({ stockAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(dispatches.id, dispatch.id))
      .returning();
  }

  // El pedido queda marcado como despachado solo si la salida ya se aplicó.
  if (input.status === "DISPATCHED") {
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

  return getDispatch(executor, dispatch.id);
}

/**
 * Confirma un despacho PENDING/PREPARED. Reclama la fila de forma atómica
 * para evitar que dos confirmaciones descuenten el stock dos veces.
 */
export async function confirmDispatch(
  executor: DbExecutor,
  id: string,
  userId: string,
  allocations?: CreateDispatchInput["allocations"]
) {
  const [claimed] = await executor
    .update(dispatches)
    .set({
      status: "DISPATCHED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dispatches.id, id),
        inArray(dispatches.status, ["PENDING", "PREPARED"]),
        isNull(dispatches.stockAppliedAt)
      )
    )
    .returning();

  if (!claimed) {
    const [current] = await executor
      .select()
      .from(dispatches)
      .where(eq(dispatches.id, id))
      .limit(1);

    if (!current) throw notFoundError("Despacho");
    if (current.status === "DISPATCHED" || current.stockAppliedAt) {
      throw conflictError("El despacho ya fue aplicado al inventario");
    }
    if (current.status === "CANCELLED") {
      throw conflictError("El despacho está cancelado");
    }
    throw businessRuleError("El despacho no se puede confirmar en su estado actual");
  }

  const items = await executor
    .select()
    .from(dispatchItems)
    .where(eq(dispatchItems.dispatchId, id));

  await applyDispatchStock(executor, {
    dispatchId: claimed.id,
    dispatchNumber: claimed.number,
    items,
    allocations,
    userId,
  });

  await executor
    .update(dispatches)
    .set({ stockAppliedAt: new Date(), updatedAt: new Date() })
    .where(eq(dispatches.id, claimed.id));

  await recordAuditLog(executor, {
    userId,
    action: "DISPATCH_CREATE",
    entity: "dispatches",
    entityId: claimed.id,
    details: `Despacho ${claimed.number} confirmado`,
  });

  return getDispatch(executor, claimed.id);
}
