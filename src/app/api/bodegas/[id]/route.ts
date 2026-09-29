import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { warehouses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(["PROPIA", "TERCERO", "CAMPAIGN", "PROGRAM"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  observations: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, id))
      .limit(1);

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Bodega no encontrada" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: warehouse });
  } catch (error) {
    console.error("Error obteniendo bodega:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener bodega" } },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const db = getDb();
    const [updated] = await db
      .update(warehouses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(warehouses.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Bodega no encontrada" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error actualizando bodega:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al actualizar bodega" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Soft delete: cambiar estado a INACTIVE
    const [deleted] = await db
      .update(warehouses)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(eq(warehouses.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Bodega no encontrada" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error("Error eliminando bodega:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al elimin bodega" } },
      { status: 500 }
    );
  }
}
