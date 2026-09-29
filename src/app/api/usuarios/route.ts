import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db/supabase-client";
import { createHash } from "crypto";

const userSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  email: z.string().email("Correo electrónico inválido"),
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  password: z.string().optional(),
  role: z.enum(["SUPERADMIN", "ADMIN", "RECEPCION", "DESPACHO", "CONTABILIDAD"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, email, first_name, last_name, role, status, last_login_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error al obtener usuarios" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo usuarios:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = userSchema.parse(body);

    if (!data.password) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "La contraseña es requerida" } },
        { status: 400 }
      );
    }

    // Verificar si el usuario o email ya existen
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .or(`username.eq.${data.username},email.eq.${data.email}`)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "USER_EXISTS", message: "El usuario o email ya existe" } },
        { status: 409 }
      );
    }

    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        username: data.username,
        email: data.email,
        password_hash: hashPassword(data.password),
        first_name: data.firstName,
        last_name: data.lastName,
        role: data.role || "RECEPCION",
        status: data.status || "ACTIVE",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error creando usuario" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
