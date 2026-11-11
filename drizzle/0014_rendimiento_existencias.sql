-- ============================================================
-- 0014 — Rendimiento de existencias y vencimientos
--
-- La consolidación se calcula ahora en una VISTA MATERIALIZADA que se
-- refresca al terminar cada importación. Las lecturas (buscador de la
-- orden, inventario) pasan de ~1,5 s a milisegundos.
--
-- Las reservas (que cambian con cada orden) se unen en vivo desde una
-- agregación por grupo: no obligan a refrescar la vista.
-- ============================================================

-- Índice que faltaba: se consultaba por bodega sin índice.
CREATE INDEX IF NOT EXISTS "idx_siigo_locations_bodega"
  ON "siigo_locations" ("siigo_bodega_code");

-- ------------------------------------------------------------
-- 1. Vista materializada con la parte de existencias
-- ------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS "mv_stock_consolidated" CASCADE;

CREATE MATERIALIZED VIEW "mv_stock_consolidated" AS
SELECT
  btrim(regexp_replace(p.name, '\s+', ' ', 'g')) AS description,
  upper(btrim(p.unit))                           AS unit,
  b.siigo_bodega_code,
  lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) || '|' ||
    upper(btrim(p.unit)) || '|' ||
    b.siigo_bodega_code::text                    AS group_key,
  (array_agg(b.warehouse_id ORDER BY b.location_code))[1] AS warehouse_id,
  min(b.location_code)                           AS location_code,
  sum(b.quantity)                                AS quantity,
  count(*)                                       AS location_count,
  count(DISTINCT b.product_id)                   AS product_count,
  array_agg(DISTINCT p.code)                     AS product_codes,
  (array_agg(p.id ORDER BY b.location_code))[1]  AS representative_product_id,
  (array_agg(p.code ORDER BY abs(b.quantity) DESC, p.code))[1] AS representative_code,
  max(p.net_weight_grams)                        AS net_weight_grams,
  bool_or(b.review_required)                     AS review_required,
  bool_or(b.is_negative)                         AS is_negative,
  max(b.synced_at)                               AS synced_at
FROM siigo_balances b
JOIN products p ON p.id = b.product_id
WHERE b.is_active
GROUP BY 1, 2, 3, 4;

-- Índice único obligatorio para poder refrescar de forma concurrente.
CREATE UNIQUE INDEX IF NOT EXISTS "mv_stock_consolidated_key"
  ON "mv_stock_consolidated" ("group_key");
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_bodega"
  ON "mv_stock_consolidated" ("siigo_bodega_code");
-- Búsqueda por texto: índice trigram (ya habilitado en la migración 0009).
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_desc_trgm"
  ON "mv_stock_consolidated" USING gin (lower("description") gin_trgm_ops);

-- ------------------------------------------------------------
-- 2. La vista que consume la aplicación une las reservas en vivo
-- ------------------------------------------------------------

DROP VIEW IF EXISTS "v_imported_warehouses" CASCADE;
DROP VIEW IF EXISTS "v_stock_consolidated" CASCADE;

CREATE OR REPLACE VIEW "v_stock_consolidated" AS
SELECT
  m.description,
  m.unit,
  m.siigo_bodega_code,
  m.warehouse_id,
  m.location_code,
  m.quantity,
  COALESCE(r.reserved, 0) AS reserved,
  m.location_count,
  m.product_count,
  m.product_codes,
  m.representative_product_id,
  m.representative_code,
  m.net_weight_grams,
  m.review_required,
  m.is_negative,
  m.synced_at
FROM "mv_stock_consolidated" m
LEFT JOIN LATERAL (
  SELECT SUM(reserved_quantity) AS reserved
  FROM siigo_reservations r
  WHERE r.state = 'PENDING' AND r.group_key = m.group_key
) r ON true;

-- ------------------------------------------------------------
-- 3. Bodegas importadas (se recrea porque dependía de la vista)
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW "v_imported_warehouses" AS
SELECT
  w.id,
  w.code,
  w.name,
  w.siigo_code,
  w.source,
  w.status,
  w.description,
  w.observations,
  (SELECT COUNT(*)::int FROM siigo_locations l
     WHERE l.siigo_bodega_code = w.siigo_code) AS location_count,
  (SELECT COUNT(*)::int FROM siigo_balances b
     WHERE b.siigo_bodega_code = w.siigo_code AND b.is_active
       AND b.quantity <> 0) AS product_count,
  (SELECT MAX(b.synced_at) FROM siigo_balances b
     WHERE b.siigo_bodega_code = w.siigo_code) AS last_synced_at
FROM warehouses w
WHERE w.source = 'SIIGO';

-- ------------------------------------------------------------
-- 4. Índices para las alertas de vencimientos
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_siigo_reservations_group_pending"
  ON "siigo_reservations" ("group_key") WHERE "state" = 'PENDING';

-- Primer llenado.
REFRESH MATERIALIZED VIEW "mv_stock_consolidated";
