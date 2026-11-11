/**
 * Existencias por producto y bodega.
 *
 * Siigo registra un mismo producto en varias UBICACIONES dentro de una
 * bodega, y el MISMO producto puede aparecer en varias bodegas. El Banco
 * necesita saber de qué bodega sale cada producto, así que la
 * disponibilidad se calcula por:
 *
 *     CÓDIGO DE SIIGO  +  BODEGA
 *
 * Reglas:
 *   - Dos productos con la MISMA descripción pero en bodegas DISTINTAS son
 *     existencias distintas: NUNCA se suman entre sí.
 *   - Un mismo código de producto en la misma bodega sí suma sus
 *     ubicaciones (es el mismo stock, repartido en el almacén).
 *   - Un total cero o negativo se conserva tal cual y se muestra.
 *
 * Los registros originales por ubicación viven en `siigo_balances` y no se
 * modifican: la vista es una derivación. La vista anterior
 * (`v_stock_consolidated`, por descripción) se conserva como registro
 * histórico pero ya no participa en la disponibilidad ni en la selección de
 * productos.
 */

import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";

/** Clave de grupo: `código de producto|bodega`. */
export function stockGroupKey(
  productCode: string,
  siigoBodegaCode: number
): string {
  return `${(productCode ?? "").trim().toLowerCase()}|${siigoBodegaCode}`;
}

/**
 * Clave de grupo a partir de la descripción y la unidad.
 *
 * Se conserva para poder leer los registros históricos que se guardaron
 * con la clave anterior (`descripción|unidad|bodega`) durante la conciliación.
 */
export function consolidatedGroupKey(
  description: string,
  unit: string,
  siigoBodegaCode: number
): string {
  const normalizedDescription = description
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const normalizedUnit = (unit ?? "").trim().toUpperCase();
  return `${normalizedDescription}|${normalizedUnit}|${siigoBodegaCode}`;
}

export interface WarehouseStockItem {
  /** Identificador del producto (código de Siigo único). */
  productId: string;
  /** Código de Siigo del producto. */
  productCode: string;
  /** Descripción exacta del producto. */
  description: string;
  unit: string;
  presentation: string | null;
  /** Bodega de Siigo (1..N). */
  siigoBodegaCode: number;
  warehouseId: string | null;
  /** Nombre legible de la bodega (PRINCIPAL, ALMACEN, …). */
  warehouseName: string | null;
  /** Existencia informada por Siigo para ESE producto en ESA bodega. */
  quantity: number;
  /** Cantidad comprometida en órdenes pendientes de ese grupo. */
  reserved: number;
  /** Disponibilidad operativa: quantity − reserved. */
  available: number;
  /** Cuántas ubicaciones de la bodega contiene ese producto. */
  locationCount: number;
  isNegative: boolean;
  reviewRequired: boolean;
  /** Peso unitario de referencia (gramos), si el producto lo tiene. */
  netWeightGrams: number | null;
  /** ¿Se puede agregar a una orden? (disponibilidad > 0). */
  canAdd: boolean;
  syncedAt: Date | null;
}

export interface StockQuery {
  search?: string;
  siigoBodegaCode?: number;
  warehouseId?: string;
  /** Filtra por un producto concreto (para validar una línea). */
  productId?: string;
  /** 'all' = todos; 'positive' = solo disponibles; 'zero' / 'negative'. */
  availability?: "all" | "positive" | "zero" | "negative";
  page?: number;
  pageSize?: number;
}

export interface StockResult {
  items: WarehouseStockItem[];
  total: number;
  /** Totales del conjunto filtrado (no solo de la página). */
  totals: {
    groups: number;
    positive: number;
    zero: number;
    negative: number;
    totalQuantity: number;
    totalAvailable: number;
  };
}

/** Condiciones SQL comunes para la búsqueda. */
function buildConditions(query: StockQuery) {
  const conditions = [sql`1 = 1`];

  if (query.search && query.search.trim().length > 0) {
    const term = `%${query.search.trim().toLowerCase()}%`;
    // Acepta el código con o sin guiones.
    const compact = `%${query.search.trim().toLowerCase().replace(/-/g, "")}%`;
    conditions.push(sql`
      (
        lower(v.description) LIKE ${term}
        OR lower(v.product_code) LIKE ${term}
        OR lower(replace(v.product_code, '-', '')) LIKE ${compact}
      )
    `);
  }

  if (query.productId) {
    conditions.push(sql`v.product_id = ${query.productId}::uuid`);
  }
  if (query.siigoBodegaCode !== undefined) {
    conditions.push(sql`v.siigo_bodega_code = ${query.siigoBodegaCode}`);
  }
  if (query.warehouseId) {
    conditions.push(sql`v.warehouse_id = ${query.warehouseId}::uuid`);
  }

  switch (query.availability) {
    case "positive":
      conditions.push(sql`(v.quantity - v.reserved) > 0`);
      break;
    case "zero":
      conditions.push(sql`(v.quantity - v.reserved) = 0`);
      break;
    case "negative":
      conditions.push(sql`(v.quantity - v.reserved) < 0`);
      break;
    default:
      break;
  }

  return sql.join(conditions, sql` AND `);
}

/** Convierte una fila de la consulta en el modelo de la interfaz. */
function toStockItem(row: Record<string, unknown>): WarehouseStockItem {
  const quantity = Number(row.quantity ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const available = Number(row.available ?? quantity - reserved);
  return {
    productId: String(row.product_id ?? ""),
    productCode: String(row.product_code ?? ""),
    description: String(row.description ?? ""),
    unit: String(row.unit ?? ""),
    presentation: (row.presentation as string | null) ?? null,
    siigoBodegaCode: Number(row.siigo_bodega_code),
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    quantity: round3(quantity),
    reserved: round3(reserved),
    available: round3(available),
    locationCount: Number(row.location_count ?? 1),
    isNegative: Boolean(row.is_negative),
    reviewRequired: Boolean(row.review_required),
    netWeightGrams:
      row.net_weight_grams === null || row.net_weight_grams === undefined
        ? null
        : Number(row.net_weight_grams),
    canAdd: available > 0.0005,
    syncedAt: (row.synced_at as Date | null) ?? null,
  };
}

/**
 * Lista las existencias por producto y bodega.
 *
 * Devuelve TODOS los productos del inventario importado, incluidos los que
 * tienen cantidad cero o negativa. Cada fila indica si se puede agregar a
 * una orden (`canAdd`: disponibilidad > 0).
 */
export async function listStockByWarehouse(
  query: StockQuery,
  executor: DbExecutor = getDb()
): Promise<StockResult> {
  const page = query.page ?? 0;
  const pageSize = Math.min(query.pageSize ?? 25, 200);
  const where = buildConditions(query);

  // Una sola consulta: los totales se calculan con funciones de ventana sobre
  // el conjunto filtrado (antes eran dos viajes a la base por pantalla).
  const rows = await executor.execute(sql`
    WITH filtrado AS (
      SELECT v.*
      FROM v_stock_by_bodega v
      WHERE ${where}
    )
    SELECT
      f.product_id,
      f.product_code,
      f.description,
      f.unit,
      f.presentation,
      f.siigo_bodega_code,
      f.warehouse_id,
      f.warehouse_name,
      f.quantity,
      f.reserved,
      (f.quantity - f.reserved) AS available,
      f.location_count,
      f.is_negative,
      f.review_required,
      f.net_weight_grams,
      f.synced_at,
      COUNT(*) OVER ()::int AS total_registros,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) > 0) OVER ()::int AS total_positivos,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) = 0) OVER ()::int AS total_cero,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) < 0) OVER ()::int AS total_negativos,
      COALESCE(SUM(f.quantity) OVER (), 0) AS total_cantidad,
      COALESCE(SUM(f.quantity - f.reserved) OVER (), 0) AS total_disponible
    FROM filtrado f
    ORDER BY f.description, f.siigo_bodega_code, f.product_code
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `);

  const list = (rows as unknown as Record<string, unknown>[]) ?? [];

  const items = list.map(toStockItem);
  const first = list[0];

  return {
    items,
    total: Number(first?.total_registros ?? 0),
    totals: {
      groups: Number(first?.total_registros ?? 0),
      positive: Number(first?.total_positivos ?? 0),
      zero: Number(first?.total_cero ?? 0),
      negative: Number(first?.total_negativos ?? 0),
      totalQuantity: round3(Number(first?.total_cantidad ?? 0)),
      totalAvailable: round3(Number(first?.total_disponible ?? 0)),
    },
  };
}

/**
 * Existencias de un producto concreto en todas las bodegas donde existe.
 *
 * Es lo que usa el formulario de la orden para ofrecer al almacenista
 * las bodegas desde las que realmente puede despachoar ese producto.
 */
export async function listWarehouseOptionsForProduct(
  productId: string,
  executor: DbExecutor = getDb()
): Promise<WarehouseStockItem[]> {
  const rows = await executor.execute(sql`
    SELECT
      f.product_id, f.product_code, f.description, f.unit, f.presentation,
      f.siigo_bodega_code, f.warehouse_id, f.warehouse_name,
      f.quantity, f.reserved, (f.quantity - f.reserved) AS available,
      f.location_count, f.is_negative, f.review_required,
      f.net_weight_grams, f.synced_at
    FROM v_stock_by_bodega f
    WHERE f.product_id = ${productId}::uuid
    ORDER BY f.siigo_bodega_code
  `);

  return ((rows as unknown as Record<string, unknown>[]) ?? []).map(toStockItem);
}

/**
 * Existencias de un producto en UNA bodega concreta.
 *
 * Es la validación de backend de cada línea de la orden: la cantidad
 * solicitada se contrasta contra este producto en ESTA bodega, nunca
 * contra la suma de otras bodegas.
 */
export async function getWarehouseStock(
  productId: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<WarehouseStockItem | null> {
  const rows = await executor.execute(sql`
    SELECT
      f.product_id, f.product_code, f.description, f.unit, f.presentation,
      f.siigo_bodega_code, f.warehouse_id, f.warehouse_name,
      f.quantity, f.reserved, (f.quantity - f.reserved) AS available,
      f.location_count, f.is_negative, f.review_required,
      f.net_weight_grams, f.synced_at
    FROM v_stock_by_bodega f
    WHERE f.product_id = ${productId}::uuid
      AND f.siigo_bodega_code = ${siigoBodegaCode}
    LIMIT 1
  `);

  const row = (rows as unknown as Record<string, unknown>[])[0];
  return row ? toStockItem(row) : null;
}

/**
 * Clave de grupo a partir de un producto (para reservas y conciliación).
 * Ahora es `código de Siigo|bodega`.
 */
export async function groupKeyForProduct(
  productId: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<string | null> {
  const rows = await executor.execute(sql`
    SELECT p.code
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.product_id = ${productId}::uuid
      AND b.siigo_bodega_code = ${siigoBodegaCode}
      AND b.is_active
    LIMIT 1
  `);
  const row = (rows as unknown as { code: string }[])[0];
  if (!row) return null;
  return stockGroupKey(row.code, siigoBodegaCode);
}

/** Redondeo a 3 decimales (misma precisión que el esquema). */
export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
