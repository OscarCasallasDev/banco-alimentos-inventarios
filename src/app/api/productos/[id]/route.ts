import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  presentation: z.string().optional(),
  weight: z.number().min(0).optional(),
  unit: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  minStock: z.number().int().min(0).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Producto no encontrado" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error("Error obteniendo producto:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener producto" } },
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

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.code) updateData.code = data.code;
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.presentation !== undefined) updateData.presentation = data.presentation;
    if (data.weight !== undefined) updateData.weight = data.weight.toString();
    if (data.unit) updateData.unit = data.unit;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.status) updateData.status = data.status;
    if (data.minStock !== undefined) updateData.minStock = data.minStock;

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Producto no encontrado" } },
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
    console.error("Error actualizando producto:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al actualizar producto" } },
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
      .update(products)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Producto no encontrado" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error("Error eliminando producto:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al eliminar producto" } },
      { status: 500 }
    );
  }
}
