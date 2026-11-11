/**
 * Catálogo de destinos (parroquias y grupos de familia).
 *
 * Es CONFIGURABLE: los 10 registros iniciales son datos de demostración
 * marcados con `is_demo = true`, y el administrador puede reemplazarlos por
 * el catálogo oficial del Banco desde la interfaz, sin tocar el código.
 */

import { and, asc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { destinations } from "@/lib/db/schema";
import { notFoundError } from "@/lib/utils/errors";

export interface DestinationItem {
  id: string;
  code: string | null;
  name: string;
  type: string;
  isDemo: boolean;
  status: string;
  sortOrder: number;
  /** Número de órdenes que usan este destino. */
  orderCount: number;
}

export async function listDestinations(options: {
  search?: string;
  onlyActive?: boolean;
  limit?: number;
}): Promise<DestinationItem[]> {
  const db = getDb();

  const conditions = [];
  if (options.onlyActive !== false) {
    conditions.push(eq(destinations.status, "ACTIVE"));
  }
  if (options.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(destinations.name, term),
        ilike(destinations.code, term),
        ilike(destinations.type, term)
      )!
    );
  }

  const rows = await db
    .select()
    .from(destinations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(destinations.sortOrder), asc(destinations.name))
    .limit(options.limit ?? 30);

  const counts = await db.execute<{ destination_id: string; count: number }>(sql`
    SELECT destination_id, COUNT(*)::int AS count
    FROM salidas
    WHERE destination_id IS NOT NULL
    GROUP BY destination_id
  `);
  const countMap = new Map(
    (counts as unknown as { destination_id: string; count: number }[]).map((r) => [
      r.destination_id,
      Number(r.count ?? 0),
    ])
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isDemo: row.isDemo,
    status: row.status,
    sortOrder: row.sortOrder,
    orderCount: countMap.get(row.id) ?? 0,
  }));
}

export async function getDestination(id: string): Promise<DestinationItem> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  if (!row) throw notFoundError("Destino");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isDemo: row.isDemo,
    status: row.status,
    sortOrder: row.sortOrder,
    orderCount: 0,
  };
}

export async function createDestination(input: {
  code?: string | null;
  name: string;
  type?: string;
  isDemo?: boolean;
  status?: string;
  sortOrder?: number;
}): Promise<DestinationItem> {
  const db = getDb();
  const [row] = await db
    .insert(destinations)
    .values({
      code: input.code?.trim() || null,
      name: input.name.trim(),
      type: input.type ?? "OTRO",
      isDemo: input.isDemo ?? false,
      status: input.status ?? "ACTIVE",
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isDemo: row.isDemo,
    status: row.status,
    sortOrder: row.sortOrder,
    orderCount: 0,
  };
}

export async function updateDestination(
  id: string,
  input: {
    code?: string | null;
    name?: string;
    type?: string;
    isDemo?: boolean;
    status?: string;
    sortOrder?: number;
  }
): Promise<DestinationItem> {
  const db = getDb();
  const [row] = await db
    .update(destinations)
    .set({
      ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.isDemo !== undefined ? { isDemo: input.isDemo } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(destinations.id, id))
    .returning();
  if (!row) throw notFoundError("Destino");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isDemo: row.isDemo,
    status: row.status,
    sortOrder: row.sortOrder,
    orderCount: 0,
  };
}

/**
 * Desactiva un destino (no se borra: las órdenes históricas lo referencian).
 */
export async function deactivateDestination(id: string): Promise<DestinationItem> {
  return updateDestination(id, { status: "INACTIVE" });
}

/**
 * Elimina un destino de demostración que NO tiene órdenes asociadas.
 * Los destinos que ya se usaron nunca se borran: se desactivan.
 */
export async function deleteDemoDestination(id: string): Promise<void> {
  const db = getDb();
  const used = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM salidas WHERE destination_id = ${id}::uuid
  `);
  const count = Number((used as unknown as { count: number }[])[0]?.count ?? 0);
  if (count > 0) {
    await deactivateDestination(id);
    return;
  }
  await db
    .delete(destinations)
    .where(and(eq(destinations.id, id), eq(destinations.isDemo, true)));
}

export { destinations, isNotNull };
