import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Obtener información del usuario actual.
 * En producción, verificar token JWT o cookie de sesión.
 */
export async function GET() {
  try {
    const db = getDb();

    // Demo: retornar usuario admin por defecto
    // En producción, obtener userId del token/sesión
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.email, "admin@bancoalimentos.org"))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "No autenticado",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error obteniendo usuario:", error);
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
