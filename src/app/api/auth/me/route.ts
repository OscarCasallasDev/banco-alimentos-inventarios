import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";
import { cookies } from "next/headers";

/**
 * Obtener información del usuario actual.
 * Lee el user_id de la cookie de sesión y retorna el usuario correspondiente.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("user_id")?.value;

    if (!userId) {
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

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, first_name, last_name, role, status, last_login_at, created_at")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Usuario no encontrado",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
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
