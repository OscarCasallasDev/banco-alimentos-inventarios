import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";

const loginSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

/**
 * Hash simple para comparar contraseñas en modo demo.
 * En producción, usar bcrypt o Argon2.
 */
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);

    const db = getDb();

    // Buscar usuario por username
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Credenciales inválidas",
          },
        },
        { status: 401 }
      );
    }

    // Verificar contraseña (comparación segura)
    const hashedInput = hashPassword(password);
    const storedHash = Buffer.from(user.passwordHash, "hex");
    const inputHash = Buffer.from(hashedInput, "hex");

    if (
      storedHash.length !== inputHash.length ||
      !timingSafeEqual(storedHash, inputHash)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Credenciales inválidas",
          },
        },
        { status: 401 }
      );
    }

    // Verificar estado del usuario
    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Usuario inactivo o suspendido",
          },
        },
        { status: 403 }
      );
    }

    // Actualizar último login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Respuesta exitosa
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Datos inválidos",
            details: error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    console.error("Error en login:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error interno del servidor",
        },
      },
      { status: 500 }
    );
  }
}
