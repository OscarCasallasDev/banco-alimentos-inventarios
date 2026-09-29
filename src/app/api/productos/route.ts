import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { products, categories } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const productSchema = z.object({
  code: z.string().min(1, "El código es requerido"),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  presentation: z.string().optional(),
  weight: z.number().min(0).optional(),
  unit: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  minStock: z.number().int().min(0).optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allProducts = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        presentation: products.presentation,
        weight: products.weight,
        unit: products.unit,
        categoryId: products.categoryId,
        categoryName: categories.name,
        status: products.status,
        minStock: products.minStock,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(desc(products.createdAt));

    return NextResponse.json({ success: true, data: allProducts });
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener productos" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = productSchema.parse(body);

    const db = getDb();
    const [newProduct] = await db
      .insert(products)
      .values({
        code: data.code,
        name: data.name,
        description: data.description,
        presentation: data.presentation,
        weight: data.weight?.toString() || "0",
        unit: data.unit || "unidad",
        categoryId: data.categoryId,
        status: data.status || "ACTIVE",
        minStock: data.minStock || 0,
      })
      .returning();

    return NextResponse.json({ success: true, data: newProduct }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando producto:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear producto" } },
      { status: 500 }
    );
  }
}
