-- ============================================================
-- MIGRACIÓN 0007: Operación de lotes, vencimientos y peso
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Cambios ADITIVOS sobre el modelo existente:
--   • Snapshot de presentación y naturaleza de unidad en cada lote, para que
--     los reportes históricos no cambien cuando el catálogo se actualiza.
--   • Tabla de parámetros del sistema (horizonte de alertas de vencimiento).
--   • Acciones de auditoría propias de los lotes.
--   • Restricciones de integridad sobre el contenido neto (peso/volumen).
--   • Índices parciales para las consultas operativas más frecuentes:
--     FEFO, reporte de vencimientos y consulta por producto/bodega.
--   • Trigger que impide marcar un lote como trazabilidad completa cuando
--     el producto controla vencimiento y la fecha no fue informada.
--
-- NO inventa fechas de vencimiento, NO recalcula existencias, NO borra
-- datos y NO modifica movimientos históricos.
-- ============================================================

-- ---------- LOTES: SNAPSHOT DE PRESENTACIÓN Y NATURALEZA DE UNIDAD ----------

ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "presentation" varchar(100);
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "unit_kind" "stock_unit_kind" DEFAULT 'UNKNOWN' NOT NULL;

-- La presentación del lote es la de la línea de entrada; si la línea no la
-- tiene, se usa la del catálogo en el momento de la migración.
UPDATE "lots" l
SET "presentation" = COALESCE(
      (SELECT ei."presentation" FROM "entry_items" ei WHERE ei."id" = l."entry_item_id"),
      (SELECT p."presentation" FROM "products" p WHERE p."id" = l."product_id")
    )
WHERE l."presentation" IS NULL;

-- La naturaleza de la unidad se congela con el lote: si mañana el producto
-- cambia de COUNT a MASS, los reportes de lotes históricos siguen siendo
-- correctos.
UPDATE "lots" l
SET "unit_kind" = COALESCE(
      (SELECT p."unit_kind" FROM "products" p WHERE p."id" = l."product_id"),
      'UNKNOWN'::"stock_unit_kind"
    )
WHERE l."unit_kind" = 'UNKNOWN';

-- ---------- PARÁMETROS DEL SISTEMA ----------

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" varchar(80) PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "system_settings" ("key", "value", "description")
VALUES
  ('expiry_alert_days', '30', 'Días de horizonte para la alerta de próximos vencimientos'),
  ('expiry_critical_days', '7', 'Días a partir de los cuales un lote se considera crítico')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- ---------- ACCIONES DE AUDITORÍA PARA LOTES ----------

ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'LOT_CREATE';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'LOT_UPDATE';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'LOT_BLOCK';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'LOT_DISPOSE';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'LOT_EXPIRATION_CHANGE';

-- ---------- INTEGRIDAD DEL CONTENIDO NETO ----------

-- Un contenido neto de 0 no es "cero gramos": es un dato desconocido. Se
-- normaliza a NULL para que los agregados no lo cuenten como peso real.
UPDATE "products" SET "net_weight_grams" = NULL WHERE "net_weight_grams" = 0;
UPDATE "products" SET "net_volume_ml" = NULL WHERE "net_volume_ml" = 0;
UPDATE "lots" SET "net_weight_grams" = NULL WHERE "net_weight_grams" = 0;
UPDATE "lots" SET "net_volume_ml" = NULL WHERE "net_volume_ml" = 0;

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_net_weight_positive";
ALTER TABLE "products"
  ADD CONSTRAINT "products_net_weight_positive"
  CHECK ("net_weight_grams" IS NULL OR "net_weight_grams" > 0);

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_net_volume_positive";
ALTER TABLE "products"
  ADD CONSTRAINT "products_net_volume_positive"
  CHECK ("net_volume_ml" IS NULL OR "net_volume_ml" > 0);

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_net_weight_positive";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_net_weight_positive"
  CHECK ("net_weight_grams" IS NULL OR "net_weight_grams" > 0);

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_net_volume_positive";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_net_volume_positive"
  CHECK ("net_volume_ml" IS NULL OR "net_volume_ml" > 0);

-- Un lote no puede tener más disponible que lo recibido.
ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_quantity_available_within_received";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_quantity_available_within_received"
  CHECK ("quantity_available" >= 0 AND "quantity_available" <= "quantity_received");

-- ---------- VENCIMIENTO OBLIGATORIO CUANDO EL PRODUCTO LO EXIGE ----------

-- Un lote que proviene de una entrada y cuyo producto controla vencimiento
-- no puede declararse de trazabilidad completa sin fecha. Se acepta la
-- fecha nula, pero entonces el lote queda marcado como trazabilidad parcial
-- (NO EXPIRY se calcula en el servidor, no se inventa la fecha).
CREATE OR REPLACE FUNCTION "validate_lot_expiration"()
RETURNS trigger AS $$
DECLARE
  requires_expiration boolean;
BEGIN
  IF NEW."expiration_date" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."origin" <> 'ENTRY' OR NEW."is_historical" THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p."tracks_expiration", false)
    INTO requires_expiration
  FROM "products" p
  WHERE p."id" = NEW."product_id";

  IF requires_expiration AND NEW."traceability" = 'FULL' THEN
    RAISE EXCEPTION
      'El producto % controla vencimiento: un lote de entrada sin fecha debe quedar con trazabilidad parcial',
      NEW."product_id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_lots_expiration_required" ON "lots";
CREATE TRIGGER "trg_lots_expiration_required"
  BEFORE INSERT OR UPDATE OF "expiration_date", "traceability" ON "lots"
  FOR EACH ROW EXECUTE FUNCTION "validate_lot_expiration"();

-- ---------- ÍNDICES OPERATIVOS ----------

-- FEFO: lotes activos con existencia de un producto en una bodega.
CREATE INDEX IF NOT EXISTS "idx_lots_available_fefo"
  ON "lots" ("product_id", "warehouse_id", "expiration_date" ASC NULLS LAST, "received_at" ASC NULLS LAST)
  WHERE "status" = 'ACTIVE' AND "quantity_available" > 0;

-- Reporte de vencimientos: solo los lotes que aún tienen mercancía.
CREATE INDEX IF NOT EXISTS "idx_lots_expiry_available"
  ON "lots" ("expiration_date")
  WHERE "status" = 'ACTIVE' AND "quantity_available" > 0;

-- Consulta de lotes por producto y bodega.
CREATE INDEX IF NOT EXISTS "idx_lots_product_warehouse_status"
  ON "lots" ("product_id", "warehouse_id", "status");

-- Historial de movimientos de un lote en el tiempo.
CREATE INDEX IF NOT EXISTS "idx_movements_lot_created"
  ON "inventory_movements" ("lot_id", "created_at" DESC);

-- Ajustes de auditoría sobre un lote.
CREATE INDEX IF NOT EXISTS "idx_audit_item_lots_lot"
  ON "audit_item_lots" ("lot_id");

-- ============================================================
-- FIN DE LA MIGRACIÓN 0007
-- ============================================================
