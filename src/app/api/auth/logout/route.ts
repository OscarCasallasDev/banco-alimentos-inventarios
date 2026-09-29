import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  // Limpiar cookies de sesión
  cookieStore.delete("session_token");
  cookieStore.delete("user_id");

  return NextResponse.json({ success: true });
}
