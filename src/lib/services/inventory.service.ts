/**
 * Servicio de inventario y movimientos de existencias
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El inventario agregado (`inventory.quantity`) es una caché materializada.
 * La fuente de verdad por lote es `lots.quantity_available` y el libro
 * inmutable `inventory_movements`. Toda operación debe:
 *   1. bloquear el lote y el saldo agregado,
 *   2. actualizar el lote,
 *   3. actualizar el agregado,
 *   4. insertar el movimiento con `lot_id` y `lot_balance_after`.
 *
 * `v_inventory_reconciliation` permite verificar que el agregado y los lotes
 * coinciden. Nunca se suman las tres capas entre sí.
 */

import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  inventory,
  inventoryMovements,
  lots,
  products,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import {
  businessRuleError,
  insufficientStockError,
  notFoundError,
} from "@/lib/utils/errors";
import { bankTodayIso } from "@/lib/utils/dates";

export type MovementKind = "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";

export interface StockLevel {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface LedgerMovementLine {
  lotId: string;
  productId: string;
  warehouseId: string;
  /** Positivo para entradas, negativo para salidas. */
  quantityDelta: number;
  /** Saldo del lote DESPUÉS de la operación. */
  lotBalanceAfter: number;
}

export interface LedgerMovementMeta {
  type: MovementKind;
  documentId?: string | null;
  documentType?: string | null;
  userId: string;
  notes?: string | null;
}

const QUANTITY_EPSILON = 0.0005;

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

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
 * Bloquea de forma transaccional el saldo agregado de un producto/bodega.
 *
 * El bloqueo de asesoría evita la carrera cuando la fila de `inventory`
 * todavía no existe: dos transacciones no pueden crear/actualizar a la vez
 * la misma clave lógica.
 */
async function lockInventoryBalance(
  executor: DbExecutor,
  productId: string,
  warehouseId: string
) {
  const key = `${productId}:${warehouseId}`;
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  );

  const [current] = await executor
    .select({
      id: inventory.id,
      quantity: inventory.quantity,
    })
    .from(inventory)
    .where(
      and(
        eq(inventory.productId, productId),
        eq(inventory.warehouseId, warehouseId)
      )
    )
    .for("update");

  return current ?? null;
}

/**
 * Aplica un delta al saldo agregado. Devuelve el saldo resultante.
 * Regla 3: nunca se permite un saldo negativo.
 */
export async function applyInventoryDelta(
  executor: DbExecutor,
  input: {
    productId: string;
    warehouseId: string;
    delta: number;
  }
): Promise<number> {
  const delta = roundQuantity(input.delta);
  if (delta === 0) {
    return getStock(executor, input.productId, input.warehouseId);
  }

  const current = await lockInventoryBalance(
    executor,
    input.productId,
    input.warehouseId
  );

  const currentQuantity = current?.quantity ?? 0;
  const balanceAfter = roundQuantity(currentQuantity + delta);
  const now = new Date();

  if (balanceAfter < -QUANTITY_EPSILON) {
    await throwInsufficientStock(
      executor,
      input.productId,
      input.warehouseId,
      currentQuantity,
      Math.abs(delta)
    );
  }

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

  return balanceAfter;
}

/**
 * Registra movimientos por lote y actualiza el agregado UNA sola vez por
 * producto/bodega. El llamador ya debe haber actualizado `lots`.
 */
export async function recordStockMovements(
  executor: DbExecutor,
  lines: LedgerMovementLine[],
  meta: LedgerMovementMeta
): Promise<Map<string, number>> {
  const groups = new Map<
    string,
    {
      productId: string;
      warehouseId: string;
      delta: number;
      lines: LedgerMovementLine[];
    }
  >();

  for (const line of lines) {
    if (Math.abs(line.quantityDelta) < QUANTITY_EPSILON) continue;

    const key = `${line.productId}:${line.warehouseId}`;
    const group = groups.get(key) ?? {
      productId: line.productId,
      warehouseId: line.warehouseId,
      delta: 0,
      lines: [],
    };

    group.delta = roundQuantity(group.delta + line.quantityDelta);
    group.lines.push(line);
    groups.set(key, group);
  }

  const balances = new Map<string, number>();

  for (const [key, group] of groups) {
    const balanceAfter = await applyInventoryDelta(executor, {
      productId: group.productId,
      warehouseId: group.warehouseId,
      delta: group.delta,
    });

    balances.set(key, balanceAfter);

    await executor.insert(inventoryMovements).values(
      group.lines.map((line) => ({
        type: meta.type,
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantity: roundQuantity(line.quantityDelta),
        balanceAfter,
        lotId: line.lotId,
        lotBalanceAfter: roundQuantity(line.lotBalanceAfter),
        documentId: meta.documentId ?? null,
        documentType: meta.documentType ?? null,
        userId: meta.userId,
        notes: meta.notes ?? null,
      }))
    );
  }

  return balances;
}

/**
 * Activa los lotes de una entrada DRAFT y les asigna su cantidad recibida.
 */
export async function activateDraftLots(
  executor: DbExecutor,
  lotIds: string[]
): Promise<
  {
    id: string;
    productId: string;
    warehouseId: string;
    code: string;
    quantityAvailable: number;
  }[]
> {
  const activated: {
    id: string;
    productId: string;
    warehouseId: string;
    code: string;
    quantityAvailable: number;
  }[] = [];

  for (const lotId of lotIds) {
    const [updated] = await executor
      .update(lots)
      .set({
        status: "ACTIVE",
        quantityAvailable: sql`${lots.quantityReceived}`,
        updatedAt: new Date(),
      })
      .where(and(eq(lots.id, lotId), eq(lots.status, "DRAFT")))
      .returning({
        id: lots.id,
        productId: lots.productId,
        warehouseId: lots.warehouseId,
        code: lots.code,
        quantityAvailable: lots.quantityAvailable,
      });

    if (updated) activated.push(updated);
  }

  return activated;
}

/**
 * Descuenta una cantidad de un lote ya bloqueado por el llamador.
 */
export async function consumeLot(
  executor: DbExecutor,
  input: { lotId: string; quantity: number }
): Promise<{ quantityAvailable: number; code: string }> {
  const quantity = roundQuantity(input.quantity);

  const [lot] = await executor
    .select({
      id: lots.id,
      code: lots.code,
      quantityAvailable: lots.quantityAvailable,
    })
    .from(lots)
    .where(eq(lots.id, input.lotId))
    .for("update");

  if (!lot) {
    throw notFoundError("Lote");
  }

  const balance = roundQuantity(lot.quantityAvailable - quantity);

  if (balance < -QUANTITY_EPSILON) {
    throw insufficientStockError(
      `El lote ${lot.code} no tiene existencia suficiente. Disponible: ${lot.quantityAvailable}, solicitado: ${quantity}`
    );
  }

  await executor
    .update(lots)
    .set({
      quantityAvailable: balance,
      status: balance <= QUANTITY_EPSILON ? "DEPLETED" : "ACTIVE",
      updatedAt: new Date(),
    })
    .where(eq(lots.id, input.lotId));

  return { quantityAvailable: Math.max(0, balance), code: lot.code };
}

async function throwInsufficientStock(
  executor: DbExecutor,
  productId: string,
  warehouseId: string,
  currentQuantity: number,
  requested: number
): Promise<never> {
  const [product] = await executor
    .select({ name: products.name, code: products.code })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const [warehouse] = await executor
    .select({ name: warehouses.name })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);

  throw insufficientStockError(
    `Stock insuficiente para ${product?.name ?? "producto"} (${product?.code ?? ""}) en ${warehouse?.name ?? "bodega"}. ` +
      `Existencia actual: ${currentQuantity}, solicitado: ${requested}`
  );
}

/**
 * Lista el inventario agregado enriquecido con sus lotes activos.
 * Una sola consulta: no hay N+1 por producto.
 */
export async function listInventory(
  executor: DbExecutor,
  filters: {
    productId?: string;
    warehouseId?: string;
    search?: string;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const today = bankTodayIso();

  const conditions: SQL[] = [];

  if (filters.productId) {
    conditions.push(eq(inventory.productId, filters.productId));
  }
  if (filters.warehouseId) {
    conditions.push(eq(inventory.warehouseId, filters.warehouseId));
  }
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(products.code, pattern),
        ilike(warehouses.name, pattern),
        ilike(warehouses.code, pattern)
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = executor
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
      stockUnit: products.stockUnit,
      unitKind: products.unitKind,
      minStock: products.minStock,
      netWeightGrams: products.netWeightGrams,
      netVolumeMl: products.netVolumeMl,
      weightIsEstimate: products.weightIsEstimate,
      tracksExpiration: products.tracksExpiration,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      lotCount: sql<number>`count(${lots.id})::int`,
      lotQuantity: sql<number>`coalesce(sum(${lots.quantityAvailable}), 0)`,
      reconciliationDifference: sql<number>`round((${inventory.quantity} - coalesce(sum(${lots.quantityAvailable}), 0))::numeric, 3)`,
      totalWeightKg: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0)), 0) / 1000)::numeric, 3)`,
      totalVolumeL: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netVolumeMl}, 0)), 0) / 1000)::numeric, 3)`,
      earliestExpiration: sql<string | null>`min(${lots.expirationDate})`,
      expiringLots: sql<number>`(count(${lots.id}) filter (where ${lots.expirationDate} is not null and ${lots.expirationDate} <= ${today}::date + 30))::int`,
      expiredLots: sql<number>`(count(${lots.id}) filter (where ${lots.expirationDate} is not null and ${lots.expirationDate} < ${today}::date))::int`,
      lotsWithoutWeight: sql<number>`(count(${lots.id}) filter (where ${lots.netWeightGrams} is null))::int`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
    .leftJoin(
      lots,
      and(
        eq(lots.productId, inventory.productId),
        eq(lots.warehouseId, inventory.warehouseId),
        eq(lots.status, "ACTIVE")
      )
    )
    .where(where)
    .groupBy(inventory.id, products.id, warehouses.id);

  const [rows, totalRow] = await Promise.all([
    baseQuery
      .orderBy(desc(inventory.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    executor
      .select({ total: count() })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
      .where(where),
  ]);

  const items = rows
    .map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      lotQuantity: Number(row.lotQuantity),
      totalWeightKg: Number(row.totalWeightKg),
      totalVolumeL: Number(row.totalVolumeL),
      reconciliationDifference: Number(row.reconciliationDifference),
    }))
    .filter((row) =>
      filters.lowStockOnly ? row.quantity < Number(row.minStock ?? 0) : true
    );

  const total = Number(totalRow[0]?.total ?? 0);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Lista los movimientos de inventario más recientes, con su lote.
 *
 * Es el libro de trazabilidad: cada salida registra qué lote se consumió,
 * cuánto saldo quedó en el lote y qué documento lo originó.
 */
export async function listMovements(
  executor: DbExecutor,
  filters: {
    productId?: string;
    lotId?: string;
    warehouseId?: string;
    type?: string;
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const conditions: SQL[] = [];

  if (filters.productId) {
    conditions.push(eq(inventoryMovements.productId, filters.productId));
  }
  if (filters.lotId) {
    conditions.push(eq(inventoryMovements.lotId, filters.lotId));
  }
  if (filters.warehouseId) {
    conditions.push(eq(inventoryMovements.warehouseId, filters.warehouseId));
  }
  if (filters.type && filters.type !== "ALL") {
    conditions.push(eq(inventoryMovements.type, filters.type as "ENTRY"));
  }
  if (filters.documentType && filters.documentType !== "ALL") {
    conditions.push(
      eq(inventoryMovements.documentType, filters.documentType)
    );
  }
  if (filters.dateFrom) {
    conditions.push(sql`${inventoryMovements.createdAt} >= ${filters.dateFrom}::date`);
  }
  if (filters.dateTo) {
    conditions.push(sql`${inventoryMovements.createdAt} < (${filters.dateTo}::date + interval '1 day')`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    executor
      .select({
        id: inventoryMovements.id,
        type: inventoryMovements.type,
        productId: inventoryMovements.productId,
        warehouseId: inventoryMovements.warehouseId,
        quantity: inventoryMovements.quantity,
        balanceAfter: inventoryMovements.balanceAfter,
        lotId: inventoryMovements.lotId,
        lotBalanceAfter: inventoryMovements.lotBalanceAfter,
        lotCode: lots.code,
        lotExpirationDate: lots.expirationDate,
        documentId: inventoryMovements.documentId,
        documentType: inventoryMovements.documentType,
        userId: inventoryMovements.userId,
        notes: inventoryMovements.notes,
        createdAt: inventoryMovements.createdAt,
        productName: products.name,
        productCode: products.code,
        stockUnit: products.stockUnit,
        unitKind: products.unitKind,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .leftJoin(lots, eq(inventoryMovements.lotId, lots.id))
      .where(where)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    executor
      .select({ total: count() })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(where),
  ]);

  const total = Number(totalRow[0]?.total ?? 0);

  return {
    items: rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      balanceAfter: Number(row.balanceAfter),
      lotBalanceAfter:
        row.lotBalanceAfter === null ? null : Number(row.lotBalanceAfter),
      /** Movimientos anteriores al modelo de lotes: se identifican, no se inventan. */
      isHistorical: row.lotId === null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Verifica que un producto exista y esté activo.
 */
export async function assertActiveProduct(
  executor: DbExecutor,
  productId: string
) {
  const [product] = await executor
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      unit: products.unit,
      stockUnit: products.stockUnit,
      unitKind: products.unitKind,
      netWeightGrams: products.netWeightGrams,
      netVolumeMl: products.netVolumeMl,
      weightIsEstimate: products.weightIsEstimate,
      tracksExpiration: products.tracksExpiration,
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

/**
 * Diferencias entre el agregado y la suma de lotes. Debe estar vacío.
 */
export async function listReconciliationIssues(executor: DbExecutor) {
  return executor.execute(sql`
    select *
    from v_inventory_reconciliation
    where abs(difference) > 0.0005
    order by difference desc
  `);
}
