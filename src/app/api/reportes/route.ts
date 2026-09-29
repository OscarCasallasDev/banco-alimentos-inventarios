import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { products, inventory, warehouses, entries, dispatches, auditItems } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET() {
  try {
    const db = getDb();

    // Resumen de inventario por bodega
    const inventoryByWarehouse = await db
      .select({
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        totalProducts: sql<number>`count(distinct ${inventory.productId})`,
        totalUnits: sql<number>`coalesce(sum(${inventory.quantity}), 0)`,
      })
      .from(inventory)
      .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
      .groupBy(warehouses.id, warehouses.name, warehouses.code);

    // Productos con stock bajo
    const lowStock = await db
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
      .orderBy(products.name);

    // Movimientos recientes
    const recentMovements = await db
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
      .limit(10);

    // Diferencias de auditoría
    const auditDifferences = await db
      .select({
        id: auditItems.id,
        productName: products.name,
        systemQuantity: auditItems.systemQuantity,
        physicalQuantity: auditItems.physicalQuantity,
        difference: auditItems.difference,
        observation: auditItems.observation,
      })
      .from(auditItems)
      .innerJoin(products, eq(auditItems.productId, products.id))
      .where(sql`${auditItems.difference} != 0`)
      .orderBy(desc(auditItems.createdAt))
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        inventoryByWarehouse,
        lowStock,
        recentMovements,
        auditDifferences,
      },
    });
  } catch (error) {
    console.error("Error generando reportes:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al generar reportes" } },
      { status: 500 }
    );
  }
}
