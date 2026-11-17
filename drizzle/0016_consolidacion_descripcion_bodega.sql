-- ============================================================
-- 0016 — Consolidación por descripción y bodega
-- ============================================================
--
-- La dirección del Banco pidió volver a consolidar por DESCRIPCIÓN EXACTA
-- y BODEGA, sumando las existencias de las distintas ubicaciones:
--
--     ACEITE DE OLIVA / Bodega 1 / Ubicación 1 / 30
--     ACEITE DE OLIVA / Bodega 1 / Ubicación 4 / 20
--     → ACEITE DE OLIVA / Bodega 1 / 50
--
-- Reglas:
--   - Se agrupa por descripción exacta y bodega.
--   - NO se mezclan existencias de bodegas diferentes.
--   - NO se fusionan productos con descripciones diferentes.
--   - Los códigos, las ubicaciones y los registros originales se conservan
--     para trazabilidad (la consolidación es un cálculo DERIVADO; la tabla
--     `siigo_balances` no se toca).
--   - Las cantidades negativas y los resultados en cero se conservan.
--   - La vista por código (`mv_stock_by_bodega`) se mantiene como detalle
--     original de cada grupo consolidado.
--
-- Además, la clave de grupo de las reservas y de las conciliaciones pasa
-- a `descripción|bodega` para que coincida con la consolidación y cada
-- salida se descuente del saldo del grupo correcto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vista materializada consolidada por descripción y bodega
-- ------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS "mv_stock_consolidated" CASCADE;

CREATE MATERIALIZED VIEW "mv_stock_consolidated" AS
WITH base AS (
  SELECT
    btrim(regexp_replace(p.name, '\s+', ' ', 'g'))       AS description,
    upper(btrim(p.unit))                                 AS unit,
    b.siigo_bodega_code,
    p.id                                                 AS product_id,
    p.code                                               AS product_code,
    b.location_code                                      AS location_code,
    b.quantity                                           AS quantity,
    p.net_weight_grams                                   AS net_weight_grams,
    b.review_required                                    AS review_required,
    b.is_negative                                        AS is_negative,
    b.synced_at                                          AS synced_at
  FROM siigo_balances b
  JOIN products p ON p.id = b.product_id
  WHERE b.is_active
),
-- Producto representante del grupo: el de mayor existencia absoluta.
-- Los empates se rompen por código para que el resultado sea estable.
representante AS (
  SELECT DISTINCT ON (description, siigo_bodega_code)
    description, siigo_bodega_code,
    product_id, product_code, unit, net_weight_grams
  FROM base
  ORDER BY description, siigo_bodega_code,
           abs(quantity) DESC, product_code ASC
)
SELECT
  g.description,
  r.unit,
  g.siigo_bodega_code,
  w.id   AS warehouse_id,
  w.name AS warehouse_name,
  r.product_id          AS representative_product_id,
  r.product_code        AS representative_code,
  g.product_codes,
  g.product_count,
  g.location_count,
  g.quantity,
  g.review_required,
  g.is_negative,
  r.net_weight_grams,
  g.synced_at,
  lower(g.description) || '|' || g.siigo_bodega_code::text AS group_key
FROM (
  SELECT
    description,
    siigo_bodega_code,
    array_agg(DISTINCT product_code)          AS product_codes,
    COUNT(DISTINCT product_code)::int         AS product_count,
    COUNT(DISTINCT location_code)::int        AS location_count,
    SUM(quantity)                             AS quantity,
    BOOL_OR(review_required)                  AS review_required,
    BOOL_OR(is_negative)                      AS is_negative,
    MAX(synced_at)                            AS synced_at
  FROM base
  GROUP BY description, siigo_bodega_code
) g
JOIN representante r
  ON r.description = g.description
 AND r.siigo_bodega_code = g.siigo_bodega_code
LEFT JOIN warehouses w ON w.siigo_code = g.siigo_bodega_code;
CREATE UNIQUE INDEX IF NOT EXISTS "mv_stock_consolidated_key"
  ON "mv_stock_consolidated" ("group_key");
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_bodega"
  ON "mv_stock_consolidated" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_desc_trgm"
  ON "mv_stock_consolidated" USING gin (lower("description") gin_trgm_ops);

-- La vista que consume la aplicación: suma las reservas PENDIENTES del
-- mismo grupo (descripción + bodega).
CREATE OR REPLACE VIEW "v_stock_consolidated" AS
SELECT
  m.description,
  m.unit,
  m.siigo_bodega_code,
  m.warehouse_id,
  m.warehouse_name,
  m.representative_product_id,
  m.representative_code,
  m.product_codes,
  m.product_count,
  m.location_count,
  m.quantity,
  COALESCE(r.reserved, 0) AS reserved,
  m.review_required,
  m.is_negative,
  m.net_weight_grams,
  m.synced_at,
  m.group_key
FROM "mv_stock_consolidated" m
LEFT JOIN LATERAL (
  SELECT SUM(reserved_quantity) AS reserved
  FROM siigo_reservations s
  WHERE s.state = 'PENDING' AND s.group_key = m.group_key
) r ON true;

-- ------------------------------------------------------------
-- 2. Clave de grupo de las reservas: `descripción|bodega`
-- ------------------------------------------------------------

UPDATE siigo_reservations s
SET group_key = lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
                || '|' || s.siigo_bodega_code::text
FROM products p
WHERE p.id = s.product_id
  AND (
    s.group_key IS NULL
    OR s.group_key <> lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
                       || '|' || s.siigo_bodega_code::text
  );

-- ------------------------------------------------------------
-- 3. Las diferencias de conciliación se calculan con la misma clave
-- ------------------------------------------------------------

UPDATE siigo_balance_diffs d
SET group_key = lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
                 || '|' || d.siigo_bodega_code::text
FROM products p
WHERE p.id = d.product_id
  AND (
    d.group_key IS NULL
    OR d.group_key <> lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
                        || '|' || d.siigo_bodega_code::text
  );

-- ------------------------------------------------------------
-- 4. Primer llenado
-- ------------------------------------------------------------

REFRESH MATERIALIZED VIEW "mv_stock_consolidated";
