import { NextResponse } from "next/server";

export async function POST() {
  // En producción, invalidar token/sesión
  return NextResponse.json({ success: true });
}
