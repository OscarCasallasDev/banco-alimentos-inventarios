/**
 * Servicio de reportes — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Genera los agregados que consume la pantalla de reportes:
 *   - Inventario consolidado por bodega.
 *   - Productos con existencia por debajo del mínimo.
 *   - Entradas recientes.
 *   - Diferencias detectadas en auditorías.
 */

import { desc, eq, sql } from "drizzle-orm";
import {
  auditItems,
  audits,
  entries,
  inventory,
  products,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";

export interface InventoryByWarehouseRow {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  totalProducts: number;
  totalUnits: number;
}

export interface LowStockRow {
  productId: string;
  productName: string;
  productCode: string;
  warehouseName: string;
  quantity: number;
  minStock: number;
}

export interface RecentEntryRow {
  id: string;
  number: string;
  format: string;
  date: string;
  status: string;
  createdAt: Date;
}

export interface AuditDifferenceRow {
  id: string;
  productName: string;
  productCode: string;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  observation: string | null;
  date: string;
  responsible: string;
}

export interface ReportSummary {
  inventoryByWarehouse: InventoryByWarehouseRow[];
  lowStock: LowStockRow[];
  recentEntries: RecentEntryRow[];
  auditDifferences: AuditDifferenceRow[];
}

/**
 * Construye el reporte completo.
 */
export async function getReportSummary(
  executor: DbExecutor
): Promise<ReportSummary> {
  const [inventoryByWarehouse, lowStock, recentEntries, auditDifferences] =
    await Promise.all([
      executor
        .select({
          warehouseId: warehouses.id,
          warehouseName: warehouses.name,
          warehouseCode: warehouses.code,
          totalProducts: sql<number>`count(distinct ${inventory.productId})::int`,
          totalUnits: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
        })
        .from(warehouses)
        .leftJoin(inventory, eq(inventory.warehouseId, warehouses.id))
        .groupBy(warehouses.id)
        .orderBy(warehouses.code),

      executor
        .select({
          productId: products.id,
          productName: products.name,
          productCode: products.code,
          warehouseName: warehouses.name,
          quantity: inventory.quantity,
          minStock: products.minStock,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(sql`${inventory.quantity} < ${products.minStock}`)
        .orderBy(products.code),

      executor
        .select({
          id: entries.id,
          number: entries.number,
          format: entries.format,
          date: entries.date,
          status: entries.status,
          createdAt: entries.createdAt,
        })
        .from(entries)
        .orderBy(desc(entries.createdAt))
        .limit(20),

      executor
        .select({
          id: auditItems.id,
          productName: products.name,
          productCode: products.code,
          systemQuantity: auditItems.systemQuantity,
          physicalQuantity: auditItems.physicalQuantity,
          difference: auditItems.difference,
          observation: auditItems.observation,
          date: audits.date,
          responsible: audits.responsible,
        })
        .from(auditItems)
        .innerJoin(audits, eq(auditItems.auditId, audits.id))
        .innerJoin(products, eq(auditItems.productId, products.id))
        .where(sql`${auditItems.difference} <> 0`)
        .orderBy(desc(audits.date))
        .limit(50),
    ]);

  return {
    inventoryByWarehouse,
    lowStock,
    recentEntries,
    auditDifferences,
  };
}
