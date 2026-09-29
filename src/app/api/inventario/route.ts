import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { inventory, products, warehouses } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const db = getDb();
    const items = await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        productName: products.name,
        productCode: products.code,
        warehouseId: inventory.warehouseId,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        quantity: inventory.quantity,
        lastMovementAt: inventory.lastMovementAt,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
      .orderBy(products.name);

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error obteniendo inventario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener inventario" } },
      { status: 500 }
    );
  }
}
