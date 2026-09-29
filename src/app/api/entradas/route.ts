import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { entries, entryItems, inventory, inventoryMovements, products, warehouses } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

const entryItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  quantity: z.number().int().positive("La cantidad debe ser positiva"),
  unit: z.string().min(1),
  presentation: z.string().optional(),
});

const entrySchema = z.object({
  format: z.enum(["E1", "E3", "N3", "N5"]),
  number: z.string().min(1, "El número es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  nit: z.string().optional(),
  origin: z.string().optional(),
  document: z.string().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
  items: z.array(entryItemSchema).min(1, "Debe tener al menos un item"),
});

export async function GET() {
  try {
    const db = getDb();
    const allEntries = await db
      .select({
        id: entries.id,
        format: entries.format,
        number: entries.number,
        date: entries.date,
        nit: entries.nit,
        origin: entries.origin,
        document: entries.document,
        status: entries.status,
        notes: entries.notes,
        createdAt: entries.createdAt,
        updatedAt: entries.updatedAt,
      })
      .from(entries)
      .orderBy(desc(entries.createdAt));

    return NextResponse.json({ success: true, data: allEntries });
  } catch (error) {
    console.error("Error obteniendo entradas:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al obtener entradas" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = entrySchema.parse(body);

    const db = getDb();

    // Crear entrada
    const [newEntry] = await db
      .insert(entries)
      .values({
        format: data.format,
        number: data.number,
        date: data.date,
        nit: data.nit,
        origin: data.origin,
        document: data.document,
        status: data.status || "DRAFT",
        notes: data.notes,
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
      })
      .returning();

    // Crear items y actualizar inventario
    for (const item of data.items) {
      // Crear item de entrada
      await db.insert(entryItems).values({
        entryId: newEntry.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unit: item.unit,
        presentation: item.presentation,
      });

      // Actualizar o crear inventario
      const [existingInventory] = await db
        .select()
        .from(inventory)
        .where(and(eq(inventory.productId, item.productId), eq(inventory.warehouseId, item.warehouseId)))
        .limit(1);

      if (existingInventory) {
        await db
          .update(inventory)
          .set({
            quantity: existingInventory.quantity + item.quantity,
            lastMovementAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, existingInventory.id));
      } else {
        await db.insert(inventory).values({
          productId: item.productId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          lastMovementAt: new Date(),
        });
      }

      // Crear movimiento de inventario
      const balanceAfter = existingInventory
        ? existingInventory.quantity + item.quantity
        : item.quantity;

      await db.insert(inventoryMovements).values({
        type: "ENTRY",
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        balanceAfter,
        documentId: newEntry.id,
        documentType: "ENTRY",
        userId: "00000000-0000-0000-0000-000000000001", // TODO: obtener del usuario autenticado
        notes: `Entrada ${data.number}`,
      });
    }

    return NextResponse.json({ success: true, data: newEntry }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error("Error creando entrada:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error al crear entrada" } },
      { status: 500 }
    );
  }
}
