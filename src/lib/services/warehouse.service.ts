/**
 * Servicio de bodegas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { asc, eq , sql } from "drizzle-orm";
import { warehouses } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { cached, invalidate, DEFAULT_TTL_MS } from "@/lib/cache/memory-cache";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "@/lib/validations/schemas";

/**
 * Lista las bodegas.
 *
 * El catálogo se cachea: se lee en cada pantalla y cambia muy pocas veces.
 */
export async function listWarehouses(
  executor: DbExecutor,
  includeInactive = false
) {
  return cached(
    `catalog:warehouses:${includeInactive ? "all" : "active"}`,
    DEFAULT_TTL_MS,
    async () => {
      const rows = await executor
        .select({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          description: warehouses.description,
          type: warehouses.type,
          status: warehouses.status,
          observations: warehouses.observations,
          source: warehouses.source,
          siigoCode: warehouses.siigoCode,
          createdAt: warehouses.createdAt,
          updatedAt: warehouses.updatedAt,
        })
        .from(warehouses)
        .orderBy(asc(warehouses.code));

      return includeInactive
        ? rows
        : rows.filter((row) => row.status === "ACTIVE");
    }
  );
}

/**
 * Invalida el caché del catálogo de bodegas.
 */
export function invalidateWarehousesCache(): void {
  invalidate("catalog:warehouses");
}

/**
 * Obtiene una bodega por su identificador.
 */
export async function getWarehouse(executor: DbExecutor, id: string) {
  const [warehouse] = await executor
    .select()
    .from(warehouses)
    .where(eq(warehouses.id, id))
    .limit(1);

  if (!warehouse) {
    throw notFoundError("Bodega");
  }

  return warehouse;
}

/**
 * Crea una bodega. El código debe ser único.
 */
export async function createWarehouse(
  executor: DbExecutor,
  input: CreateWarehouseInput
) {
  const existing = await executor
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.code, input.code))
    .limit(1);

  if (existing.length > 0) {
    throw conflictError("El código de la bodega ya existe");
  }

  const [warehouse] = await executor
    .insert(warehouses)
    .values({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      status: input.status,
      observations: input.observations ?? null,
    })
    .returning();

  return warehouse;
}

/**
 * Actualiza una bodega.
 */
export async function updateWarehouse(
  executor: DbExecutor,
  id: string,
  input: UpdateWarehouseInput
) {
  await getWarehouse(executor, id);

  if (input.code) {
    const duplicate = await executor
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.code, input.code))
      .limit(1);

    if (duplicate.length > 0) {
      throw conflictError("El código de la bodega ya existe");
    }
  }

  const [warehouse] = await executor
    .update(warehouses)
    .set({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description || null,
      }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.observations !== undefined && {
        observations: input.observations || null,
      }),
      updatedAt: new Date(),
    })
    .where(eq(warehouses.id, id))
    .returning();

  return warehouse;
}

/**
 * Baja lógica de una bodega (regla 4: no se eliminan datos históricos).
 */
export async function deactivateWarehouse(
  executor: DbExecutor,
  id: string
) {
  await getWarehouse(executor, id);

  const [warehouse] = await executor
    .update(warehouses)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(eq(warehouses.id, id))
    .returning();

  return warehouse;
}

/**
 * Resumen por bodega de las existencias importadas desde Siigo Pyme.
 */
export interface WarehouseSummary {
  id: string;
  siigoCode: number | null;
  productCount: number;
  locationCount: number;
  totalQuantity: number;
  lastSyncedAt: Date | null;
}

export async function listWarehouseSummary(
  executor: DbExecutor
): Promise<WarehouseSummary[]> {
  return cached("catalog:warehouses:summary", DEFAULT_TTL_MS, async () => {
    const rows = await executor.execute<{
      id: string;
      siigo_code: number | null;
      product_count: number;
      location_count: number;
      total_quantity: string;
      last_synced_at: Date | null;
    }>(sql`
      SELECT
        w.id,
        w.siigo_code,
        COALESCE(b.products, 0) AS product_count,
        COALESCE(b.locations, 0) AS location_count,
        COALESCE(b.total, 0) AS total_quantity,
        b.last_synced_at
      FROM warehouses w
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT sb.product_id) AS products,
          COUNT(DISTINCT sb.location_code) AS locations,
          SUM(sb.quantity) AS total,
          MAX(sb.synced_at) AS last_synced_at
        FROM siigo_balances sb
        WHERE sb.warehouse_id = w.id AND sb.is_active
      ) b ON true
      WHERE w.source = 'SIIGO'
    `);

    return (
      rows as unknown as {
        id: string;
        siigo_code: number | null;
        product_count: number;
        location_count: number;
        total_quantity: string;
        last_synced_at: Date | null;
      }[]
    ).map((row) => ({
      id: row.id,
      siigoCode: row.siigo_code === null ? null : Number(row.siigo_code),
      productCount: Number(row.product_count ?? 0),
      locationCount: Number(row.location_count ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      lastSyncedAt: row.last_synced_at,
    }));
  });
}
