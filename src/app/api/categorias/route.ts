import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const categorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allCategories = await db
      .select()
      .from(categories)
      .orderBy(desc(categories.createdAt));

    return NextResponse.json({ success: true, data: allCategories });
  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener categorías" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = categorySchema.parse(body);

    const db = getDb();
    const [newCategory] = await db
      .insert(categories)
      .values({ name: data.name, description: data.description })
      .returning();

    return NextResponse.json({ success: true, data: newCategory }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando categoría:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear categoría" } },
      { status: 500 }
    );
  }
}
