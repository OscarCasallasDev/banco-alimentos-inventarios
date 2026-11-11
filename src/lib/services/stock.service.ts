/**
 * Existencias consolidadas.
 *
 * Siigo registra un mismo producto en varias UBICACIONES dentro de la misma
 * bodega. Para consulta, inventario disponible y órdenes de pedido, el
 * sistema consolida por:
 *
 *     descripción EXACTA  +  unidad  +  bodega
 *
 * Reglas:
 *   - Se suman las cantidades de todas las ubicaciones (positivas y
 *     negativas). Un total cero o negativo se conserva tal cual.
 *   - Descripciones distintas NUNCA se fusionan («ARROZ X 500 GR» y
 *     «ARROZ X 1000 GR» siguen siendo productos diferentes).
 *   - La unidad evita sumar magnitudes incompatibles (kg con unidades).
 *   - La bodega se conserva: no se mezclan existencias de bodegas distintas.
 *
 * La consolidación es una VISTA (`v_stock_consolidated`): los registros
 * originales de cada ubicación se conservan intactos para trazabilidad.
 */

import { sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";

/** Clave de grupo consolidado: descripción | unidad | bodega. */
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

export interface ConsolidatedStockItem {
  /** Descripción exacta del producto (normalizada en espacios). */
  description: string;
  unit: string;
  siigoBodegaCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  /** Código representativo del grupo (el de mayor existencia). */
  representativeCode: string;
  representativeProductId: string;
  /** Todos los códigos de Siigo que componen el grupo. */
  productCodes: string[];
  productCount: number;
  locationCount: number;
  /** Existencia informada por Siigo (suma de ubicaciones). */
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

/**
 * Lista las existencias consolidadas con búsqueda, filtros y paginación.
 */
export async function listConsolidatedStock(
  query: ConsolidatedStockQuery,
  executor: DbExecutor = getDb()
): Promise<ConsolidatedStockResult> {
  const page = query.page ?? 0;
  const pageSize = Math.min(query.pageSize ?? 25, 200);
  const where = buildConditions(query);

  const rows = await executor.execute(sql`
    SELECT
      v.description,
      v.unit,
      v.siigo_bodega_code,
      v.warehouse_id,
      w.name AS warehouse_name,
      v.representative_code,
      v.representative_product_id,
      v.product_codes,
      v.product_count,
      v.location_count,
      v.quantity,
      v.reserved,
      (v.quantity - v.reserved) AS available,
      v.is_negative,
      v.review_required,
      v.net_weight_grams,
      v.synced_at
    FROM v_stock_consolidated v
    LEFT JOIN warehouses w ON w.id = v.warehouse_id
    WHERE ${where}
    ORDER BY v.description, v.siigo_bodega_code
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `);

  const summaryRows = await executor.execute(sql`
    SELECT
      COUNT(*)::int AS groups,
      COUNT(*) FILTER (WHERE (v.quantity - v.reserved) > 0)::int AS positive,
      COUNT(*) FILTER (WHERE (v.quantity - v.reserved) = 0)::int AS zero,
      COUNT(*) FILTER (WHERE (v.quantity - v.reserved) < 0)::int AS negative,
      COALESCE(SUM(v.quantity), 0) AS total_quantity,
      COALESCE(SUM(v.quantity - v.reserved), 0) AS total_available
    FROM v_stock_consolidated v
    WHERE ${where}
  `);

  const summary = (summaryRows as unknown as Record<string, number | string>[])[0];

  const items: ConsolidatedStockItem[] = (
    rows as unknown as Record<string, unknown>[]
  ).map((row) => {
    const quantity = Number(row.quantity ?? 0);
    const reserved = Number(row.reserved ?? 0);
    const available = Number(row.available ?? quantity - reserved);
    const codes = (row.product_codes as string[] | null) ?? [];
    return {
      description: String(row.description ?? ""),
      unit: String(row.unit ?? ""),
      siigoBodegaCode: Number(row.siigo_bodega_code),
      warehouseId: (row.warehouse_id as string | null) ?? null,
      warehouseName: (row.warehouse_name as string | null) ?? null,
      representativeCode: String(row.representative_code ?? ""),
      representativeProductId: String(row.representative_product_id ?? ""),
      productCodes: codes,
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
  });

  return {
    items,
    total: Number(summary?.groups ?? 0),
    totals: {
      groups: Number(summary?.groups ?? 0),
      positive: Number(summary?.positive ?? 0),
      zero: Number(summary?.zero ?? 0),
      negative: Number(summary?.negative ?? 0),
      totalQuantity: round3(Number(summary?.total_quantity ?? 0)),
      totalAvailable: round3(Number(summary?.total_available ?? 0)),
    },
  };
}

/**
 * Resuelve el grupo consolidado al que pertenece un producto y una bodega.
 *
 * Es la pieza que usa el backend para validar la disponibilidad real de una
 * línea de la orden, sin importar en qué ubicación (o en qué código de la
 * misma descripción) esté el inventario.
 */
export async function getConsolidatedGroup(
  productId: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<ConsolidatedStockItem | null> {
  const rows = await executor.execute(sql`
    SELECT
      v.description, v.unit, v.siigo_bodega_code, v.warehouse_id,
      w.name AS warehouse_name, v.representative_code,
      v.representative_product_id, v.product_codes, v.product_count,
      v.location_count, v.quantity, v.reserved,
      (v.quantity - v.reserved) AS available,
      v.is_negative, v.review_required, v.net_weight_grams, v.synced_at
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    JOIN v_stock_consolidated v
      ON v.description = btrim(regexp_replace(p.name, '\s+', ' ', 'g'))
     AND v.unit = upper(btrim(p.unit))
     AND v.siigo_bodega_code = b.siigo_bodega_code
    LEFT JOIN warehouses w ON w.id = v.warehouse_id
    WHERE b.product_id = ${productId}::uuid
      AND b.siigo_bodega_code = ${siigoBodegaCode}
      AND b.is_active
    LIMIT 1
  `);

  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) return null;

  const quantity = Number(row.quantity ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const available = Number(row.available ?? quantity - reserved);

  return {
    description: String(row.description ?? ""),
    unit: String(row.unit ?? ""),
    siigoBodegaCode: Number(row.siigo_bodega_code),
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    representativeCode: String(row.representative_code ?? ""),
    representativeProductId: String(row.representative_product_id ?? ""),
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
 * Clave de grupo a partir de un producto (para reservas y conciliación).
 */
export async function groupKeyForProduct(
  productId: string,
  siigoBodegaCode: number,
  executor: DbExecutor = getDb()
): Promise<string | null> {
  const rows = await executor.execute(sql`
    SELECT p.name, p.unit
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.product_id = ${productId}::uuid
      AND b.siigo_bodega_code = ${siigoBodegaCode}
      AND b.is_active
    LIMIT 1
  `);
  const row = (rows as unknown as { name: string; unit: string }[])[0];
  if (!row) return null;
  return consolidatedGroupKey(row.name, row.unit, siigoBodegaCode);
}

/** Redondeo a 3 decimales (misma precisión que el esquema). */
export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
