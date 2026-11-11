-- ============================================================
-- 0009 — Importación Siigo Pyme + Salidas de Almacén + Reservas
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Migración ADITIVA e idempotente. No modifica ni elimina datos
-- existentes. Todo en IF NOT EXISTS para poder re-ejecutarse.
-- ============================================================

-- ---------- ENUMS nuevos ----------

DO $$ BEGIN
  CREATE TYPE "program_status" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "siigo_import_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "salida_status" AS ENUM ('DRAFT', 'GENERATED', 'DELIVERED', 'CONFIRMED_SIIGO', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "reservation_state" AS ENUM ('PENDING', 'RELEASED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "diff_status" AS ENUM ('MATCHED', 'PARTIAL', 'UNMATCHED', 'NO_CHANGE', 'REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Rol Almacenista ----------
-- Nota: PostgreSQL no permite usar un valor de enum recién agregado dentro
-- de la misma transacción. Por eso este bloque va en su propia sentencia
-- (separada por el marcador de salto de sentencia que usa db-setup) y el
-- resto del archivo se aplica después.

DO $$ BEGIN
  ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'ALMACENISTA';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'EXIT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 1. Catálogo de programas / destinos
-- ============================================================

CREATE TABLE IF NOT EXISTS "programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(30) NOT NULL UNIQUE,
  "name" varchar(150) NOT NULL,
  "description" text,
  "requires_receiver" boolean NOT NULL DEFAULT true,
  "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_programs_status" ON "programs" ("status", "sort_order");

-- ============================================================
-- 2. Mapeo bodega Siigo -> bodega de la aplicación
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_warehouse_map" (
  "siigo_bodega_code" integer PRIMARY KEY,
  "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
  "label" varchar(100),
  "is_active" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id")
);

-- ============================================================
-- 3. Corridas de importación
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_sha256" text NOT NULL,
  "file_name" text,
  "file_size" integer,
  "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
  "agent_id" text,
  "report_date" date,
  "period_from" date,
  "period_to" date,
  "generated_at" timestamp,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "stage" varchar(30),
  "total_rows" integer NOT NULL DEFAULT 0,
  "data_rows" integer NOT NULL DEFAULT 0,
  "processed_rows" integer NOT NULL DEFAULT 0,
  "skipped_rows" integer NOT NULL DEFAULT 0,
  "rejected_rows" integer NOT NULL DEFAULT 0,
  "products_count" integer NOT NULL DEFAULT 0,
  "balances_count" integer NOT NULL DEFAULT 0,
  "movements_count" integer NOT NULL DEFAULT 0,
  "groups_review" integer NOT NULL DEFAULT 0,
  "diffs_found" integer NOT NULL DEFAULT 0,
  "duration_ms" integer,
  "error_summary" jsonb,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Idempotencia: un archivo ya procesado no se vuelve a procesar.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_siigo_runs_hash_completed"
  ON "siigo_import_runs" ("file_sha256") WHERE "status" = 'COMPLETED';
CREATE INDEX IF NOT EXISTS "idx_siigo_runs_created" ON "siigo_import_runs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_siigo_runs_status" ON "siigo_import_runs" ("status");

-- ============================================================
-- 4. Lotes de filas (staging por corrida)
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id") ON DELETE CASCADE,
  "batch_index" integer NOT NULL,
  "row_count" integer NOT NULL DEFAULT 0,
  "payload_hash" text,
  "received_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "siigo_import_batches_unique" UNIQUE ("run_id", "batch_index")
);

-- ============================================================
-- 5. Staging de filas normalizadas
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_import_rows" (
  "id" bigserial PRIMARY KEY,
  "run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "product_code" text NOT NULL,
  "lin" integer,
  "grup" integer,
  "elemet" integer,
  "product_name" text,
  "reference_text" text,
  "brand_text" text,
  "unit_code" text,
  "description_text" text,
  "document_raw" text,
  "doc_type" varchar(10),
  "doc_number" text,
  "doc_sequence" text,
  "movement_date" date,
  "is_opening" boolean NOT NULL DEFAULT false,
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "qty_before" numeric(14,3),
  "qty_in" numeric(14,3),
  "qty_out" numeric(14,3),
  "qty_net" numeric(14,3),
  "qty_accum" numeric(14,3),
  "value_movement" numeric(14,2),
  "qty2_in" numeric(14,3),
  "qty2_out" numeric(14,3),
  "qty2_balance" numeric(14,3),
  "row_hash" text,
  CONSTRAINT "siigo_import_rows_unique" UNIQUE ("run_id", "row_number")
);

CREATE INDEX IF NOT EXISTS "idx_siigo_rows_group"
  ON "siigo_import_rows" ("run_id", "product_code", "siigo_bodega_code", "location_code");
CREATE INDEX IF NOT EXISTS "idx_siigo_rows_date" ON "siigo_import_rows" ("run_id", "movement_date");

-- ============================================================
-- 6. Rechazos por fila
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_import_rejections" (
  "id" bigserial PRIMARY KEY,
  "run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "reason_code" varchar(40) NOT NULL,
  "reason" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_siigo_rej_run" ON "siigo_import_rejections" ("run_id");

-- ============================================================
-- 7. Movimientos Siigo (idempotentes por clave natural)
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "movement_date" date NOT NULL,
  "is_opening" boolean NOT NULL DEFAULT false,
  "document_raw" text NOT NULL,
  "doc_type" varchar(10),
  "doc_number" text,
  "doc_sequence" text,
  "description_text" text,
  "qty_in" numeric(14,3) NOT NULL DEFAULT 0,
  "qty_out" numeric(14,3) NOT NULL DEFAULT 0,
  "qty_net" numeric(14,3) NOT NULL DEFAULT 0,
  "balance_after" numeric(14,3),
  "value_movement" numeric(14,2),
  "content_hash" text,
  "import_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "siigo_movements_unique"
    UNIQUE ("product_id", "siigo_bodega_code", "location_code", "movement_date", "document_raw")
);

CREATE INDEX IF NOT EXISTS "idx_siigo_mov_prod_date" ON "siigo_movements" ("product_id", "movement_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_siigo_mov_doc" ON "siigo_movements" ("doc_number");
CREATE INDEX IF NOT EXISTS "idx_siigo_mov_run" ON "siigo_movements" ("import_run_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_mov_bodega" ON "siigo_movements" ("siigo_bodega_code", "movement_date");

-- ============================================================
-- 8. Saldos por producto / bodega Siigo / ubicación
--    FUENTE DE EXISTENCIAS de la aplicación.
--    Solo la importación escribe aquí; el módulo de salidas NUNCA.
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "reported_quantity" numeric(14,3),
  "qty_secondary" numeric(14,3),
  "opening_quantity" numeric(14,3),
  "review_required" boolean NOT NULL DEFAULT false,
  "review_note" text,
  "is_negative" boolean NOT NULL DEFAULT false,
  "import_run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id"),
  "synced_at" timestamp NOT NULL DEFAULT now(),
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "siigo_balances_unique"
    UNIQUE ("product_id", "siigo_bodega_code", "location_code")
);

CREATE INDEX IF NOT EXISTS "idx_siigo_bal_prod" ON "siigo_balances" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_bal_wh" ON "siigo_balances" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_bal_bod" ON "siigo_balances" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "idx_siigo_bal_run" ON "siigo_balances" ("import_run_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_bal_active" ON "siigo_balances" ("is_active", "product_id");

-- ============================================================
-- 9. Diferencias de saldo detectadas en la importación
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_balance_diffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "import_run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "siigo_bodega_code" integer NOT NULL,
  "previous_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "new_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "delta" numeric(14,3) NOT NULL DEFAULT 0,
  "reserved_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "matched_salida_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'NO_CHANGE',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_run" ON "siigo_balance_diffs" ("import_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_prod" ON "siigo_balance_diffs" ("product_id");

-- ============================================================
-- 10. Salidas de almacén (operativas, no contables)
-- ============================================================

CREATE TABLE IF NOT EXISTS "salidas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "number" varchar(50) NOT NULL UNIQUE,
  "date" text NOT NULL,
  "time" text NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "programs"("id"),
  "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
  "siigo_bodega_code" integer,
  "location_code" integer,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "receiver_name" text,
  "receiver_document" text,
  "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
  "notes" text,
  "total_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "total_weight_kg" numeric(14,3),
  "weight_partial" boolean NOT NULL DEFAULT false,
  "item_count" integer NOT NULL DEFAULT 0,
  "document_generated_at" timestamp,
  "delivered_at" timestamp,
  "confirmed_at" timestamp,
  "cancelled_at" timestamp,
  "siigo_document_ref" text,
  "reconciliation_status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "reconciliation_note" text,
  "reconciled_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_salidas_status" ON "salidas" ("status", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_salidas_user" ON "salidas" ("user_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_salidas_program" ON "salidas" ("program_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_salidas_recon" ON "salidas" ("reconciliation_status");

CREATE TABLE IF NOT EXISTS "salida_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "salida_id" uuid NOT NULL REFERENCES "salidas"("id") ON DELETE CASCADE,
  "line_no" integer NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "quantity" numeric(14,3) NOT NULL CHECK ("quantity" > 0),
  "unit_code" text,
  "presentation" text,
  "product_name" text,
  "product_reference" text,
  "unit_weight_kg" numeric(14,3),
  "total_weight_kg" numeric(14,3),
  "weight_known" boolean NOT NULL DEFAULT false,
  "available_at_creation" numeric(14,3) NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "salida_items_unique"
    UNIQUE ("salida_id", "product_id", "siigo_bodega_code", "location_code")
);

CREATE INDEX IF NOT EXISTS "idx_salida_items_salida" ON "salida_items" ("salida_id", "line_no");
CREATE INDEX IF NOT EXISTS "idx_salida_items_prod" ON "salida_items" ("product_id");

-- ============================================================
-- 11. Reservas: cantidades comprometidas en documentos operativos
--     Son las que la app resta del saldo INFORMADO por Siigo.
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "salida_id" uuid NOT NULL REFERENCES "salidas"("id") ON DELETE CASCADE,
  "salida_item_id" uuid NOT NULL REFERENCES "salida_items"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "quantity" numeric(14,3) NOT NULL CHECK ("quantity" > 0),
  "reserved_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "released_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "state" varchar(20) NOT NULL DEFAULT 'PENDING',
  "released_at" timestamp,
  "released_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "siigo_reservations_unique" UNIQUE ("salida_item_id")
);

CREATE INDEX IF NOT EXISTS "idx_siigo_res_state"
  ON "siigo_reservations" ("state", "product_id", "siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "idx_siigo_res_salida" ON "siigo_reservations" ("salida_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_res_prod"
  ON "siigo_reservations" ("product_id", "siigo_bodega_code", "state");

-- ============================================================
-- 12. Claves API para el agente local de sincronización
-- ============================================================

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key_hash" text NOT NULL UNIQUE,
  "label" varchar(80) NOT NULL,
  "scope" varchar(40) NOT NULL DEFAULT 'SIIGO_IMPORT',
  "is_active" boolean NOT NULL DEFAULT true,
  "last_used_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. Columnas adicionales en products (origen Siigo)
-- ============================================================

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_reference" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_brand" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_lin" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_grup" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_elemet" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_source" varchar(20);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "siigo_bodega_code" integer;

CREATE INDEX IF NOT EXISTS "idx_products_source" ON "products" ("source");
CREATE INDEX IF NOT EXISTS "idx_products_siigo_ref" ON "products" ("siigo_reference");

-- Búsqueda rápida sobre el catálogo importado (4.862+ productos).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pg_trgm no disponible: la búsqueda seguirá funcionando con ILIKE';
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_name_trgm" ON "products" USING gin (lower("name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_code_trgm" ON "products" USING gin (lower("code") gin_trgm_ops);

-- ============================================================
-- 14. Matriz de permisos por rol (la tabla `roles` ya existía)
-- ============================================================

INSERT INTO "roles" ("name", "description", "permissions") VALUES
  ('ALMACENISTA', 'Almacenista — prepara y genera salidas de almacen',
   ARRAY['inventory.read','salidas.read','salidas.create','salidas.edit','salidas.generate','salidas.view_document','salidas.cancel']),
  ('DESPACHO', 'Despacho — recibe salidas y continua el proceso en Siigo',
   ARRAY['inventory.read','salidas.read','salidas.view_document','salidas.receive','salidas.confirm_siigo','siigo.import.read'])
ON CONFLICT ("name") DO UPDATE
  SET "permissions" = EXCLUDED."permissions",
      "description" = EXCLUDED."description";
--> statement-breakpoint
UPDATE "roles" SET "permissions" = ARRAY[
  'inventory.read','salidas.read','salidas.create','salidas.edit','salidas.generate',
  'salidas.view_document','salidas.cancel','salidas.receive','salidas.confirm_siigo',
  'siigo.import.run','siigo.import.read','siigo.map_warehouses','programs.manage',
  'users.manage','settings.manage','modules.toggle'
] WHERE "name" IN ('SUPERADMIN','ADMIN');
--> statement-breakpoint
INSERT INTO "roles" ("name", "description", "permissions") VALUES
  ('RECEPCION', 'Recepcion — captura de entradas (modulo en espera)', ARRAY['inventory.read'])
ON CONFLICT ("name") DO UPDATE
  SET "description" = EXCLUDED."description",
      "permissions" = EXCLUDED."permissions";
--> statement-breakpoint
INSERT INTO "roles" ("name", "description", "permissions") VALUES
  ('CONTABILIDAD', 'Contabilidad — Revision administrativa (modulo en espera)', ARRAY['inventory.read','siigo.import.read'])
ON CONFLICT ("name") DO UPDATE
  SET "description" = EXCLUDED."description",
      "permissions" = EXCLUDED."permissions";
--> statement-breakpoint

-- ============================================================
-- 15. Consecutivo documental de salidas
-- ============================================================

INSERT INTO "document_sequences" ("type", "last_number") VALUES ('SAL-2026', 0)
ON CONFLICT ("type") DO NOTHING;
