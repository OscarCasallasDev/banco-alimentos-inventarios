/**
 * Servicio de productos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { asc, eq, sql } from "drizzle-orm";
import { categories, products } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import type { CreateProductInput, UpdateProductInput } from "@/lib/validations/schemas";

/**
 * Lista el catálogo de productos con el nombre de su categoría.
 */
export async function listProducts(executor: DbExecutor) {
  return executor
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      description: products.description,
      presentation: products.presentation,
      weight: products.weight,
      unit: products.unit,
      categoryId: products.categoryId,
      status: products.status,
      minStock: products.minStock,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(asc(products.code));
}

/**
 * Obtiene un producto por su identificador.
 */
export async function getProduct(executor: DbExecutor, id: string) {
  const [product] = await executor
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      description: products.description,
      presentation: products.presentation,
      weight: products.weight,
      unit: products.unit,
      categoryId: products.categoryId,
      status: products.status,
      minStock: products.minStock,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!product) {
    throw notFoundError("Producto");
  }

  return product;
}

/**
 * Crea un producto. El código debe ser único.
 */
export async function createProduct(
  executor: DbExecutor,
  input: CreateProductInput
) {
  const existing = await executor
    .select({ id: products.id })
    .from(products)
    .where(eq(products.code, input.code))
    .limit(1);

  if (existing.length > 0) {
    throw conflictError("El código del producto ya existe");
  }

  const [product] = await executor
    .insert(products)
    .values({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      presentation: input.presentation ?? null,
      weight: input.weight,
      unit: input.unit,
      categoryId: input.categoryId ?? null,
      status: input.status,
      minStock: input.minStock,
    })
    .returning();

  return product;
}

/**
 * Actualiza un producto.
 */
export async function updateProduct(
  executor: DbExecutor,
  id: string,
  input: UpdateProductInput
) {
  const current = await getProduct(executor, id);

  if (input.code && input.code !== current.code) {
    const duplicate = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.code, input.code))
      .limit(1);

    if (duplicate.length > 0) {
      throw conflictError("El código del producto ya existe");
    }
  }

  const [product] = await executor
    .update(products)
    .set({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description || null,
      }),
      ...(input.presentation !== undefined && {
        presentation: input.presentation || null,
      }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.categoryId !== undefined && {
        categoryId: input.categoryId || null,
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.minStock !== undefined && { minStock: input.minStock }),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  return product;
}

/**
 * Baja lógica de un producto (regla 4: no se eliminan productos con historial).
 * Si el producto tiene movimientos, queda inactivo; nunca se borra la fila.
 */
export async function deactivateProduct(
  executor: DbExecutor,
  id: string
) {
  await getProduct(executor, id);

  const [product] = await executor
    .update(products)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();

  return product;
}

/**
 * Lista las categorías de producto.
 */
export async function listCategories(executor: DbExecutor) {
  return executor
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .orderBy(asc(categories.name));
}

/**
 * Crea una categoría de producto.
 */
export async function createCategory(
  executor: DbExecutor,
  input: { name: string; description?: string | null }
) {
  const [existing] = await executor
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${input.name})`)
    .limit(1);

  if (existing) {
    throw conflictError("La categoría ya existe");
  }

  const [category] = await executor
    .insert(categories)
    .values({
      name: input.name,
      description: input.description ?? null,
    })
    .returning();

  return category;
}
