/**
 * Servicio de indicadores (dashboard) — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Todos los indicadores se calculan en el BACKEND con consultas agregadas:
 * el navegador nunca recibe los lotes ni los movimientos para sumar en
 * memoria.
 *
 * Reglas de los indicadores:
 *   • Se informa la EXISTENCIA ACTUAL (lotes con cantidad disponible), no
 *     la cantidad histórica recibida.
 *   • Las unidades NO se suman entre naturalezas distintas: el conteo, la
 *     masa y el volumen se informan por separado.
 *   • El peso es el peso CONOCIDO. Cuando una parte de la mercancía no tiene
 *     contenido neto informado, se informa la cobertura para que el total no
 *     se lea como si fuera completo.
 *   • Las referencias del catálogo, los lotes y las unidades son tres
 *     conceptos distintos y se presentan como tales.
 */

import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  auditItems,
  audits,
  dispatches,
  entries,
  inventory,
  lots,
  products,
  users,
  warehouses,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { getExpiryAlerts, type ExpiryAlerts } from "./lot.service";
import type { UnitKind } from "@/lib/lots/weight";

export interface DashboardSummary {
  /** Referencias del catálogo activas. */
  totalProducts: number;
  /** Referencias del catálogo sin importar su estado. */
  totalCatalogProducts: number;
  /**
   * Unidades de conteo disponibles (UND, BOLSA, CAJA, LATA, PAQUETE…).
   * No incluye kilogramos ni litros.
   */
  totalUnits: number;
  /** Unidades de masa disponibles (kg, lb). */
  totalMassUnits: number;
  /** Unidades de volumen disponibles (L, ml). */
  totalVolumeUnits: number;
  /** Unidades agrupadas por naturaleza. */
  unitsByKind: Record<UnitKind, { quantity: number; lots: number }>;
  /** Peso neto disponible conocido, en kilogramos. */
  totalWeightKg: number;
  /** Volumen neto disponible conocido, en litros. */
  totalVolumeL: number;
  /** Porcentaje de lotes con peso conocido (0–100). */
  weightCoveragePercent: number;
  /** Lotes con existencia cuyo contenido neto se desconoce. */
  lotsWithoutNetContent: number;
  /** Lotes activos con existencia. */
  activeLots: number;
  /** Referencias de producto que tienen al menos un lote con existencia. */
  referencesWithStock: number;
  /** Diferencia entre el inventario agregado y la suma de los lotes. */
  reconciliationDifference: number;
  totalWarehouses: number;
  totalUsers: number;
  expiryAlerts: ExpiryAlerts;
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
    stockUnit: string;
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
    catalogCount,
    warehouseCount,
    userCount,
    lotTotals,
    unitsByKindRows,
    referencesWithStock,
    reconciliation,
    recentEntries,
    recentExits,
    stockByProduct,
    pendingAudits,
    differenceRows,
    expiryAlerts,
  ] = await Promise.all([
    executor.select({ total: count() }).from(products).where(
      eq(products.status, "ACTIVE")
    ),
    executor.select({ total: count() }).from(products),
    executor.select({ total: count() }).from(warehouses),
    executor.select({ total: count() }).from(users),
    executor
      .select({
        activeLots: sql<number>`(count(*) filter (where ${lots.quantityAvailable} > 0))::int`,
        totalWeightKg: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0)) filter (where ${lots.quantityAvailable} > 0), 0) / 1000)::numeric, 3)`,
        totalVolumeL: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netVolumeMl}, 0)) filter (where ${lots.quantityAvailable} > 0), 0) / 1000)::numeric, 3)`,
        lotsWithWeight: sql<number>`(count(*) filter (where ${lots.quantityAvailable} > 0 and ${lots.netWeightGrams} is not null))::int`,
        lotsWithoutNetContent: sql<number>`(count(*) filter (where ${lots.quantityAvailable} > 0 and ${lots.netWeightGrams} is null and ${lots.netVolumeMl} is null))::int`,
      })
      .from(lots)
      .where(eq(lots.status, "ACTIVE")),
    executor
      .select({
        unitKind: lots.unitKind,
        quantity: sql<number>`coalesce(sum(${lots.quantityAvailable}), 0)`,
        lots: sql<number>`count(*)::int`,
      })
      .from(lots)
      .where(and(eq(lots.status, "ACTIVE"), gt(lots.quantityAvailable, 0)))
      .groupBy(lots.unitKind),
    executor
      .select({ total: sql<number>`count(distinct ${lots.productId})::int` })
      .from(lots)
      .where(and(eq(lots.status, "ACTIVE"), gt(lots.quantityAvailable, 0))),
    executor
      .select({
        total: sql<number>`count(*)::int`,
        difference: sql<number>`coalesce(sum(abs(difference)), 0)`,
      })
      .from(
        sql`(select * from v_inventory_reconciliation where abs(difference) > 0.0005) as reconciliacion`
      ),
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
        stockUnit: products.stockUnit,
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
      .select({ total: count() })
      .from(audits)
      .where(inArray(audits.status, ["PENDING", "IN_PROGRESS"])),
    executor
      .select({ total: count() })
      .from(auditItems)
      .where(sql`${auditItems.difference} <> 0`),
    getExpiryAlerts(executor, { limit: 8 }),
  ]);

  const unitsByKind: DashboardSummary["unitsByKind"] = {
    COUNT: { quantity: 0, lots: 0 },
    MASS: { quantity: 0, lots: 0 },
    VOLUME: { quantity: 0, lots: 0 },
    UNKNOWN: { quantity: 0, lots: 0 },
  };

  for (const row of unitsByKindRows) {
    const key = (row.unitKind ?? "UNKNOWN") as UnitKind;
    const bucket = unitsByKind[key] ?? unitsByKind.UNKNOWN;
    bucket.quantity = Number(row.quantity);
    bucket.lots = Number(row.lots);
  }

  const lotsWithWeight = Number(lotTotals[0]?.lotsWithWeight ?? 0);
  const lotsWithoutNetContent = Number(lotTotals[0]?.lotsWithoutNetContent ?? 0);
  const totalLots = lotsWithWeight + lotsWithoutNetContent;

  return {
    totalProducts: Number(productCount[0]?.total ?? 0),
    totalCatalogProducts: Number(catalogCount[0]?.total ?? 0),
    totalUnits: unitsByKind.COUNT.quantity,
    totalMassUnits: unitsByKind.MASS.quantity,
    totalVolumeUnits: unitsByKind.VOLUME.quantity,
    unitsByKind,
    totalWeightKg: Number(lotTotals[0]?.totalWeightKg ?? 0),
    totalVolumeL: Number(lotTotals[0]?.totalVolumeL ?? 0),
    weightCoveragePercent:
      totalLots === 0
        ? 100
        : Math.round((lotsWithWeight / totalLots) * 1000) / 10,
    lotsWithoutNetContent,
    activeLots: Number(lotTotals[0]?.activeLots ?? 0),
    referencesWithStock: Number(referencesWithStock[0]?.total ?? 0),
    reconciliationDifference: Number(reconciliation[0]?.difference ?? 0),
    totalWarehouses: Number(warehouseCount[0]?.total ?? 0),
    totalUsers: Number(userCount[0]?.total ?? 0),
    expiryAlerts,
    recentEntries,
    recentExits,
    lowStockProducts: stockByProduct.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      minStock: Number(row.minStock),
      quantity: Number(row.quantity),
      stockUnit: row.stockUnit,
    })),
    pendingAudits: Number(pendingAudits[0]?.total ?? 0),
    detectedDifferences: Number(differenceRows[0]?.total ?? 0),
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
