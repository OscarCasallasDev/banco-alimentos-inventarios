/**
 * Servicio de indicadores (dashboard) — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditItems,
  audits,
  dispatches,
  entries,
  inventory,
  products,
  users,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";

export interface DashboardSummary {
  totalProducts: number;
  totalUnits: number;
  totalWarehouses: number;
  totalUsers: number;
  recentEntries: {
    id: string;
    number: string;
    date: string;
    format: string;
    status: string;
    origin: string | null;
  }[];
  recentExits: {
    id: string;
    number: string;
    date: string;
    status: string;
    notes: string | null;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    code: string;
    minStock: number;
    quantity: number;
  }[];
  pendingAudits: number;
  detectedDifferences: number;
}

/**
 * Calcula los indicadores del panel principal.
 */
export async function getDashboardSummary(
  executor: DbExecutor
): Promise<DashboardSummary> {
  const [
    productCount,
    warehouseCount,
    userCount,
    unitsRow,
    recentEntries,
    recentExits,
    stockByProduct,
    pendingAudits,
    differenceRows,
  ] = await Promise.all([
    executor.select({ id: products.id }).from(products),
    executor.select({ id: warehouses.id }).from(warehouses),
    executor.select({ id: users.id }).from(users),
    executor
      .select({ total: sql<number>`coalesce(sum(${inventory.quantity}), 0)` })
      .from(inventory),
    executor
      .select({
        id: entries.id,
        number: entries.number,
        date: entries.date,
        format: entries.format,
        status: entries.status,
        origin: entries.origin,
      })
      .from(entries)
      .orderBy(desc(entries.createdAt))
      .limit(5),
    executor
      .select({
        id: dispatches.id,
        number: dispatches.number,
        date: dispatches.date,
        status: dispatches.status,
        notes: dispatches.notes,
      })
      .from(dispatches)
      .orderBy(desc(dispatches.createdAt))
      .limit(5),
    executor
      .select({
        id: products.id,
        name: products.name,
        code: products.code,
        minStock: products.minStock,
        quantity: sql<number>`coalesce(sum(${inventory.quantity}), 0)`,
      })
      .from(products)
      .leftJoin(inventory, eq(inventory.productId, products.id))
      .where(eq(products.status, "ACTIVE"))
      .groupBy(products.id)
      .having(
        sql`coalesce(sum(${inventory.quantity}), 0) < ${products.minStock}`
      ),
    executor
      .select({ id: audits.id })
      .from(audits)
      .where(inArray(audits.status, ["PENDING", "IN_PROGRESS"])),
    executor
      .select({ id: auditItems.id })
      .from(auditItems)
      .where(sql`${auditItems.difference} <> 0`),
  ]);

  return {
    totalProducts: productCount.length,
    totalUnits: Number(unitsRow[0]?.total ?? 0),
    totalWarehouses: warehouseCount.length,
    totalUsers: userCount.length,
    recentEntries,
    recentExits,
    lowStockProducts: stockByProduct.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      minStock: row.minStock,
      quantity: Number(row.quantity),
    })),
    pendingAudits: pendingAudits.length,
    detectedDifferences: differenceRows.length,
  };
}

/**
 * Verifica que la base de datos esté disponible.
 */
export async function pingDatabase(executor: DbExecutor): Promise<boolean> {
  try {
    await executor.execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
