-- ============================================================
-- 0015 — Existencias por producto y bodega (fin de la consolidación)
-- ============================================================
--
-- La dirección del Banco pidió poder identificar de qué bodega sale
-- CADA producto. Por eso la disponibilidad ya NO se calcula por
-- descripción consolidada, sino por:
--
--     CÓDIGO DE SIIGO  +  BODEGA
--
-- Reglas:
--   - Dos productos con el MISMO nombre pero en bodegas distintas
--     son existencias distintas y NUNCA se suman entre sí.
--   - Un mismo producto (mismo código) en la misma bodega sí suma sus
--     ubicaciones: es el mismo stock en la misma bodega.
--   - Los registros originales de `siigo_balances` (producto, bodega,
--     ubicación y cantidad) NO se tocan: siguen siendo la fuente de
--     verdad y la trazabilidad.
--   - La vista anterior (`v_stock_consolidated`) se conserva como
--     registro histórico, pero deja de usarse para calcular la
--     disponibilidad y la selección de productos.
--
-- Además:
--   - Se completa `siigo_balances.warehouse_id` con el catálogo de
--     bodegas importado (estaba en NULL, por eso la interfaz mostraba
--     "Siigo 1", "Siigo 2", etc. en vez del nombre de la bodega).
--   - La clave de grupo de reservas y conciliaciones pasa a ser
--     `codigo|bodega` (antes `descripcion|unidad|bodega`), para que la
--     reserva se descuente exactamente de la existencia de ese
--     producto en esa bodega.
--   - Las salidas admiten un programa escrito por el usuario
--     ("Otro programa") y borrado lógico para no perder historial.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bodega de cada existencia (catálogo importado de Siigo)
-- ------------------------------------------------------------

UPDATE siigo_balances b
SET warehouse_id = w.id
FROM warehouses w
WHERE b.warehouse_id IS NULL
  AND w.siigo_code = b.siigo_bodega_code;

CREATE INDEX IF NOT EXISTS "idx_siigo_balances_bodega"
  ON "siigo_balances" ("siigo_bodega_code") WHERE "is_active";

-- ------------------------------------------------------------
-- 2. Vista materializada: existencias por CÓDIGO DE PRODUCTO y BODEGA
-- ------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS "mv_stock_by_bodega" CASCADE;

CREATE MATERIALIZED VIEW "mv_stock_by_bodega" AS
SELECT
  b.product_id,
  p.code                                        AS product_code,
  btrim(regexp_replace(p.name, '\s+', ' ', 'g')) AS description,
  upper(btrim(p.unit))                          AS unit,
  p.presentation                                 AS presentation,
  p.net_weight_grams                            AS net_weight_grams,
  b.siigo_bodega_code,
  w.id                                          AS warehouse_id,
  w.name                                        AS warehouse_name,
  SUM(b.quantity)                               AS quantity,
  COUNT(*)::int                                 AS location_count,
  BOOL_OR(b.review_required)                    AS review_required,
  BOOL_OR(b.is_negative)                        AS is_negative,
  MAX(b.synced_at)                              AS synced_at,
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
  p.presentation,
  p.net_weight_grams,
  b.siigo_bodega_code,
  w.id,
  w.name;

CREATE UNIQUE INDEX IF NOT EXISTS "mv_stock_by_bodega_key"
  ON "mv_stock_by_bodega" ("product_id", "siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "mv_stock_by_bodega_bodega"
  ON "mv_stock_by_bodega" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "mv_stock_by_bodega_code"
  ON "mv_stock_by_bodega" ("product_code");
CREATE INDEX IF NOT EXISTS "mv_stock_by_bodega_desc_trgm"
  ON "mv_stock_by_bodega" USING gin (lower("description") gin_trgm_ops);

-- La vista que consume la aplicación: suma las reservas PENDIENTES
-- del mismo grupo (producto + bodega).
CREATE OR REPLACE VIEW "v_stock_by_bodega" AS
SELECT
  m.product_id,
  m.product_code,
  m.description,
  m.unit,
  m.presentation,
  m.net_weight_grams,
  m.siigo_bodega_code,
  m.warehouse_id,
  m.warehouse_name,
  m.quantity,
  COALESCE(r.reserved, 0) AS reserved,
  m.location_count,
  m.review_required,
  m.is_negative,
  m.synced_at,
  m.group_key
FROM "mv_stock_by_bodega" m
LEFT JOIN LATERAL (
  SELECT SUM(reserved_quantity) AS reserved
  FROM siigo_reservations s
  WHERE s.state = 'PENDING' AND s.group_key = m.group_key
) r ON true;

-- ------------------------------------------------------------
-- 3. Clave de grupo de las reservas: `codigo|bodega`
-- ------------------------------------------------------------

UPDATE siigo_reservations s
SET group_key = lower(p.code) || '|' || s.siigo_bodega_code::text
FROM products p
WHERE p.id = s.product_id
  AND (
    s.group_key IS NULL
    OR s.group_key <> lower(p.code) || '|' || s.siigo_bodega_code::text
  );

-- ------------------------------------------------------------
-- 4. Programa personalizado y borrado lógico de salidas
-- ------------------------------------------------------------

ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "custom_program_name" text;

-- El programa deja de ser obligatorio: con "Otro programa" se guarda
-- el nombre escrito por el usuario. Los registros existentes conservan
-- su programa.
ALTER TABLE "salidas" ALTER COLUMN "program_id" DROP NOT NULL;

ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "deleted_by" uuid
  REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_salidas_deleted"
  ON "salidas" ("deleted_at");

-- ------------------------------------------------------------
-- 5. Bodega por línea de salida (ya existía la columna; se indexa)
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_salida_items_bodega"
  ON "salida_items" ("salida_id", "siigo_bodega_code");

-- ------------------------------------------------------------
-- 6. Primer llenado de la vista
-- ------------------------------------------------------------

REFRESH MATERIALIZED VIEW "mv_stock_by_bodega";
