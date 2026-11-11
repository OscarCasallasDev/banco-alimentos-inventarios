/**
 * Servicio de productos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { categories, products } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { cached, invalidate, DEFAULT_TTL_MS } from "@/lib/cache/memory-cache";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import type { CreateProductInput, UpdateProductInput } from "@/lib/validations/schemas";

/**
 * Lista el catálogo de productos con el nombre de su categoría.
 *
 * El catálogo se cachea: se lee en cada pantalla y cambia muy pocas veces.
 */
export async function listProducts(executor: DbExecutor) {
  return cached("catalog:products", DEFAULT_TTL_MS, () =>
    executor
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        presentation: products.presentation,
        weight: products.weight,
        unit: products.unit,
        stockUnit: products.stockUnit,
        unitKind: products.unitKind,
        netWeightGrams: products.netWeightGrams,
        netVolumeMl: products.netVolumeMl,
        weightIsEstimate: products.weightIsEstimate,
        tracksExpiration: products.tracksExpiration,
        categoryId: products.categoryId,
        status: products.status,
        minStock: products.minStock,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(products.code))
  );
}

/**
 * Invalida el caché del catálogo de productos.
 */
export function invalidateProductsCache(): void {
  invalidate("catalog:products");
}

/**
 * Busca productos por código, nombre, presentación o categoría.
 * Es la búsqueda que usa el módulo de Entradas para locating el producto
 * por cualquiera de sus características.
 */
export async function searchProducts(executor: DbExecutor, term: string) {
  const pattern = `%${term.trim()}%`;

  return executor
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      description: products.description,
      presentation: products.presentation,
      weight: products.weight,
      unit: products.unit,
      stockUnit: products.stockUnit,
      unitKind: products.unitKind,
      netWeightGrams: products.netWeightGrams,
      netVolumeMl: products.netVolumeMl,
      weightIsEstimate: products.weightIsEstimate,
      tracksExpiration: products.tracksExpiration,
      categoryId: products.categoryId,
      status: products.status,
      minStock: products.minStock,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.status, "ACTIVE"),
        or(
          ilike(products.code, pattern),
          ilike(products.name, pattern),
          ilike(products.presentation, pattern),
          ilike(products.description, pattern),
          ilike(categories.name, pattern)
        )
      )
    )
    .orderBy(asc(products.code))
    .limit(20);
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
      stockUnit: products.stockUnit,
      unitKind: products.unitKind,
      netWeightGrams: products.netWeightGrams,
      netVolumeMl: products.netVolumeMl,
      weightIsEstimate: products.weightIsEstimate,
      tracksExpiration: products.tracksExpiration,
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
 * Completa la unidad de manejo y el contenido neto cuando el cliente no los
 * envía. No convierte la cantidad de stock: solo describe cuánto contiene
 * una unidad de manejo.
 */
function resolveProductMeasure(input: {
  unit: string;
  weight: number;
  stockUnit?: string;
  unitKind?: "COUNT" | "MASS" | "VOLUME" | "UNKNOWN";
  netWeightGrams?: number | null;
  netVolumeMl?: number | null;
}) {
  const unit = input.unit.toLowerCase();
  const stockUnit = (input.stockUnit ?? "").toUpperCase();

  const inferredStockUnit =
    stockUnit && stockUnit !== "UND"
      ? stockUnit
      : unit.startsWith("kg")
        ? "KG"
        : unit === "l" || unit.startsWith("litro")
          ? "L"
          : "UND";

  const inferredKind =
    input.unitKind && input.unitKind !== "UNKNOWN"
      ? input.unitKind
      : inferredStockUnit === "KG" || inferredStockUnit === "LB"
        ? "MASS"
        : inferredStockUnit === "L" || inferredStockUnit === "ML"
          ? "VOLUME"
          : "COUNT";

  return {
    stockUnit: inferredStockUnit,
    unitKind: inferredKind,
    netWeightGrams:
      input.netWeightGrams ??
      (unit.startsWith("kg") ? Math.round(input.weight * 1000 * 1000) / 1000 : null),
    netVolumeMl:
      input.netVolumeMl ??
      (unit === "l" || unit.startsWith("litro")
        ? Math.round(input.weight * 1000 * 1000) / 1000
        : null),
  };
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

  const measure = resolveProductMeasure(input);

  const [product] = await executor
    .insert(products)
    .values({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      presentation: input.presentation ?? null,
      weight: input.weight,
      unit: input.unit,
      stockUnit: measure.stockUnit,
      unitKind: measure.unitKind,
      netWeightGrams: measure.netWeightGrams,
      netVolumeMl: measure.netVolumeMl,
      weightIsEstimate: input.weightIsEstimate,
      tracksExpiration: input.tracksExpiration,
      categoryId: input.categoryId ?? null,
      status: input.status,
      minStock: input.minStock,
    })
    .returning();

  invalidateProductsCache();
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

  const nextUnit = input.unit ?? current.unit;
  const nextWeight = input.weight ?? current.weight;
  const measure =
    input.weight !== undefined ||
    input.unit !== undefined ||
    input.stockUnit !== undefined ||
    input.unitKind !== undefined ||
    input.netWeightGrams !== undefined ||
    input.netVolumeMl !== undefined
      ? resolveProductMeasure({
          unit: nextUnit,
          weight: nextWeight,
          stockUnit: input.stockUnit ?? current.stockUnit,
          unitKind: input.unitKind ?? current.unitKind,
          netWeightGrams:
            input.netWeightGrams !== undefined
              ? input.netWeightGrams
              : undefined,
          netVolumeMl:
            input.netVolumeMl !== undefined ? input.netVolumeMl : undefined,
        })
      : null;

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
      ...(measure && {
        stockUnit: measure.stockUnit,
        unitKind: measure.unitKind,
        netWeightGrams: measure.netWeightGrams,
        netVolumeMl: measure.netVolumeMl,
      }),
      ...(input.weightIsEstimate !== undefined && {
        weightIsEstimate: input.weightIsEstimate,
      }),
      ...(input.tracksExpiration !== undefined && {
        tracksExpiration: input.tracksExpiration,
      }),
      ...(input.categoryId !== undefined && {
        categoryId: input.categoryId || null,
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.minStock !== undefined && { minStock: input.minStock }),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  invalidateProductsCache();
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

  invalidateProductsCache();
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
