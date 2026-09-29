import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createHash } from "crypto";

const userSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
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
    const db = getDb();
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ success: true, data: allUsers });
  } catch (error) {
    console.error("Error obteniendo usuarios:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener usuarios" } },
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

    const db = getDb();
    const [newUser] = await db
      .insert(users)
      .values({
        username: data.username,
        passwordHash: hashPassword(data.password),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role || "RECEPCION",
        status: data.status || "ACTIVE",
      })
      .returning();

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
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear usuario" } },
      { status: 500 }
    );
  }
}
