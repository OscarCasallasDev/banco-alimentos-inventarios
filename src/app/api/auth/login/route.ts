import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db/supabase-client";
import { createHash, timingSafeEqual, randomBytes } from "crypto";

const loginSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);

    // Buscar usuario por username
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .limit(1);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error de base de datos" } },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" } },
        { status: 401 }
      );
    }

    const user = users[0];

    // Verificar contraseña
    const hashedInput = hashPassword(password);
    const storedHash = Buffer.from(user.password_hash, "hex");
    const inputHash = Buffer.from(hashedInput, "hex");

    if (storedHash.length !== inputHash.length || !timingSafeEqual(storedHash, inputHash)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" } },
        { status: 401 }
      );
    }

    // Verificar estado del usuario
    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Usuario inactivo" } },
        { status: 403 }
      );
    }

    // Actualizar último login
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    // Crear token de sesión
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status,
      },
    });

    const cookieOptions = `HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
    response.headers.append("Set-Cookie", `session_token=${sessionToken}; ${cookieOptions}`);
    response.headers.append("Set-Cookie", `user_id=${user.id}; ${cookieOptions}`);

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } },
        { status: 400 }
      );
    }
    console.error("Error en login:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
