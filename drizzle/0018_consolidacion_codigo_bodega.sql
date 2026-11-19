-- ============================================================
-- 0018 — Consolidación por CÓDIGO de producto y número de bodega
-- ============================================================
--
-- La dirección del Banco pidió que la referencia de las bodegas sea el
-- CÓDIGO NUMÉRICO (columna B del reporte de Siigo), no el nombre textual
-- de las columnas A ni C:
--
--     Producto | Código     | Col B | Col C                | Existencia
--     Chocolate | 001000100001|  1    | Principal            |    50
--     Chocolate | 001000100001|  1    | Campaña Somos Más    |    50
--     Chocolate | 001000100001|  2    | Bodega secundaria     |    30
--     Chocolate | 001000100001|  3    | Otra descripción      |    20
--
--     → Chocolate | 001000100001 | 1 | 100
--     → Chocolate | 001000100001 | 2 |  30
--     → Chocolate | 001000100001 | 3 |  20
--
-- REGLAS:
--   - Se agrupa por CÓDIGO de producto y número de bodega.
--   - Se suman las ubicaciones y los rótulos textuales de esa MISMA bodega.
--   - NO se mezclan existencias de bodegas diferentes.
--   - NO se fusionan productos con códigos distintos aunque tengan la
--     misma descripción (esto era un error de la vista 0016, que agrupaba
--     por descripción).
--   - La lógica contable NO cambia: el saldo sigue siendo
--     CANT. ANTERIOR + Σ(ENTRADAS − SALIDAS), calculado por el importador.
--     Aquí solo cambia el AGRUPADO del resultado.
--   - `siigo_balances` NO se toca: sigue guardando el detalle por ubicación
--     para la trazabilidad. La consolidación es un cálculo DERIVADO.
--
-- La clave de grupo pasa de `descripción|bodega` a `código|bodega`, que es
-- lo que ya usa `mv_stock_by_bodega`; así las reservas, las conciliaciones y
-- las salidas apuntan al grupo correcto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clave de grupo de las reservas y las conciliaciones
-- ------------------------------------------------------------

UPDATE siigo_reservations s
SET group_key = lower(p.code) || '|' || s.siigo_bodega_code::text
FROM products p
WHERE p.id = s.product_id
  AND (
    s.group_key IS NULL
    OR s.group_key <> lower(p.code) || '|' || s.siigo_bodega_code::text
  );

UPDATE siigo_balance_diffs d
SET group_key = lower(p.code) || '|' || d.siigo_bodega_code::text
FROM products p
WHERE p.id = d.product_id
  AND (
    d.group_key IS NULL
    OR d.group_key <> lower(p.code) || '|' || d.siigo_bodega_code::text
  );

-- ------------------------------------------------------------
-- 2. Vista materializada consolidada por código de producto y bodega
-- ------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS "mv_stock_consolidated" CASCADE;

CREATE MATERIALIZED VIEW "mv_stock_consolidated" AS
SELECT
  btrim(regexp_replace(p.name, '\s+', ' ', 'g'))   AS description,
  upper(btrim(p.unit))                             AS unit,
  b.siigo_bodega_code,
  w.id                                             AS warehouse_id,
  w.name                                           AS warehouse_name,
  b.product_id                                     AS representative_product_id,
  p.code                                           AS representative_code,
  array_agg(DISTINCT p.code)                       AS product_codes,
  COUNT(DISTINCT p.code)::int                      AS product_count,
  COUNT(DISTINCT b.location_code)::int             AS location_count,
  SUM(b.quantity)                                  AS quantity,
  BOOL_OR(b.review_required)                       AS review_required,
  BOOL_OR(b.is_negative)                           AS is_negative,
  MAX(p.net_weight_grams)                          AS net_weight_grams,
  MAX(b.synced_at)                                 AS synced_at,
  lower(p.code) || '|' || b.siigo_bodega_code::text AS group_key
FROM siigo_balances b
JOIN products p ON p.id = b.product_id
LEFT JOIN warehouses w ON w.siigo_code = b.siigo_bodega_code
WHERE b.is_active
GROUP BY
  b.product_id,
  p.code,
  p.name,
  p.unit,
  p.net_weight_grams,
  b.siigo_bodega_code,
  w.id,
  w.name;

CREATE UNIQUE INDEX IF NOT EXISTS "mv_stock_consolidated_key"
  ON "mv_stock_consolidated" ("group_key");
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_bodega"
  ON "mv_stock_consolidated" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_desc_trgm"
  ON "mv_stock_consolidated" USING gin (lower("description") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "mv_stock_consolidated_code_trgm"
  ON "mv_stock_consolidated" USING gin (lower("representative_code") gin_trgm_ops);

-- La vista que consume la aplicación: suma las reservas PENDIENTES del
-- mismo grupo (código de producto + bodega).
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
-- 3. Primer llenado
-- ------------------------------------------------------------

REFRESH MATERIALIZED VIEW "mv_stock_consolidated";
