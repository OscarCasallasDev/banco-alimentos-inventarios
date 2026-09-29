import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { receipts, invoices } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const receiptSchema = z.object({
  format: z.enum(["R1", "R2", "R3", "R4"]),
  number: z.string().min(1, "El número es requerido"),
  invoiceId: z.string().uuid("Factura inválida"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["DRAFT", "GENERATED", "CANCELLED"]).optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allReceipts = await db
      .select()
      .from(receipts)
      .orderBy(desc(receipts.createdAt));

    return NextResponse.json({ success: true, data: allReceipts });
  } catch (error) {
    console.error("Error obteniendo recibos:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener recibos" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = receiptSchema.parse(body);

    const db = getDb();

    // Crear recibo
    const [newReceipt] = await db
      .insert(receipts)
      .values({
        format: data.format,
        number: data.number,
        invoiceId: data.invoiceId,
        date: data.date,
        status: data.status || "DRAFT",
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Actualizar estado de la factura
    await db
      .update(invoices)
      .set({ status: "ASSOCIATED_TO_RECEIPT", updatedAt: new Date() })
      .where(eq(invoices.id, data.invoiceId));

    return NextResponse.json({ success: true, data: newReceipt }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando recibo:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear recibo" } },
      { status: 500 }
    );
  }
}
