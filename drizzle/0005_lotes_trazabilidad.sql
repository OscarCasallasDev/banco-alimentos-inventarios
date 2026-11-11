-- ============================================================
-- MIGRACIÓN 0005: Modelo de lotes y trazabilidad
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Cambios ADITIVOS sobre el modelo existente:
--   • Convierte `entry_item_lots` en `lots` (tabla de trazabilidad real).
--   • Separa cantidad recibida (histórica) de cantidad disponible.
--   • Agrega unidad de manejo y contenido neto por lote.
--   • Crea consecutivos atómicos de código de lote.
--   • Registra la asignación de lotes en salidas y auditorías.
--   • Agrega `lot_id` al libro inmutable de movimientos.
--   • Agrega campos de medición y vencimiento a productos.
--   • Garantiza idempotencia con `stock_applied_at`.
--
-- NO elimina columnas, NO borra datos y NO recalcula saldos históricos.
-- ============================================================

-- ---------- ENUMS ----------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lot_status') THEN
    CREATE TYPE "public"."lot_status" AS ENUM(
      'DRAFT', 'ACTIVE', 'BLOCKED', 'DEPLETED', 'DISPOSED', 'CANCELLED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lot_origin') THEN
    CREATE TYPE "public"."lot_origin" AS ENUM(
      'ENTRY', 'OPENING', 'ADJUSTMENT', 'RETURN', 'TRANSFER', 'MIGRATION'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lot_traceability') THEN
    CREATE TYPE "public"."lot_traceability" AS ENUM('FULL', 'PARTIAL', 'NONE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_unit_kind') THEN
    CREATE TYPE "public"."stock_unit_kind" AS ENUM('COUNT', 'MASS', 'VOLUME', 'UNKNOWN');
  END IF;
END $$;

-- ---------- PRODUCTOS: unidad de manejo y contenido neto ----------

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_unit" varchar(20) DEFAULT 'UND' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit_kind" "stock_unit_kind" DEFAULT 'UNKNOWN' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "net_weight_grams" numeric(14, 3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "net_volume_ml" numeric(14, 3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_is_estimate" boolean DEFAULT false NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tracks_expiration" boolean DEFAULT true NOT NULL;

-- El stock mínimo deja de ser entero: hay productos que se manejan por peso.
ALTER TABLE "products"
  ALTER COLUMN "min_stock" TYPE numeric(14, 3) USING "min_stock"::numeric;

-- ---------- RENOMBRAR LA TABLA DE LOTES ----------

DO $$
BEGIN
  IF to_regclass('public.entry_item_lots') IS NOT NULL
     AND to_regclass('public.lots') IS NULL THEN
    ALTER TABLE "entry_item_lots" RENAME TO "lots";
  END IF;
END $$;

-- El código anterior era el código externo del proveedor; el nuevo `code`
-- es el identificador interno inmutable generado por el sistema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'external_code'
  ) THEN
    ALTER TABLE "lots" RENAME COLUMN "code" TO "external_code";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lots' AND column_name = 'quantity_received'
  ) THEN
    ALTER TABLE "lots" RENAME COLUMN "quantity" TO "quantity_received";
  END IF;
END $$;

-- ---------- LOTES: columnas de trazabilidad ----------

ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "code" varchar(50);
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "external_code" varchar(100);
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "entry_id" uuid;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "status" "lot_status" DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "origin" "lot_origin" DEFAULT 'ENTRY' NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "traceability" "lot_traceability" DEFAULT 'PARTIAL' NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "received_at" timestamp;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "quantity_received" numeric(14, 3) DEFAULT 0 NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "quantity_available" numeric(14, 3) DEFAULT 0 NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "stock_unit" varchar(20) DEFAULT 'UND' NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "net_weight_grams" numeric(14, 3);
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "net_volume_ml" numeric(14, 3);
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "weight_is_estimate" boolean DEFAULT false NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "is_historical" boolean DEFAULT false NOT NULL;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "parent_lot_id" uuid;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Los lotes antiguos (si existieran) se completan con datos verificables.
UPDATE "lots" l
SET "warehouse_id" = ei."warehouse_id",
    "entry_id" = ei."entry_id",
    "entry_item_id" = COALESCE(l."entry_item_id", ei."id")
FROM "entry_items" ei
WHERE l."entry_item_id" = ei."id"
  AND (l."warehouse_id" IS NULL OR l."entry_id" IS NULL);

UPDATE "lots" l
SET "created_by" = e."user_id"
FROM "entry_items" ei
JOIN "entries" e ON e."id" = ei."entry_id"
WHERE l."entry_item_id" = ei."id"
  AND l."created_by" IS NULL;

UPDATE "lots"
SET "created_by" = (
  SELECT "id" FROM "users"
  WHERE "role" IN ('SUPERADMIN', 'ADMIN')
  ORDER BY "created_at" LIMIT 1
)
WHERE "created_by" IS NULL
  AND EXISTS (SELECT 1 FROM "users");

UPDATE "lots"
SET "stock_unit" = COALESCE((SELECT p."stock_unit" FROM "products" p WHERE p."id" = "lots"."product_id"), 'UND')
WHERE "stock_unit" = 'UND';

UPDATE "lots" SET "quantity_received" = 0 WHERE "quantity_received" IS NULL;
UPDATE "lots" SET "quantity_available" = "quantity_received" WHERE "quantity_available" = 0 AND "quantity_received" > 0;

UPDATE "lots"
SET "code" = 'L-LEGACY-' || upper(substr(replace("id"::text, '-', ''), 1, 12))
WHERE "code" IS NULL;

UPDATE "lots" SET "external_code" = "description" WHERE "external_code" IS NULL AND "description" IS NOT NULL;

ALTER TABLE "lots" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "lots" ALTER COLUMN "warehouse_id" SET NOT NULL;
ALTER TABLE "lots" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "lots" ALTER COLUMN "entry_item_id" DROP NOT NULL;

-- El lote debe sobrevivir al documento: la trazabilidad no se borra en cascada.
ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "entry_item_lots_entry_item_id_entry_items_id_fk";
ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_entry_item_id_entry_items_id_fk";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_entry_item_id_entry_items_id_fk"
  FOREIGN KEY ("entry_item_id") REFERENCES "public"."entry_items"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_entry_id_entries_id_fk";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_entry_id_entries_id_fk"
  FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_warehouse_id_warehouses_id_fk";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_warehouse_id_warehouses_id_fk"
  FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id")
  ON DELETE no action ON UPDATE no action;

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_created_by_users_id_fk";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_parent_lot_id_lots_id_fk";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_parent_lot_id_lots_id_fk"
  FOREIGN KEY ("parent_lot_id") REFERENCES "public"."lots"("id")
  ON DELETE set null ON UPDATE no action;

-- ---------- LOTES: índices y reglas de integridad ----------

CREATE UNIQUE INDEX IF NOT EXISTS "idx_lots_code_unique" ON "lots" ("code");
CREATE INDEX IF NOT EXISTS "idx_lots_entry_item" ON "lots" ("entry_item_id");
CREATE INDEX IF NOT EXISTS "idx_lots_entry" ON "lots" ("entry_id");
CREATE INDEX IF NOT EXISTS "idx_lots_product" ON "lots" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_lots_warehouse" ON "lots" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_lots_expiration" ON "lots" ("expiration_date");
CREATE INDEX IF NOT EXISTS "idx_lots_status_available" ON "lots" ("status", "quantity_available");
CREATE INDEX IF NOT EXISTS "idx_lots_fefo"
  ON "lots" ("product_id", "warehouse_id", "expiration_date" ASC NULLS LAST, "received_at" ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS "idx_lots_created" ON "lots" ("created_at");

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_quantity_received_positive";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_quantity_received_positive" CHECK ("quantity_received" > 0);

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_quantity_available_nonnegative";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_quantity_available_nonnegative"
  CHECK ("quantity_available" >= 0 AND "quantity_available" <= "quantity_received");

ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "lots_net_content_nonnegative";
ALTER TABLE "lots"
  ADD CONSTRAINT "lots_net_content_nonnegative"
  CHECK (
    ("net_weight_grams" IS NULL OR "net_weight_grams" >= 0)
    AND ("net_volume_ml" IS NULL OR "net_volume_ml" >= 0)
  );

-- ---------- CONSECUTIVO ATÓMICO DE CÓDIGOS DE LOTE ----------

CREATE TABLE IF NOT EXISTS "lot_sequences" (
  "scope" varchar(80) PRIMARY KEY NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ---------- MOVIMIENTOS: vínculo con el lote ----------

ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "lot_id" uuid;
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "lot_balance_after" numeric(14, 3);

ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_lot_id_lots_id_fk";
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_lot_id_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_movements_lot" ON "inventory_movements" ("lot_id");
CREATE INDEX IF NOT EXISTS "idx_movements_document" ON "inventory_movements" ("document_type", "document_id");

-- El inventario nunca puede quedar negativo, ni siquiera por una carrera.
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_quantity_nonnegative";
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_nonnegative" CHECK ("quantity" >= 0);

-- ---------- IDEMPOTENCIA DE LA APLICACIÓN DE STOCK ----------

ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "stock_applied_at" timestamp;
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "stock_applied_at" timestamp;
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "stock_applied_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_entries_number_unique" ON "entries" ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dispatches_receipt_unique" ON "dispatches" ("receipt_id");

-- ---------- ASIGNACIÓN DE LOTES EN SALIDAS ----------

CREATE TABLE IF NOT EXISTS "dispatch_item_lots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dispatch_item_id" uuid NOT NULL,
  "lot_id" uuid NOT NULL,
  "quantity" numeric(14, 3) NOT NULL,
  "net_weight_grams" numeric(14, 3),
  "net_volume_ml" numeric(14, 3),
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "dispatch_item_lots" DROP CONSTRAINT IF EXISTS "dispatch_item_lots_dispatch_item_id_dispatch_items_id_fk";
ALTER TABLE "dispatch_item_lots"
  ADD CONSTRAINT "dispatch_item_lots_dispatch_item_id_dispatch_items_id_fk"
  FOREIGN KEY ("dispatch_item_id") REFERENCES "public"."dispatch_items"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "dispatch_item_lots" DROP CONSTRAINT IF EXISTS "dispatch_item_lots_lot_id_lots_id_fk";
ALTER TABLE "dispatch_item_lots"
  ADD CONSTRAINT "dispatch_item_lots_lot_id_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_dispatch_item_lots_unique"
  ON "dispatch_item_lots" ("dispatch_item_id", "lot_id");
CREATE INDEX IF NOT EXISTS "idx_dispatch_item_lots_lot" ON "dispatch_item_lots" ("lot_id");

ALTER TABLE "dispatch_item_lots" DROP CONSTRAINT IF EXISTS "dispatch_item_lots_quantity_positive";
ALTER TABLE "dispatch_item_lots"
  ADD CONSTRAINT "dispatch_item_lots_quantity_positive" CHECK ("quantity" > 0);

-- ---------- CONTEO / AJUSTE POR LOTE ----------

CREATE TABLE IF NOT EXISTS "audit_item_lots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_item_id" uuid NOT NULL,
  "lot_id" uuid NOT NULL,
  "system_quantity" numeric(14, 3) NOT NULL,
  "physical_quantity" numeric(14, 3),
  "difference" numeric(14, 3),
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "audit_item_lots" DROP CONSTRAINT IF EXISTS "audit_item_lots_audit_item_id_audit_items_id_fk";
ALTER TABLE "audit_item_lots"
  ADD CONSTRAINT "audit_item_lots_audit_item_id_audit_items_id_fk"
  FOREIGN KEY ("audit_item_id") REFERENCES "public"."audit_items"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "audit_item_lots" DROP CONSTRAINT IF EXISTS "audit_item_lots_lot_id_lots_id_fk";
ALTER TABLE "audit_item_lots"
  ADD CONSTRAINT "audit_item_lots_lot_id_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_audit_item_lots_audit_item" ON "audit_item_lots" ("audit_item_id");
CREATE INDEX IF NOT EXISTS "idx_audit_item_lots_lot" ON "audit_item_lots" ("lot_id");

-- ---------- PROTECCIÓN DE DATOS HISTÓRICOS ----------

CREATE OR REPLACE FUNCTION "prevent_lot_key_update"()
RETURNS trigger AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."product_id" IS DISTINCT FROM OLD."product_id"
     OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
     OR NEW."entry_item_id" IS DISTINCT FROM OLD."entry_item_id"
     OR NEW."quantity_received" IS DISTINCT FROM OLD."quantity_received"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
    RAISE EXCEPTION 'Los datos estructurales del lote son inmutables: %', OLD."code";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_lots_immutable_keys" ON "lots";
CREATE TRIGGER "trg_lots_immutable_keys"
  BEFORE UPDATE ON "lots"
  FOR EACH ROW EXECUTE FUNCTION "prevent_lot_key_update"();

CREATE OR REPLACE FUNCTION "prevent_lot_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los lotes con trazabilidad no se eliminan; use el estado CANCELLED';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_lots_no_delete" ON "lots";
CREATE TRIGGER "trg_lots_no_delete"
  BEFORE DELETE ON "lots"
  FOR EACH ROW EXECUTE FUNCTION "prevent_lot_delete"();

-- ============================================================
-- FIN DE LA MIGRACIÓN 0005
-- ============================================================
