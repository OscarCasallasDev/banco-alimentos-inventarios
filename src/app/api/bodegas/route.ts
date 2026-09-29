import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db/supabase-client";

const warehouseSchema = z.object({
  code: z.string().min(1, "El código es requerido").max(50),
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().optional(),
  type: z.enum(["PROPIA", "TERCERO", "CAMPAIGN", "PROGRAM"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  observations: z.string().optional(),
});

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error al obtener bodegas" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo bodegas:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = warehouseSchema.parse(body);

    // Verificar si el código ya existe
    const { data: existing } = await supabase
      .from("warehouses")
      .select("id")
      .eq("code", data.code)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "CODE_EXISTS", message: "El código de la bodega ya existe" } },
        { status: 409 }
      );
    }

    const { data: newWarehouse, error } = await supabase
      .from("warehouses")
      .insert({
        code: data.code,
        name: data.name,
        description: data.description || null,
        type: data.type,
        status: data.status || "ACTIVE",
        observations: data.observations || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error creando bodega" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: newWarehouse }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando bodega:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
