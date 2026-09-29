import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db/supabase-client";
import { createHash } from "crypto";

const registerSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido").max(100),
  lastName: z.string().min(1, "El apellido es requerido").max(100),
  email: z.string().email("Correo electrónico inválido").max(255),
  username: z.string().min(3, "El usuario debe tener al menos 3 caracteres").max(50),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").max(100),
});

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, username, password } = registerSchema.parse(body);

    // Verificar si el usuario o email ya existen
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("username, email")
      .or(`username.eq.${username},email.eq.${email}`)
      .limit(1);

    if (checkError) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error de base de datos" } },
        { status: 500 }
      );
    }

    if (existingUsers && existingUsers.length > 0) {
      const existing = existingUsers[0];
      if (existing.username === username) {
        return NextResponse.json(
          { success: false, error: { code: "USERNAME_EXISTS", message: "El nombre de usuario ya está en uso" } },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_EXISTS", message: "El correo electrónico ya está registrado" } },
        { status: 409 }
      );
    }

    // Crear el usuario
    const passwordHash = hashPassword(password);

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        username,
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role: "RECEPCION",
        status: "ACTIVE",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error creando usuario" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: newUser.id,
        username: newUser.username,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        status: newUser.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten() } },
        { status: 400 }
      );
    }
    console.error("Error en registro:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } },
      { status: 500 }
    );
  }
}
