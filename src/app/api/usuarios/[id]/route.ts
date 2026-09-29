import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const updateSchema = z.object({
  username: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  password: z.string().optional(),
  role: z.enum(["SUPERADMIN", "ADMIN", "RECEPCION", "DESPACHO", "CONTABILIDAD"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const [user] = await db
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
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Usuario no encontrado" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error("Error obteniendo usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener usuario" } },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const db = getDb();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.username) updateData.username = data.username;
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.password) updateData.passwordHash = hashPassword(data.password);
    if (data.role) updateData.role = data.role;
    if (data.status) updateData.status = data.status;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Usuario no encontrado" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error actualizando usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al actualizar usuario" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Soft delete: cambiar estado a INACTIVE
    const [deleted] = await db
      .update(users)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Usuario no encontrado" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al eliminar usuario" } },
      { status: 500 }
    );
  }
}
