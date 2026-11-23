/**
 * Existencias consolidadas por código de producto y bodega.
 *
 * Siigo registra un mismo producto en varias ubicaciones dentro de la misma
 * bodega, y el MISMO nombre puede aparecer en distintas bodegas. El Banco
 * pidió consolidar por:
 *
 *     CÓDIGO DE PRODUCTO  +  NÚMERO DE BODEGA
 *
 * El número de bodega es el código numérico de la columna B del reporte: es
 * la única referencia estable. Los rótulos textuales de las columnas A y C
 * cambian entre reportes (campañas, nombres alternativos) y NO se usan para
 * separar existencias.
 *
 * Reglas:
 *   - Las ubicaciones de un mismo producto en la misma bodega se SUMAN
 *     (es el mismo stock, repartido en el almacén).
 *   - NO se mezclan existencias de bodegas diferentes.
 *   - NO se fusionan productos con códigos distintos aunque compartan la
 *     misma descripción.
 *   - Las cantidades negativas y los resultados en cero se conservan.
 *   - Los códigos, las ubicaciones y los registros originales se conservan
 *     para trazabilidad: la consolidación es un cálculo derivado y la tabla
 *     `siigo_balances` no se modifica.
 */

import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";

/**
 * Clave de grupo consolidado: `código de producto|bodega`.
 *
 * Es la clave con la que se identifican las reservas y las conciliaciones,
 * de modo que cada salida se descuenta del saldo del grupo correcto.
 */
export function consolidatedGroupKey(
  productCode: string,
  siigoBodegaCode: number
): string {
  const normalized = (productCode ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${normalized}|${siigoBodegaCode}`;
}

export interface ConsolidatedStockItem {
  /** Descripción exacta del producto (normalizada en espacios). */
  description: string;
  unit: string;
  /** Bodega de Siigo (1..N). */
  siigoBodegaCode: number;
  warehouseId: string | null;
  /** Nombre legible de la bodega (PRINCIPAL, ALMACEN, …). */
  warehouseName: string | null;
  /** Producto que representa al grupo (el de mayor existencia). */
  representativeProductId: string;
  /** Código de Siigo del producto representante. */
  representativeCode: string;
  /** Todos los códigos de Siigo que componen el grupo. */
  productCodes: string[];
  /** Cuántos códigos de Siigo tiene el grupo. */
  productCount: number;
  /** Cuántas ubicaciones de la bodega suma el grupo. */
  locationCount: number;
  /** Existencia informada por Siigo (suma de las ubicaciones). */
  quantity: number;
  /** Cantidad comprometida en órdenes pendientes. */
  reserved: number;
  /** Disponibilidad operativa: quantity − reserved. */
  available: number;
  isNegative: boolean;
  reviewRequired: boolean;
  /** Peso unitario de referencia (gramos), si el producto lo tiene. */
  netWeightGrams: number | null;
  /** ¿Se puede agregar a una orden? (disponibilidad > 0). */
  canAdd: boolean;
  syncedAt: Date | null;
}

export interface ConsolidatedStockQuery {
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

export interface ConsolidatedStockResult {
  items: ConsolidatedStockItem[];
  total: number;
  /** Totales del conjunto filtrado (no solo de la página). */
  totals: {
    /** Productos distintos (un producto en varias bodegas cuenta una vez). */
    uniqueProducts: number;
    /** Registros de existencia consolidados por producto y bodega. */
    groups: number;
    positive: number;
    zero: number;
    negative: number;
    totalQuantity: number;
    totalAvailable: number;
  };
}

/** Condiciones SQL comunes para la búsqueda. */
function buildConditions(query: ConsolidatedStockQuery) {
  const conditions = [sql`1 = 1`];

  if (query.search && query.search.trim().length > 0) {
    const term = `%${query.search.trim().toLowerCase()}%`;
    // Acepta el código con o sin guiones.
    const compact = `%${query.search.trim().toLowerCase().replace(/-/g, "")}%`;
    conditions.push(sql`
      (
        lower(v.description) LIKE ${term}
        OR EXISTS (
          SELECT 1 FROM unnest(v.product_codes) AS c(code)
          WHERE lower(c.code) LIKE ${term}
             OR lower(replace(c.code, '-', '')) LIKE ${compact}
        )
      )
    `);
  }

  if (query.productId) {
    conditions.push(sql`
      EXISTS (
        SELECT 1 FROM unnest(v.product_codes) AS c(code)
        JOIN products p2 ON p2.code = c.code
        WHERE p2.id = ${query.productId}::uuid
      )
    `);
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
function toStockItem(row: Record<string, unknown>): ConsolidatedStockItem {
  const quantity = Number(row.quantity ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const available = Number(row.available ?? quantity - reserved);
  return {
    description: String(row.description ?? ""),
    unit: String(row.unit ?? ""),
    siigoBodegaCode: Number(row.siigo_bodega_code),
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    representativeProductId: String(row.representative_product_id ?? ""),
    representativeCode: String(row.representative_code ?? ""),
    productCodes: (row.product_codes as string[] | null) ?? [],
    productCount: Number(row.product_count ?? 1),
    locationCount: Number(row.location_count ?? 1),
    quantity: round3(quantity),
    reserved: round3(reserved),
    available: round3(available),
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
 * Lista las existencias consolidadas por descripción y bodega.
 *
 * Devuelve TODOS los productos del inventario importado, incluidos los que
 * tienen cantidad cero o negativa. Cada fila indica si se puede agregar a
 * una orden (`canAdd`: disponibilidad > 0).
 */
export async function listConsolidatedStock(
  query: ConsolidatedStockQuery,
  executor: DbExecutor = getDb()
): Promise<ConsolidatedStockResult> {
  const page = query.page ?? 0;
  const pageSize = Math.min(query.pageSize ?? 25, 200);
  const where = buildConditions(query);

  // Una sola consulta: los totales se calculan con funciones de ventana sobre
  // el conjunto filtrado (evita dos viajes a la base por pantalla).
  const rows = await executor.execute(sql`
    WITH filtrado AS (
      SELECT v.*
      FROM v_stock_consolidated v
      WHERE ${where}
    )
    SELECT
      f.description,
      f.unit,
      f.siigo_bodega_code,
      f.warehouse_id,
      f.warehouse_name,
      f.representative_product_id,
      f.representative_code,
      f.product_codes,
      f.product_count,
      f.location_count,
      f.quantity,
      f.reserved,
      (f.quantity - f.reserved) AS available,
      f.is_negative,
      f.review_required,
      f.net_weight_grams,
      f.synced_at,
      (SELECT COUNT(DISTINCT f2.representative_product_id)::int FROM filtrado f2) AS total_productos,
      COUNT(*) OVER ()::int AS total_registros,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) > 0) OVER ()::int AS total_positivos,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) = 0) OVER ()::int AS total_cero,
      COUNT(*) FILTER (WHERE (f.quantity - f.reserved) < 0) OVER ()::int AS total_negativos,
      COALESCE(SUM(f.quantity) OVER (), 0) AS total_cantidad,
      COALESCE(SUM(f.quantity - f.reserved) OVER (), 0) AS total_disponible
    FROM filtrado f
    ORDER BY f.description, f.siigo_bodega_code
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `);

  const list = (rows as unknown as Record<string, unknown>[]) ?? [];

  const items = list.map(toStockItem);
  const first = list[0];

  return {
    items,
    total: Number(first?.total_registros ?? 0),
    totals: {
      uniqueProducts: Number(first?.total_productos ?? 0),
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
 * Bodegas donde un producto (por código de Siigo) tiene existencia.
 *
 * Es lo que usa el formulario de la orden para ofrecer al almacenista las
 * bodegas desde las que puede despachar ese producto.
 */
export async function listWarehouseOptionsForProduct(
  productCode: string,
  executor: DbExecutor = getDb()
): Promise<ConsolidatedStockItem[]> {
  const rows = await executor.execute(sql`
    SELECT
      f.description, f.unit, f.siigo_bodega_code, f.warehouse_id, f.warehouse_name,
      f.representative_product_id, f.representative_code, f.product_codes,
      f.product_count, f.location_count, f.quantity, f.reserved,
      (f.quantity - f.reserved) AS available,
      f.is_negative, f.review_required, f.net_weight_grams, f.synced_at
    FROM v_stock_consolidated f
    WHERE ${sql`EXISTS (
      SELECT 1 FROM unnest(f.product_codes) AS c(code) WHERE c.code = ${productCode}
    )`}
    ORDER BY f.siigo_bodega_code
  `);

  return ((rows as unknown as Record<string, unknown>[]) ?? []).map(toStockItem);
}

/**
 * Existencia consolidada de un producto en UNA bodega concreta.
 *
 * Es la validación de backend de cada línea de la orden: la cantidad
 * solicitada se contrasta contra este producto en ESTA bodega, nunca
 * contra la suma de otras bodegas.
 */
export async function getConsolidatedStock(
  productCode: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<ConsolidatedStockItem | null> {
  const rows = await executor.execute(sql`
    SELECT
      f.description, f.unit, f.siigo_bodega_code, f.warehouse_id, f.warehouse_name,
      f.representative_product_id, f.representative_code, f.product_codes,
      f.product_count, f.location_count, f.quantity, f.reserved,
      (f.quantity - f.reserved) AS available,
      f.is_negative, f.review_required, f.net_weight_grams, f.synced_at
    FROM v_stock_consolidated f
    WHERE f.siigo_bodega_code = ${siigoBodegaCode}
      AND ${sql`EXISTS (
        SELECT 1 FROM unnest(f.product_codes) AS c(code) WHERE c.code = ${productCode}
      )`}
    LIMIT 1
  `);

  const row = (rows as unknown as Record<string, unknown>[])[0];
  return row ? toStockItem(row) : null;
}

/**
 * Clave de grupo a partir de un producto (para reservas y conciliación).
 */
export async function groupKeyForProduct(
  productId: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<string | null> {
  const rows = await executor.execute(sql`
    SELECT p.code AS product_code
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.product_id = ${productId}::uuid
      AND b.siigo_bodega_code = ${siigoBodegaCode}
      AND b.is_active
    LIMIT 1
  `);
  const row = (rows as unknown as { product_code: string }[])[0];
  if (!row) return null;
  return consolidatedGroupKey(row.product_code, siigoBodegaCode);
}

/** Redondeo a 3 decimales (misma precisión que el esquema). */
export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
