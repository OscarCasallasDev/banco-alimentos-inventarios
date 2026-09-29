import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { orders, orderItems, inventory } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

const orderItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  quantity: z.number().int().positive("La cantidad debe ser positiva"),
});

const orderSchema = z.object({
  number: z.string().min(1, "El número es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  nit: z.string().optional(),
  destination: z.string().optional(),
  status: z.enum(["DRAFT", "APPROVED", "INVOICED", "DISPATCHED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Debe tener al menos un item"),
});

export async function GET() {
  try {
    const db = getDb();
    const allOrders = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({ success: true, data: allOrders });
  } catch (error) {
    console.error("Error obteniendo pedidos:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener pedidos" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = orderSchema.parse(body);

    const db = getDb();

    // Verificar stock disponible
    for (const item of data.items) {
      const [inv] = await db
        .select()
        .from(inventory)
        .where(and(eq(inventory.productId, item.productId), eq(inventory.warehouseId, item.warehouseId)))
        .limit(1);

      if (!inv || inv.quantity < item.quantity) {
        return NextResponse.json(
          { success: false, error: { code: "INSUFFICIENT_STOCK", message: "Stock insuficiente" } },
          { status: 400 }
        );
      }
    }

    // Crear pedido
    const [newOrder] = await db
      .insert(orders)
      .values({
        number: data.number,
        date: data.date,
        nit: data.nit,
        destination: data.destination,
        status: data.status || "DRAFT",
        notes: data.notes,
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Crear items
    for (const item of data.items) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
      });
    }

    return NextResponse.json({ success: true, data: newOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando pedido:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear pedido" } },
      { status: 500 }
    );
  }
}
