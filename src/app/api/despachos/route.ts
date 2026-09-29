import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { dispatches, dispatchItems, receipts, invoiceItems, inventory, inventoryMovements } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const dispatchSchema = z.object({
  number: z.string().min(1, "El número es requerido"),
  receiptId: z.string().uuid("Recibo inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["PENDING", "PREPARED", "DISPATCHED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allDispatches = await db
      .select()
      .from(dispatches)
      .orderBy(desc(dispatches.createdAt));

    return NextResponse.json({ success: true, data: allDispatches });
  } catch (error) {
    console.error("Error obteniendo despachos:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener despachos" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = dispatchSchema.parse(body);

    const db = getDb();

    // Obtener factura asociada al recibo
    const [receipt] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.id, data.receiptId))
      .limit(1);

    if (!receipt) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Recibo no encontrado" } },
        { status: 404 }
      );
    }

    // Obtener items de la factura
    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, receipt.invoiceId));

    // Verificar stock y crear despacho
    const [newDispatch] = await db
      .insert(dispatches)
      .values({
        number: data.number,
        receiptId: data.receiptId,
        date: data.date,
        status: data.status || "PENDING",
        notes: data.notes,
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Procesar items del despacho
    for (const item of items) {
      // Buscar inventario del producto
      const [inv] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.productId, item.productId))
        .limit(1);

      if (!inv || inv.quantity < item.quantity) {
        return NextResponse.json(
          { success: false, error: { code: "INSUFFICIENT_STOCK", message: "Stock insuficiente" } },
          { status: 400 }
        );
      }

      // Crear item de despacho
      await db.insert(dispatchItems).values({
        dispatchId: newDispatch.id,
        productId: item.productId,
        warehouseId: inv.warehouseId,
        quantity: item.quantity,
      });

      // Descontar inventario
      const newQuantity = inv.quantity - item.quantity;
      await db
        .update(inventory)
        .set({ quantity: newQuantity, lastMovementAt: new Date(), updatedAt: new Date() })
        .where(eq(inventory.id, inv.id));

      // Crear movimiento de inventario
      await db.insert(inventoryMovements).values({
        type: "EXIT",
        productId: item.productId,
        warehouseId: inv.warehouseId,
        quantity: item.quantity,
        balanceAfter: newQuantity,
        documentId: newDispatch.id,
        documentType: "DISPATCH",
        userId: "00000000-0000-0000-0000-000000000001",
        notes: `Despacho ${data.number}`,
      });
    }

    return NextResponse.json({ success: true, data: newDispatch }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando despacho:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear despacho" } },
      { status: 500 }
    );
  }
}
