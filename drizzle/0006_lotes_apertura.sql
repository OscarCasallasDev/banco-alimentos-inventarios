-- ============================================================
-- MIGRACIÓN 0006: metadatos de productos y saldos de apertura
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Esta migración NO crea lotes retroactivos para las entradas históricas
-- (eso duplicaría el stock). En su lugar:
--   1. Infiere la unidad de manejo y el contenido neto de los productos
--      existentes a partir de su presentación y unidad actuales.
--   2. Crea UN lote de apertura por cada saldo de inventario existente,
--      marcado como OPENING / PARTIAL / histórico.
--
-- Los lotes de apertura no tienen fecha de vencimiento ni documento de
-- entrada: inventarlos violaría la trazabilidad. El Banco debe completar
-- esa información mediante una auditoría o una entrada de regularización.
-- ============================================================

-- ---------- METADATOS DE PRODUCTOS ----------

WITH inferred AS (
  SELECT
    "id",
    CASE
      WHEN "presentation" ILIKE 'Unidad%' THEN 'UND'
      WHEN "presentation" ILIKE 'Libra%' THEN 'LB'
      WHEN "presentation" ILIKE 'Botella%' THEN 'BOTELLA'
      WHEN "presentation" ILIKE 'Caja%' THEN 'CAJA'
      WHEN "presentation" ILIKE 'Lata%' THEN 'LATA'
      WHEN "presentation" ILIKE 'Paquete%' THEN 'PAQUETE'
      WHEN "presentation" ILIKE 'Bolsa%' THEN 'BOLSA'
      WHEN "presentation" ILIKE 'Vaso%' THEN 'VASO'
      WHEN "presentation" ILIKE 'Kg%' THEN 'KG'
      WHEN "unit" ILIKE 'kg%' THEN 'KG'
      WHEN "unit" ILIKE 'l%' THEN 'L'
      ELSE 'UND'
    END AS stock_unit,
    CASE
      WHEN "presentation" ILIKE 'Unidad%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Libra%' THEN 'MASS'
      WHEN "presentation" ILIKE 'Botella%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Caja%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Lata%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Paquete%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Bolsa%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Vaso%' THEN 'COUNT'
      WHEN "presentation" ILIKE 'Kg%' THEN 'MASS'
      WHEN "unit" ILIKE 'kg%' THEN 'MASS'
      WHEN "unit" ILIKE 'l%' THEN 'VOLUME'
      ELSE 'UNKNOWN'
    END AS unit_kind,
    CASE
      WHEN lower("unit") IN ('kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos')
        THEN round(("weight" * 1000)::numeric, 3)
      ELSE NULL
    END AS net_weight_grams,
    CASE
      WHEN lower("unit") IN ('l', 'lt', 'litro', 'litros', 'ml')
        THEN round(("weight" * 1000)::numeric, 3)
      ELSE NULL
    END AS net_volume_ml
  FROM "products"
)
UPDATE "products" p
SET
  "stock_unit" = i.stock_unit,
  "unit_kind" = i.unit_kind::"stock_unit_kind",
  "net_weight_grams" = i.net_weight_grams,
  "net_volume_ml" = i.net_volume_ml,
  "weight_is_estimate" = (
    p."presentation" ILIKE 'Unidad%' OR p."presentation" ILIKE 'Libra%'
  ),
  "tracks_expiration" = (
    p."code" LIKE 'FRV%' OR p."code" LIKE 'LAC%' OR p."code" LIKE 'PAN%'
  ),
  "updated_at" = now()
FROM inferred i
WHERE p."id" = i."id";

-- ---------- LOTES DE APERTURA ----------
-- Un lote por cada fila de inventario con saldo positivo que aún no tenga
-- lotes. El código se deriva del UUID del inventario para que sea idempotente.

WITH admin AS (
  SELECT "id"
  FROM "users"
  WHERE "role" IN ('SUPERADMIN', 'ADMIN')
  ORDER BY "created_at"
  LIMIT 1
),
opening AS (
  SELECT
    i."id" AS inventory_id,
    i."product_id",
    i."warehouse_id",
    i."quantity",
    p."stock_unit",
    p."net_weight_grams",
    p."net_volume_ml",
    p."weight_is_estimate",
    a."id" AS created_by,
    'L-OPEN-' || to_char((now() AT TIME ZONE 'America/Bogota')::date, 'YYYYMMDD') ||
      '-' || upper(substr(replace(i."id"::text, '-', ''), 1, 8)) AS code
  FROM "inventory" i
  JOIN "products" p ON p."id" = i."product_id"
  CROSS JOIN admin a
  WHERE i."quantity" > 0
    AND NOT EXISTS (
      SELECT 1 FROM "lots" l
      WHERE l."product_id" = i."product_id"
        AND l."warehouse_id" = i."warehouse_id"
        AND l."status" <> 'CANCELLED'
    )
)
INSERT INTO "lots" (
  "code",
  "external_code",
  "entry_id",
  "entry_item_id",
  "product_id",
  "warehouse_id",
  "status",
  "origin",
  "traceability",
  "description",
  "notes",
  "expiration_date",
  "received_at",
  "quantity_received",
  "quantity_available",
  "stock_unit",
  "net_weight_grams",
  "net_volume_ml",
  "weight_is_estimate",
  "is_historical",
  "created_by"
)
SELECT
  o.code,
  'APERTURA',
  NULL,
  NULL,
  o.product_id,
  o.warehouse_id,
  'ACTIVE'::"lot_status",
  'OPENING'::"lot_origin",
  'PARTIAL'::"lot_traceability",
  'Saldo de apertura',
  'Lote creado al migrar el inventario existente. Sin fecha de vencimiento ni documento de entrada verificable.',
  NULL,
  NULL,
  o.quantity,
  o.quantity,
  o.stock_unit,
  o.net_weight_grams,
  o.net_volume_ml,
  o.weight_is_estimate,
  true,
  o.created_by
FROM opening o
ON CONFLICT ("code") DO NOTHING;

-- ---------- VISTA DE STOCK POR LOTE (SOLO LECTURA) ----------

CREATE OR REPLACE VIEW "v_lot_stock" AS
SELECT
  l."id",
  l."code",
  l."external_code",
  l."product_id",
  p."code" AS "product_code",
  p."name" AS "product_name",
  l."warehouse_id",
  w."code" AS "warehouse_code",
  w."name" AS "warehouse_name",
  l."status",
  l."origin",
  l."traceability",
  l."expiration_date",
  CASE
    WHEN l."expiration_date" IS NULL THEN NULL
    ELSE (l."expiration_date" - (now() AT TIME ZONE 'America/Bogota')::date)
  END AS "days_to_expire",
  l."received_at",
  l."quantity_received",
  l."quantity_available",
  l."stock_unit",
  l."net_weight_grams",
  l."net_volume_ml",
  round((l."quantity_available" * COALESCE(l."net_weight_grams", 0) / 1000)::numeric, 3)
    AS "available_weight_kg",
  round((l."quantity_available" * COALESCE(l."net_volume_ml", 0) / 1000)::numeric, 3)
    AS "available_volume_l",
  l."weight_is_estimate",
  l."is_historical",
  l."created_at",
  l."updated_at"
FROM "lots" l
JOIN "products" p ON p."id" = l."product_id"
JOIN "warehouses" w ON w."id" = l."warehouse_id";

-- ---------- VISTA DE CONCILIACIÓN (SOLO LECTURA) ----------
-- El inventario agregado debe coincidir con la suma de sus lotes activos.

CREATE OR REPLACE VIEW "v_inventory_reconciliation" AS
SELECT
  i."product_id",
  i."warehouse_id",
  i."quantity" AS "inventory_balance",
  COALESCE(sum(l."quantity_available") FILTER (WHERE l."status" = 'ACTIVE'), 0)
    AS "lot_balance",
  (i."quantity" - COALESCE(sum(l."quantity_available") FILTER (WHERE l."status" = 'ACTIVE'), 0))
    AS "difference"
FROM "inventory" i
LEFT JOIN "lots" l
  ON l."product_id" = i."product_id"
 AND l."warehouse_id" = i."warehouse_id"
GROUP BY i."id", i."product_id", i."warehouse_id", i."quantity";

-- ============================================================
-- FIN DE LA MIGRACIÓN 0006
-- ============================================================
