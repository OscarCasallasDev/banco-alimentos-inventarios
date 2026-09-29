import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { warehouses } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const warehouseSchema = z.object({
  code: z.string().min(1, "El código es requerido"),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  type: z.enum(["PROPIA", "TERCERO", "CAMPAIGN", "PROGRAM"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  observations: z.string().optional(),
});

export async function GET() {
  try {
    const db = getDb();
    const allWarehouses = await db
      .select()
      .from(warehouses)
      .orderBy(desc(warehouses.createdAt));

    return NextResponse.json({ success: true, data: allWarehouses });
  } catch (error) {
    console.error("Error obteniendo bodegas:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener bodegas" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = warehouseSchema.parse(body);

    const db = getDb();
    const [newWarehouse] = await db
      .insert(warehouses)
      .values({
        code: data.code,
        name: data.name,
        description: data.description,
        type: data.type || "PROPIA",
        status: data.status || "ACTIVE",
        observations: data.observations,
      })
      .returning();

    return NextResponse.json({ success: true, data: newWarehouse }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando bodega:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear bodega" } },
      { status: 500 }
    );
  }
}
