/**
 * Servicio de pedidos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El pedido es la solicitud de salida. NO mueve inventario: el stock solo
 * disminuye cuando el despacho se marca como DISPATCHED (regla 7).
 */

import { desc, eq, like } from "drizzle-orm";
import { orderItems, orders, users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { parseDocumentDate, toIsoDate } from "@/lib/utils";
import { DOCUMENT_PREFIX, formatDocumentNumber } from "@/lib/utils/numbers";
import type { CreateOrderInput } from "@/lib/validations/schemas";
import {
  assertActiveProduct,
  assertActiveWarehouse,
  getStock,
} from "./inventory.service";
import { createDocument } from "./document.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista los pedidos con el detalle de sus ítems.
 */
export async function listOrders(executor: DbExecutor) {
  const rows = await executor
    .select({
      id: orders.id,
      number: orders.number,
      date: orders.date,
      nit: orders.nit,
      destination: orders.destination,
      status: orders.status,
      userId: orders.userId,
      notes: orders.notes,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.createdAt));

  const items = await executor.select().from(orderItems);

  return rows.map((row) => ({
    ...row,
    items: items.filter((item) => item.orderId === row.id),
  }));
}

/**
 * Obtiene un pedido con su detalle.
 */
export async function getOrder(executor: DbExecutor, id: string) {
  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!order) {
    throw notFoundError("Pedido");
  }

  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id));

  return { ...order, items };
}

/**
 * Calcula el siguiente consecutivo de pedido del año.
 */
async function nextOrderNumber(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const rows = await executor
    .select({ number: orders.number })
    .from(orders)
    .where(like(orders.number, `${DOCUMENT_PREFIX.ORDER}-${year}-%`));

  const sequence =
    rows.reduce((max, row) => {
      const value = Number(row.number.split("-").pop());
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;

  return formatDocumentNumber(DOCUMENT_PREFIX.ORDER, date, sequence);
}

/**
 * Crea un pedido con su detalle.
 */
export async function createOrder(
  executor: DbExecutor,
  input: CreateOrderInput,
  userId: string
) {
  const orderDate = parseDocumentDate(input.date);

  const number = input.number?.trim()
    ? input.number.trim()
    : await nextOrderNumber(executor, orderDate);

  const duplicate = await executor
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.number, number))
    .limit(1);

  if (duplicate.length > 0) {
    throw conflictError(`Ya existe un pedido con el número ${number}`);
  }

  for (const item of input.items) {
    await assertActiveProduct(executor, item.productId);
    await assertActiveWarehouse(executor, item.warehouseId);
  }

  const [order] = await executor
    .insert(orders)
    .values({
      number,
      date: toIsoDate(input.date),
      nit: input.nit || null,
      destination: input.destination || null,
      status: input.status,
      userId,
      notes: input.notes || null,
    })
    .returning();

  await executor.insert(orderItems).values(
    input.items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
    }))
  );

  await createDocument(executor, {
    type: "ORDER",
    number,
    relatedId: order.id,
    generatedBy: userId,
  });

  await recordAuditLog(executor, {
    userId,
    action: "ORDER_CREATE",
    entity: "orders",
    entityId: order.id,
    details: `Pedido ${number} con ${input.items.length} item(s)`,
  });

  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, items };
}

/**
 * Verifica que el stock alcance a cubrir el pedido (solo consulta).
 */
export async function checkOrderStock(
  executor: DbExecutor,
  orderId: string
): Promise<{ productName: string; requested: number; available: number }[]> {
  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const result: {
    productName: string;
    requested: number;
    available: number;
  }[] = [];

  for (const item of items) {
    const product = await assertActiveProduct(executor, item.productId);
    const available = await getStock(
      executor,
      item.productId,
      item.warehouseId
    );

    result.push({
      productName: product.name,
      requested: item.quantity,
      available,
    });
  }

  return result;
}
