import { NextResponse } from "next/server";

export async function POST() {
  // En producción, invalidar token JWT o sesión de Supabase
  return NextResponse.json({
    success: true,
    message: "Sesión cerrada exitosamente",
  });
}
