-- ============================================================
-- 0011 — Destinos (catálogo), detalle de orden de pedido,
--        ubicaciones y resumen de movimientos de Siigo
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Migración ADITIVA e idempotente.
-- ============================================================

-- ============================================================
-- 1. Catálogo de destinos (parroquias / grupos de familia)
--    Configurable: el Banco reemplaza los datos de demostración
--    desde la interfaz, sin tocar el código.
-- ============================================================

CREATE TABLE IF NOT EXISTS "destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(30),
  "name" varchar(150) NOT NULL,
  "type" varchar(30) NOT NULL DEFAULT 'OTRO',
  "is_demo" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_destinations_name" ON "destinations" (lower("name"));
CREATE INDEX IF NOT EXISTS "idx_destinations_status" ON "destinations" ("status", "sort_order");

-- Datos de demostración: se identifican con is_demo = true para que el
-- administrador los pueda reemplazar por el catálogo oficial del Banco.
INSERT INTO "destinations" ("code", "name", "type", "is_demo", "status", "sort_order") VALUES
  ('PAR-SJ',  'Parroquia San Joaquín',          'PARROQUIA', true, 'ACTIVE', 10),
  ('PAR-SJB', 'Parroquia San Juan Bautista',    'PARROQUIA', true, 'ACTIVE', 20),
  ('PAR-CAR', 'Parroquia Nuestra Señora del Carmen', 'PARROQUIA', true, 'ACTIVE', 30),
  ('PAR-SJO', 'Parroquia San José',             'PARROQUIA', true, 'ACTIVE', 40),
  ('PAR-SAN', 'Parroquia Santa Ana',           'PARROQUIA', true, 'ACTIVE', 50),
  ('GFA-ESP', 'Grupo de Familia Esperanza',     'GRUPO_FAMILIA', true, 'ACTIVE', 60),
  ('GFA-NVI', 'Grupo de Familia Nueva Vida',    'GRUPO_FAMILIA', true, 'ACTIVE', 70),
  ('GFA-SMA', 'Grupo de Familia San Martín',    'GRUPO_FAMILIA', true, 'ACTIVE', 80),
  ('GFA-LPI', 'Grupo de Familia Los Pinos',     'GRUPO_FAMILIA', true, 'ACTIVE', 90),
  ('GFA-LPA', 'Grupo de Familia La Paz',        'GRUPO_FAMILIA', true, 'ACTIVE', 100)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Ubicaciones de Siigo (código + nombre)
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_locations" (
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "name" varchar(150) NOT NULL,
  "import_run_id" uuid REFERENCES "siigo_import_runs"("id"),
  "synced_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "siigo_locations_unique" PRIMARY KEY ("siigo_bodega_code", "location_code")
);

-- ============================================================
-- 3. Movimientos agregados del reporte «Resumen por bodega»
--    Son MOVIMIENTOS del periodo, NO existencias: la columna O del
--    reporte es (entradas − salidas) y no el saldo disponible.
-- ============================================================

CREATE TABLE IF NOT EXISTS "siigo_resumen_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "siigo_bodega_code" integer NOT NULL,
  "location_code" integer NOT NULL,
  "qty_in" numeric(14,3) NOT NULL DEFAULT 0,
  "qty2_in" numeric(14,3) NOT NULL DEFAULT 0,
  "value_in" numeric(14,2) NOT NULL DEFAULT 0,
  "qty_out" numeric(14,3) NOT NULL DEFAULT 0,
  "qty2_out" numeric(14,3) NOT NULL DEFAULT 0,
  "value_out" numeric(14,2) NOT NULL DEFAULT 0,
  "net_quantity" numeric(14,3) NOT NULL DEFAULT 0,
  "import_run_id" uuid NOT NULL REFERENCES "siigo_import_runs"("id"),
  "synced_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "siigo_resumen_unique"
    UNIQUE ("product_id", "siigo_bodega_code", "location_code")
);

CREATE INDEX IF NOT EXISTS "idx_siigo_resumen_prod" ON "siigo_resumen_movements" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_siigo_resumen_bod" ON "siigo_resumen_movements" ("siigo_bodega_code");
CREATE INDEX IF NOT EXISTS "idx_siigo_resumen_run" ON "siigo_resumen_movements" ("import_run_id");

-- ============================================================
-- 4. Bodegas: origen y código de Siigo
-- ============================================================

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "siigo_code" integer;

CREATE INDEX IF NOT EXISTS "idx_warehouses_siigo_code" ON "warehouses" ("siigo_code");

-- ============================================================
-- 5. Detalle de la orden: peso y fecha de vencimiento
-- ============================================================

ALTER TABLE "salida_items" ADD COLUMN IF NOT EXISTS "weight" numeric(14,3);
ALTER TABLE "salida_items" ADD COLUMN IF NOT EXISTS "weight_unit" varchar(20);
ALTER TABLE "salida_items" ADD COLUMN IF NOT EXISTS "expiration_date" text;

-- ============================================================
-- 6. Destino de la orden (catálogo configurable)
-- ============================================================

ALTER TABLE "salidas" ADD COLUMN IF NOT EXISTS "destination_id" uuid REFERENCES "destinations"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_salidas_destination" ON "salidas" ("destination_id");

-- ============================================================
-- 7. Consecutivo de órdenes de pedido
-- ============================================================

INSERT INTO "document_sequences" ("type", "last_number") VALUES ('OP-2026', 0)
ON CONFLICT ("type") DO NOTHING;

-- ============================================================
-- 8. Identificador del tipo de reporte importado
-- ============================================================

ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "report_format" varchar(30);
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "warehouses_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "locations_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "new_records" integer NOT NULL DEFAULT 0;
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "updated_records" integer NOT NULL DEFAULT 0;

-- Reporte resumido: las filas normalizadas (son pocas) se guardan aquí para
-- poder cerrar la corrida sin la tabla de staging del reporte detallado.
ALTER TABLE "siigo_import_runs" ADD COLUMN IF NOT EXISTS "payload" jsonb;
