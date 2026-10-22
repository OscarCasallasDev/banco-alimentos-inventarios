-- ============================================================
-- MIGRACIÓN 0004: Módulo de Entradas completo
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Añade lo que el comprobante de entrada (plantilla Siigo Pyme) necesita:
--   • Terceros que entregan los productos (NIT, sucursal, tipo, ciudad…)
--   • Catálogo de centros de costo y de unidades de medida
--   • Lotes y fechas de vencimiento por ítem
--   • Consecutivo documental atómico por tipo de entrada
--   • Datos de la línea: secuencia, descripción, NIT, bodega, ubicación,
--     valor monetario y débito/crédito
--   • Cantidades con decimales (las unidades del Banco son divisibles)
-- ============================================================

-- ---------- ENUM del tipo de tercero ----------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'third_party_type') THEN
    CREATE TYPE "public"."third_party_type" AS ENUM(
      'CLIENTE',
      'PROVEEDOR',
      'DONANTE',
      'PARROQUIA',
      'OTROS'
    );
  END IF;
END $$;

-- ---------- TERCEROS (proveedores, donantes, clientes) ----------

CREATE TABLE IF NOT EXISTS "third_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nit" varchar(50) NOT NULL,
  "branch" varchar(10) NOT NULL DEFAULT '',
  "name" varchar(255) NOT NULL,
  "type" "third_party_type" DEFAULT 'CLIENTE' NOT NULL,
  "address" text,
  "phone" varchar(50),
  "city" varchar(100),
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_third_parties_nit_branch"
  ON "third_parties" ("nit", "branch");
CREATE INDEX IF NOT EXISTS "idx_third_parties_name" ON "third_parties" ("name");
CREATE INDEX IF NOT EXISTS "idx_third_parties_type" ON "third_parties" ("type");

-- ---------- CENTROS DE COSTO ----------
-- Catálogo vacío a propósito: los valores reales los carga el Banco.

CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_cost_centers_code" ON "cost_centers" ("code");

-- ---------- UNIDADES DE MEDIDA ----------

CREATE TABLE IF NOT EXISTS "units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(20) NOT NULL,
  "name" varchar(50) NOT NULL,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_units_code" ON "units" ("code");

-- ---------- CONSECUTIVOS DOCUMENTALES ----------
-- Contador atómico por tipo de entrada: evita números duplicados cuando
-- varios usuarios registran entradas al mismo tiempo.

CREATE TABLE IF NOT EXISTS "document_sequences" (
  "type" varchar(20) PRIMARY KEY NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ---------- LOTES Y VENCIMIENTOS ----------

CREATE TABLE IF NOT EXISTS "entry_item_lots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "code" varchar(50),
  "description" varchar(100),
  "expiration_date" date,
  "quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "entry_item_lots"
  ADD CONSTRAINT "entry_item_lots_entry_item_id_entry_items_id_fk"
  FOREIGN KEY ("entry_item_id") REFERENCES "public"."entry_items"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "entry_item_lots"
  ADD CONSTRAINT "entry_item_lots_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
  ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_entry_item_lots_item" ON "entry_item_lots" ("entry_item_id");
CREATE INDEX IF NOT EXISTS "idx_entry_item_lots_product" ON "entry_item_lots" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_entry_item_lots_expiration" ON "entry_item_lots" ("expiration_date");

-- ---------- ENCABEZADO DE ENTRADA: datos del comprobante ----------

ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "third_party_id" uuid;
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "cost_center_id" uuid;
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "purchase_order" varchar(50);
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "seller_number" integer DEFAULT 1 NOT NULL;

ALTER TABLE "entries"
  ADD CONSTRAINT "entries_third_party_id_third_parties_id_fk"
  FOREIGN KEY ("third_party_id") REFERENCES "public"."third_parties"("id")
  ON DELETE no action ON UPDATE no action;

ALTER TABLE "entries"
  ADD CONSTRAINT "entries_cost_center_id_cost_centers_id_fk"
  FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id")
  ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_entries_third_party" ON "entries" ("third_party_id");

-- ---------- DETALLE DE ENTRADA: datos de la línea del comprobante ----------

ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "sequence" integer DEFAULT 1 NOT NULL;
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "nit" varchar(50);
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "cost_center_id" uuid;
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "location" varchar(50);
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "value" numeric(14, 2) DEFAULT 0 NOT NULL;
ALTER TABLE "entry_items" ADD COLUMN IF NOT EXISTS "debit_credit" numeric(14, 2) DEFAULT 0 NOT NULL;

ALTER TABLE "entry_items"
  ADD CONSTRAINT "entry_items_cost_center_id_cost_centers_id_fk"
  FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id")
  ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_entry_items_sequence" ON "entry_items" ("entry_id", "sequence");

-- ---------- CANTIDADES CON DECIMALES ----------
-- Las unidades del Banco (kg, L, g, ml) son divisibles.

ALTER TABLE "entry_items"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "inventory"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "inventory_movements"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "inventory_movements"
  ALTER COLUMN "balance_after" TYPE numeric(14, 3) USING "balance_after"::numeric;
ALTER TABLE "order_items"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "invoice_items"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "dispatch_items"
  ALTER COLUMN "quantity" TYPE numeric(14, 3) USING "quantity"::numeric;
ALTER TABLE "audit_items"
  ALTER COLUMN "system_quantity" TYPE numeric(14, 3) USING "system_quantity"::numeric;
ALTER TABLE "audit_items"
  ALTER COLUMN "physical_quantity" TYPE numeric(14, 3) USING "physical_quantity"::numeric;
ALTER TABLE "audit_items"
  ALTER COLUMN "difference" TYPE numeric(14, 3) USING "difference"::numeric;

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
