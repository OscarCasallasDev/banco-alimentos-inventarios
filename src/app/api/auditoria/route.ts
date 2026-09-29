import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { audits, auditItems, warehouses, products } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const auditItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  systemQuantity: z.number().int().min(0),
  physicalQuantity: z.number().int().min(0),
  difference: z.number().int(),
  observation: z.string().optional(),
});

const auditSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  warehouseId: z.string().uuid("Bodega inválida"),
  responsible: z.string().min(1, "El responsable es requerido"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
  items: z.array(auditItemSchema).min(1, "Debe tener al menos un item"),
});

export async function GET() {
  try {
    const db = getDb();
    const allAudits = await db
      .select({
        id: audits.id,
        date: audits.date,
        warehouseId: audits.warehouseId,
        warehouseName: warehouses.name,
        responsible: audits.responsible,
        status: audits.status,
        notes: audits.notes,
        createdAt: audits.createdAt,
        updatedAt: audits.updatedAt,
      })
      .from(audits)
      .leftJoin(warehouses, eq(audits.warehouseId, warehouses.id))
      .orderBy(desc(audits.createdAt));

    return NextResponse.json({ success: true, data: allAudits });
  } catch (error) {
    console.error("Error obteniendo auditorías:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener auditorías" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = auditSchema.parse(body);

    const db = getDb();

    // Crear auditoría
    const [newAudit] = await db
      .insert(audits)
      .values({
        date: data.date,
        warehouseId: data.warehouseId,
        responsible: data.responsible,
        status: data.status || "PENDING",
        notes: data.notes,
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Crear items de auditoría
    for (const item of data.items) {
      await db.insert(auditItems).values({
        auditId: newAudit.id,
        productId: item.productId,
        systemQuantity: item.systemQuantity,
        physicalQuantity: item.physicalQuantity,
        difference: item.difference,
        observation: item.observation,
      });
    }

    return NextResponse.json({ success: true, data: newAudit }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando auditoría:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear auditoría" } },
      { status: 500 }
    );
  }
}
