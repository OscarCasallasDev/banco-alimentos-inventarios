import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" } },
        { status: 401 }
      );
    }

    const hashedInput = hashPassword(password);
    const storedHash = Buffer.from(user.passwordHash, "hex");
    const inputHash = Buffer.from(hashedInput, "hex");

    if (storedHash.length !== inputHash.length || !timingSafeEqual(storedHash, inputHash)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" } },
        { status: 401 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Usuario inactivo" } },
        { status: 403 }
      );
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const response = NextResponse.json({
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
