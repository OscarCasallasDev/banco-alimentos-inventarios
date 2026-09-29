import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { invoices, invoiceItems, orders, orderItems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const invoiceSchema = z.object({
  format: z.enum(["SF1", "F2"]),
  number: z.string().min(1, "El número es requerido"),
  orderId: z.string().uuid("Pedido inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["DRAFT", "GENERATED", "ASSOCIATED_TO_RECEIPT", "CANCELLED"]).optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allInvoices = await db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.createdAt));

    return NextResponse.json({ success: true, data: allInvoices });
  } catch (error) {
    console.error("Error obteniendo facturas:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener facturas" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = invoiceSchema.parse(body);

    const db = getDb();

    // Obtener items del pedido
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, data.orderId));

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "EMPTY_ORDER", message: "El pedido no tiene items" } },
        { status: 400 }
      );
    }

    // Crear factura
    const [newInvoice] = await db
      .insert(invoices)
      .values({
        format: data.format,
        number: data.number,
        orderId: data.orderId,
        date: data.date,
        status: data.status || "DRAFT",
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Crear items de factura
    for (const item of items) {
      await db.insert(invoiceItems).values({
        invoiceId: newInvoice.id,
        productId: item.productId,
        quantity: item.quantity,
      });
    }

    // Actualizar estado del pedido
    await db
      .update(orders)
      .set({ status: "INVOICED", updatedAt: new Date() })
      .where(eq(orders.id, data.orderId));

    return NextResponse.json({ success: true, data: newInvoice }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando factura:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear factura" } },
      { status: 500 }
    );
  }
}
