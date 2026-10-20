/**
 * Servicio de inventario y movimientos de existencias
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Concentra TODAS las reglas que mueven stock:
 *   - Regla 6: toda entrada afecta el inventario.
 *   - Regla 7: toda salida confirmada disminuye el inventario.
 *   - Regla 3: no se permiten salidas superiores a la existencia.
 *   - Regla 5: los movimientos históricos no se modifican, solo se agregan.
 */

import { and, desc, eq } from "drizzle-orm";
import { inventory, inventoryMovements, products, warehouses } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { insufficientStockError, notFoundError, businessRuleError } from "@/lib/utils/errors";

export type MovementKind = "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";

export interface StockMovementInput {
  /** Tipo de movimiento. ENTRY suma, EXIT resta, ADJUSTMENT/AUDIT fijan el saldo. */
  type: MovementKind;
  productId: string;
  warehouseId: string;
  /** Cantidad con signo: positiva suma, negativa resta. */
  quantity: number;
  documentId?: string | null;
  documentType?: string | null;
  userId: string;
  notes?: string | null;
}

export interface StockLevel {
  productId: string;
  warehouseId: string;
  quantity: number;
}

/**
 * Obtiene la existencia actual de un producto en una bodega.
 */
export async function getStock(
  executor: DbExecutor,
  productId: string,
  warehouseId: string
): Promise<number> {
  const [row] = await executor
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(
      and(
        eq(inventory.productId, productId),
        eq(inventory.warehouseId, warehouseId)
      )
    )
    .limit(1);

  return row?.quantity ?? 0;
}

/**
 * Aplica un movimiento de inventario y deja el rastro en
 * `inventory_movements`. Devuelve el saldo resultante.
 *
 * Debe invocarse dentro de una transacción: el bloqueo de fila (`FOR UPDATE`)
 * garantiza que dos salidas simultáneas no gasten el mismo stock.
 */
export async function applyStockMovement(
  executor: DbExecutor,
  input: StockMovementInput
): Promise<number> {
  const [current] = await executor
    .select({
      id: inventory.id,
      quantity: inventory.quantity,
    })
    .from(inventory)
    .where(
      and(
        eq(inventory.productId, input.productId),
        eq(inventory.warehouseId, input.warehouseId)
      )
    )
    .for("update");

  const currentQuantity = current?.quantity ?? 0;
  const balanceAfter = currentQuantity + input.quantity;

  // Regla 3: no se permiten existencias negativas.
  if (balanceAfter < 0) {
    const [product] = await executor
      .select({ name: products.name, code: products.code })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    const [warehouse] = await executor
      .select({ name: warehouses.name })
      .from(warehouses)
      .where(eq(warehouses.id, input.warehouseId))
      .limit(1);

    throw insufficientStockError(
      `Stock insuficiente para ${product?.name ?? "producto"} (${product?.code ?? ""}) en ${warehouse?.name ?? "bodega"}. ` +
        `Existencia actual: ${currentQuantity}, solicitado: ${Math.abs(input.quantity)}`
    );
  }

  const now = new Date();

  if (current) {
    await executor
      .update(inventory)
      .set({
        quantity: balanceAfter,
        lastMovementAt: now,
        updatedAt: now,
      })
      .where(eq(inventory.id, current.id));
  } else {
    await executor.insert(inventory).values({
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: balanceAfter,
      lastMovementAt: now,
    });
  }

  // Regla 5: el movimiento es inmutable; solo se agrega.
  await executor.insert(inventoryMovements).values({
    type: input.type,
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    balanceAfter,
    documentId: input.documentId ?? null,
    documentType: input.documentType ?? null,
    userId: input.userId,
    notes: input.notes ?? null,
  });

  return balanceAfter;
}

/**
 * Fija la existencia de un producto al valor físico verificado en una auditoría
 * y registra el movimiento de ajuste correspondiente.
 */
export async function adjustStockToPhysical(
  executor: DbExecutor,
  input: {
    productId: string;
    warehouseId: string;
    physicalQuantity: number;
    documentId: string;
    userId: string;
    notes?: string | null;
  }
): Promise<number> {
  const current = await getStock(executor, input.productId, input.warehouseId);
  const difference = input.physicalQuantity - current;

  if (difference === 0) {
    return current;
  }

  return applyStockMovement(executor, {
    type: "ADJUSTMENT",
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: difference,
    documentId: input.documentId,
    documentType: "AUDIT",
    userId: input.userId,
    notes: input.notes ?? "Ajuste por auditoría física",
  });
}

/**
 * Lista el inventario con el nombre y código del producto y de la bodega.
 */
export async function listInventory(executor: DbExecutor) {
  return executor
    .select({
      id: inventory.id,
      productId: inventory.productId,
      warehouseId: inventory.warehouseId,
      quantity: inventory.quantity,
      lastMovementAt: inventory.lastMovementAt,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
      productName: products.name,
      productCode: products.code,
      productUnit: products.unit,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
    .orderBy(desc(inventory.updatedAt));
}

/**
 * Lista los movimientos de inventario más recientes.
 */
export async function listMovements(
  executor: DbExecutor,
  limit = 100
) {
  return executor
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      productId: inventoryMovements.productId,
      warehouseId: inventoryMovements.warehouseId,
      quantity: inventoryMovements.quantity,
      balanceAfter: inventoryMovements.balanceAfter,
      documentId: inventoryMovements.documentId,
      documentType: inventoryMovements.documentType,
      userId: inventoryMovements.userId,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
      productName: products.name,
      productCode: products.code,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);
}

/**
 * Verifica que un producto exista y esté activo.
 */
export async function assertActiveProduct(
  executor: DbExecutor,
  productId: string
): Promise<{ id: string; name: string; code: string; unit: string }> {
  const [product] = await executor
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      unit: products.unit,
      status: products.status,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw notFoundError("Producto");
  }

  if (product.status !== "ACTIVE") {
    throw businessRuleError(
      `El producto ${product.code} (${product.name}) está inactivo y no admite movimientos`
    );
  }

  return product;
}

/**
 * Verifica que una bodega exista y esté activa.
 */
export async function assertActiveWarehouse(
  executor: DbExecutor,
  warehouseId: string
): Promise<{ id: string; name: string; code: string }> {
  const [warehouse] = await executor
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
      status: warehouses.status,
    })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);

  if (!warehouse) {
    throw notFoundError("Bodega");
  }

  if (warehouse.status !== "ACTIVE") {
    throw businessRuleError(
      `La bodega ${warehouse.code} (${warehouse.name}) está inactiva y no admite movimientos`
    );
  }

  return warehouse;
}
