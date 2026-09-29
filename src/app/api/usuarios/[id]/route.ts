import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "usuario no encontrado" } },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error de base de datos" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from("users")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error actualizando usuario" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error actualizando usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error eliminando usuario" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "usuario eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
