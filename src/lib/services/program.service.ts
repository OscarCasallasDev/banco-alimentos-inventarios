/**
 * Servicio del catálogo de programas / destinos.
 *
 * Los programas son configurables por el administrador: no hay opciones
 * rígidas escritas en el código. Los cuatro programas base del Banco
 * (Grupos de Familia, Plan Padrino, Consumo interno, Desayunos Saludables)
 * se siembran en la migración 0010 y pueden editarse, agregarse o
 * desactivarse.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs } from "@/lib/db/schema";
import { notFoundError } from "@/lib/utils/errors";

export interface ProgramItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresReceiver: boolean;
  status: string;
  sortOrder: number;
  /** Número de salidas generadas para este programa. */
  exitCount: number;
}

export async function listPrograms(
  onlyActive = false
): Promise<ProgramItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: programs.id,
      code: programs.code,
      name: programs.name,
      description: programs.description,
      requiresReceiver: programs.requiresReceiver,
      status: programs.status,
      sortOrder: programs.sortOrder,
    })
    .from(programs)
    .orderBy(asc(programs.sortOrder), asc(programs.name));

  const counts = await db.execute<{ program_id: string; count: number }>(sql`
    SELECT program_id, COUNT(*)::int AS count FROM salidas GROUP BY program_id
  `);
  const countMap = new Map(
    (counts as unknown as { program_id: string; count: number }[]).map((r) => [
      r.program_id,
      Number(r.count ?? 0),
    ])
  );

  return rows
    .filter((row) => (onlyActive ? row.status === "ACTIVE" : true))
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      requiresReceiver: row.requiresReceiver,
      status: row.status,
      sortOrder: row.sortOrder,
      exitCount: countMap.get(row.id) ?? 0,
    }));
}

export async function getProgram(id: string): Promise<ProgramItem> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, id))
    .limit(1);
  if (!row) throw notFoundError("Programa");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requiresReceiver: row.requiresReceiver,
    status: row.status,
    sortOrder: row.sortOrder,
    exitCount: 0,
  };
}

export async function createProgram(input: {
  code: string;
  name: string;
  description?: string | null;
  requiresReceiver?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  sortOrder?: number;
}): Promise<ProgramItem> {
  const db = getDb();
  const [row] = await db
    .insert(programs)
    .values({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description ?? null,
      requiresReceiver: input.requiresReceiver ?? true,
      status: input.status ?? "ACTIVE",
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requiresReceiver: row.requiresReceiver,
    status: row.status,
    sortOrder: row.sortOrder,
    exitCount: 0,
  };
}

export async function updateProgram(
  id: string,
  input: {
    code?: string;
    name?: string;
    description?: string | null;
    requiresReceiver?: boolean;
    status?: "ACTIVE" | "INACTIVE";
    sortOrder?: number;
  }
): Promise<ProgramItem> {
  const db = getDb();
  const [row] = await db
    .update(programs)
    .set({
      ...(input.code !== undefined
        ? { code: input.code.trim().toUpperCase() }
        : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.requiresReceiver !== undefined
        ? { requiresReceiver: input.requiresReceiver }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(programs.id, id))
    .returning();
  if (!row) throw notFoundError("Programa");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requiresReceiver: row.requiresReceiver,
    status: row.status,
    sortOrder: row.sortOrder,
    exitCount: 0,
  };
}

/**
 * Desactiva un programa (no se borra: las salidas históricas lo referencian).
 */
export async function deactivateProgram(id: string): Promise<ProgramItem> {
  const db = getDb();
  const used = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM salidas WHERE program_id = ${id}::uuid
  `);
  const count = Number((used as unknown as { count: number }[])[0]?.count ?? 0);

  if (count > 0) {
    // Se conserva en el histórico: solo se desactiva.
    const [row] = await db
      .update(programs)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(eq(programs.id, id))
      .returning();
    if (!row) throw notFoundError("Programa");
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      requiresReceiver: row.requiresReceiver,
      status: row.status,
      sortOrder: row.sortOrder,
      exitCount: count,
    };
  }

  const [row] = await db
    .update(programs)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(eq(programs.id, id))
    .returning();
  if (!row) throw notFoundError("Programa");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requiresReceiver: row.requiresReceiver,
    status: row.status,
    sortOrder: row.sortOrder,
    exitCount: count,
  };
}

export { programs, and };
