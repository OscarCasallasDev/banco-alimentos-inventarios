-- ============================================================
-- 0012 — Consolidación de existencias, orden de pedido y base
--        para el módulo de vencimientos y alertas
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Migración ADITIVA e idempotente. NO modifica ni borra los
-- registros originales de Siigo: la consolidación es una VISTA.
-- ============================================================

-- ============================================================
-- 1. Vista consolidada de existencias
--
-- Un mismo producto puede venir en varias ubicaciones dentro de la
-- misma bodega. Para consulta, inventario disponible y órdenes de
-- pedido se consolida por:
--
--     descripción EXACTA  +  unidad  +  bodega
--
-- - La descripción es el criterio de agrupación (trim + espacios
--   colapsados). Descripciones distintas NUNCA se fusionan
--   ("ARROZ X 500 GR" y "ARROZ X 1000 GR" siguen siendo distintos).
-- - La unidad actúa como guarda: no se suman magnitudes incompatibles
--   (kg con unidades).
-- - La bodega se conserva: nunca se mezclan existencias de bodegas
--   diferentes.
--
-- Se suman cantidades positivas y negativas; un total cero o
-- negativo se conserva tal cual.
-- ============================================================

-- Se recrea la vista para poder evolucionar sus columnas sin perder datos
-- (la vista es derivada; las tablas originales no se tocan).
DROP VIEW IF EXISTS "v_imported_warehouses" CASCADE;
DROP VIEW IF EXISTS "v_stock_consolidated" CASCADE;
CREATE OR REPLACE VIEW "v_stock_consolidated" AS
SELECT
  g.description,
  g.unit,
  g.siigo_bodega_code,
  g.warehouse_id,
  g.location_code,
  g.quantity,
  -- Las reservas se agregan por GRUPO (descripci?n + unidad + bodega):
  -- una orden puede reservar sin apuntar a una ubicaci?n concreta.
  COALESCE((
    SELECT SUM(r.reserved_quantity)
    FROM siigo_reservations r
    WHERE r.state = 'PENDING' AND r.group_key = g.group_key
  ), 0) AS reserved,
  g.location_count,
  g.product_count,
  g.product_codes,
  g.representative_product_id,
  g.representative_code,
  g.net_weight_grams,
  g.review_required,
  g.is_negative,
  g.synced_at
FROM (
  SELECT
    btrim(regexp_replace(p.name, '\s+', ' ', 'g')) AS description,
    upper(btrim(p.unit))                              AS unit,
    b.siigo_bodega_code,
    lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) || '|' ||
      upper(btrim(p.unit)) || '|' ||
      b.siigo_bodega_code::text                       AS group_key,
    (array_agg(b.warehouse_id ORDER BY b.location_code))[1] AS warehouse_id,
    min(b.location_code)                              AS location_code,
    sum(b.quantity)                                   AS quantity,
    count(*)                                          AS location_count,
    count(DISTINCT b.product_id)                      AS product_count,
    array_agg(DISTINCT p.code)                        AS product_codes,
    (array_agg(p.id ORDER BY b.location_code))[1]     AS representative_product_id,
    (array_agg(p.code ORDER BY abs(b.quantity) DESC, p.code))[1] AS representative_code,
    max(p.net_weight_grams)                           AS net_weight_grams,
    bool_or(b.review_required)                        AS review_required,
    bool_or(b.is_negative)                            AS is_negative,
    max(b.synced_at)                                  AS synced_at
  FROM siigo_balances b
  JOIN products p ON p.id = b.product_id
  WHERE b.is_active
  GROUP BY 1, 2, 3, 4
) g;

-- ============================================================
-- 2. Bodegas del catálogo oficial importado
--    (las que puede usar el formulario de órdenes de pedido)
-- ============================================================

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
  (SELECT COUNT(DISTINCT v.product_codes)::int FROM v_stock_consolidated v
     WHERE v.siigo_bodega_code = w.siigo_code) AS product_count,
  (SELECT MAX(b.synced_at) FROM siigo_balances b
     WHERE b.siigo_bodega_code = w.siigo_code) AS last_synced_at
FROM warehouses w
WHERE w.source = 'SIIGO';

-- ============================================================
-- 3. Orden de pedido: quién entrega y quién recibe
-- ============================================================

-- Nombre del almacenista que ENTREGA (lo escribe al crear la orden).
ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "deliverer_name" text;
-- Documento de identificación del almacenista que entrega.
ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "deliverer_document" text;

-- Datos de QUIEN RECIBE en despacho (se diligencian al confirmar la
-- recepción, no al crear la orden).
ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "receiver_time" text;
ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "receiver_signed_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_salidas_deliverer" ON "salidas" ("deliverer_name");

-- ============================================================
-- 4. Foto histórica de la consolidación en la línea de la orden
--    (para que reimprimir no dependa del catálogo actual)
-- ============================================================

ALTER TABLE "salida_items" ADD COLUMN IF NOT EXISTS "consolidated_description" text;
ALTER TABLE "salida_items" ADD COLUMN IF NOT EXISTS "consolidated_codes" text[];

-- ============================================================
-- 5. Lotes y vencimientos (base del módulo de alertas)
--
--    La estructura queda lista para el archivo que el Banco entregará.
--    NO se inventa su formato: las columnas se documentación en
--    docs/IMPORTACION_SIIGO.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS "vencimiento_lotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "product_code" text NOT NULL,
  "product_name" text,
  "lot_code" text,
  "siigo_bodega_code" integer,
  "location_code" integer,
  "quantity" numeric(14,3),
  "unit" text,
  "expiration_date" date,
  "import_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  "synced_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_vencimiento_unique"
  ON "vencimiento_lotes" ("product_code", coalesce(lot_code, ''), coalesce(siigo_bodega_code, -1), coalesce(location_code, -1));
CREATE INDEX IF NOT EXISTS "idx_vencimiento_fecha" ON "vencimiento_lotes" ("expiration_date");
CREATE INDEX IF NOT EXISTS "idx_vencimiento_producto" ON "vencimiento_lotes" ("product_code");
CREATE INDEX IF NOT EXISTS "idx_vencimiento_bodega" ON "vencimiento_lotes" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "idx_vencimiento_run" ON "vencimiento_lotes" ("import_run_id");

-- ============================================================
-- 6. Naturaleza de la cantidad importada
--
--    El reporte resumen de Siigo NO trae saldos: su columna O es la
--    diferencia entre entradas y salidas del periodo. Se registra
--    explícitamente para no presentar ese dato como existencia.
-- ============================================================

ALTER TABLE "siigo_resumen_movements" ADD COLUMN IF NOT EXISTS "quantity_nature" varchar(40);
ALTER TABLE "siigo_resumen_movements" ADD COLUMN IF NOT EXISTS "period_from" date;
ALTER TABLE "siigo_resumen_movements" ADD COLUMN IF NOT EXISTS "period_to" date;
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "period_nature" varchar(40);

-- ============================================================
-- 7. Identificador de la corrida de vencimientos
-- ============================================================

ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "vencimiento_records" integer NOT NULL DEFAULT 0;

-- Banderas de los m?dulos de esta etapa
INSERT INTO "feature_flags" ("key", "enabled", "description") VALUES
  ('vencimientos.enabled', true, 'Vencimientos y alertas de inventario')
ON CONFLICT ("key") DO NOTHING;
