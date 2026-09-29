import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db/supabase-client";

const productSchema = z.object({
  code: z.string().min(1, "El código es requerido").max(50),
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().optional(),
  presentation: z.string().optional(),
  weight: z.number().positive("El peso debe ser positivo").optional(),
  unit: z.string().optional(),
  category_id: z.string().uuid("Categoría inválida").optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  min_stock: z.number().int().min(0).optional(),
});

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*, categories(name)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error al obtener productos" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = productSchema.parse(body);

    // Verificar si el código ya existe
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("code", data.code)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "CODE_EXISTS", message: "El código del producto ya existe" } },
        { status: 409 }
      );
    }

    const { data: newProduct, error } = await supabase
      .from("products")
      .insert({
        code: data.code,
        name: data.name,
        description: data.description || null,
        presentation: data.presentation || null,
        weight: data.weight || null,
        unit: data.unit || null,
        category_id: data.category_id || null,
        status: data.status || "ACTIVE",
        min_stock: data.min_stock || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error creando producto" } },
        { status: 500 }
      );
    }

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
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
