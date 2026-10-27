/**
 * Servicio de bodegas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { asc, eq } from "drizzle-orm";
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
export async function listWarehouses(executor: DbExecutor) {
  return cached("catalog:warehouses", DEFAULT_TTL_MS, () =>
    executor
      .select({
        id: warehouses.id,
        code: warehouses.code,
        name: warehouses.name,
        description: warehouses.description,
        type: warehouses.type,
        status: warehouses.status,
        observations: warehouses.observations,
        createdAt: warehouses.createdAt,
        updatedAt: warehouses.updatedAt,
      })
      .from(warehouses)
      .orderBy(asc(warehouses.code))
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
