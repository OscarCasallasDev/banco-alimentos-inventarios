-- ============================================================
-- 0013 — Clave de grupo consolidado en reservas y diferencias
--
-- La consolidación agrupa por (descripción exacta, unidad, bodega).
-- Para que la conciliación con Siigo siga funcionando cuando una orden
-- usa un producto y el descuento aparece en otro código de la misma
-- descripción, las reservas y las diferencias se identifican con la
-- MISMA clave de grupo.
-- ============================================================

ALTER TABLE "siigo_reservations" ADD COLUMN IF NOT EXISTS "group_key" text;
ALTER TABLE "siigo_balance_diffs" ADD COLUMN IF NOT EXISTS "group_key" text;

CREATE INDEX IF NOT EXISTS "idx_siigo_res_group_key"
  ON "siigo_reservations" ("group_key");
CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_group_key"
  ON "siigo_balance_diffs" ("group_key");

-- Relleno de las filas existentes con la clave que corresponda.
UPDATE "siigo_reservations" r
SET "group_key" =
  lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) || '|' ||
  upper(btrim(p.unit)) || '|' || r."siigo_bodega_code"::text
FROM "products" p
WHERE p.id = r."product_id" AND r."group_key" IS NULL;

UPDATE "siigo_balance_diffs" d
SET "group_key" =
  lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) || '|' ||
  upper(btrim(p.unit)) || '|' || d."siigo_bodega_code"::text
FROM "products" p
WHERE p.id = d."product_id" AND d."group_key" IS NULL;
