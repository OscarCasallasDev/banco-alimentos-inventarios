import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { products, inventory, entries, dispatches, audits, auditItems } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

/**
 * API Route: Dashboard
 * Retorna estadísticas generales del sistema.
 */
export async function GET() {
  try {
    const db = getDb();

    // Total de productos activos
    const [productCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.status, "ACTIVE"));

    // Total de unidades en inventario
    const [unitCount] = await db
      .select({ total: sql<number>`coalesce(sum(${inventory.quantity}), 0)` })
      .from(inventory);

    // Entradas recientes (últimas 5)
    const recentEntries = await db
      .select({
        id: entries.id,
        number: entries.number,
        date: entries.date,
        format: entries.format,
      })
      .from(entries)
      .orderBy(desc(entries.createdAt))
      .limit(5);

    // Salidas recientes (últimas 5)
    const recentExits = await db
      .select({
        id: dispatches.id,
        number: dispatches.number,
        date: dispatches.date,
      })
      .from(dispatches)
      .orderBy(desc(dispatches.createdAt))
      .limit(5);

    // Productos con stock bajo
    const lowStockProducts = await db
      .select({
        id: products.id,
        name: products.name,
        code: products.code,
        minStock: products.minStock,
      })
      .from(products)
      .innerJoin(inventory, eq(products.id, inventory.productId))
      .where(and(eq(products.status, "ACTIVE")))
      .limit(5);

    // Auditorías pendientes
    const [pendingAudits] = await db
      .select({ count: sql<number>`count(*)` })
      .from(audits)
      .where(eq(audits.status, "PENDING"));

    // Diferencias detectadas (auditorías con diferencias)
    const [detectedDifferences] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditItems)
      .where(sql`${auditItems.difference} != 0`);

    return NextResponse.json({
      success: true,
      data: {
        totalProducts: Number(productCount?.count || 0),
        totalUnits: Number(unitCount?.total || 0),
        recentEntries,
        recentExits,
        lowStockProducts,
        pendingAudits: Number(pendingAudits?.count || 0),
        detectedDifferences: Number(detectedDifferences?.count || 0),
      },
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error al obtener datos del dashboard",
        },
      },
      { status: 500 }
    );
  }
}
