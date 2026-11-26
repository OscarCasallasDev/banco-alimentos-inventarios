-- Densidad aprobada por producto (kg/L) para presentaciones en volumen.
-- Se asocia al identificador del producto (columna de products), nunca a una
-- descripción genérica que pueda repetirse.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "density_kg_per_liter" numeric(10,4);

-- Datos de conciliación entre importaciones consecutivas y gestión de alertas.
ALTER TABLE "siigo_balance_diffs"
  ADD COLUMN IF NOT EXISTS "previous_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  ADD COLUMN IF NOT EXISTS "expected_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "difference" numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "committed_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "review_status" varchar(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "review_note" text;

CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_review"
  ON "siigo_balance_diffs" ("review_status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_previous_run"
  ON "siigo_balance_diffs" ("previous_run_id");

-- La clave de comparación pasa a ser código de producto + bodega.
UPDATE "siigo_balance_diffs" d
SET "group_key" = lower(p.code) || '|' || d.siigo_bodega_code::text
FROM "products" p
WHERE p.id = d.product_id
  AND (
    d.group_key IS NULL
    OR d.group_key <> lower(p.code) || '|' || d.siigo_bodega_code::text
  );
