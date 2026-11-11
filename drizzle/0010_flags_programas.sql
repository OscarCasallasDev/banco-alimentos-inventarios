-- ============================================================
-- 0010 — Feature flags (módulos habilitados) y catálogo de programas
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Migración ADITIVA e idempotente.
-- ============================================================

-- ============================================================
-- 1. Banderas de módulo (activación reversible)
-- ============================================================

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" varchar(80) PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "description" text NOT NULL DEFAULT '',
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id")
);

-- Módulos activos en la etapa actual (comunicación almacenista <-> despacho).
INSERT INTO "feature_flags" ("key", "enabled", "description") VALUES
  ('dashboard.enabled',           true,  'Tablero operativo reorientado a la nueva prioridad'),
  ('inventory.enabled',           true,  'Inventario basado en existencias importadas de Siigo'),
  ('warehouses.enabled',          true,  'Bodegas y ubicaciones con mapeo desde Siigo Pyme'),
  ('salidas_almacen.enabled',     true,  'Salidas de almacen: preparacion, documento y entrega'),
  ('programs.enabled',            true,  'Catalogo de programas / destinos configurables'),
  ('siigo_import.enabled',        true,  'Importacion de reportes de inventario desde Siigo Pyme'),
  ('users.enabled',               true,  'Gestion de usuarios y roles'),
  ('settings.enabled',            true,  'Configuracion del sistema'),
  ('products.enabled',            false, 'Catalogo de productos (en espera: el maestro es Siigo)'),
  ('lots.enabled',                false, 'Gestion avanzada de lotes (en espera)'),
  ('movements.enabled',           false, 'Libro de movimientos operativo (en espera)'),
  ('entries.enabled',             false, 'Entradas de almacen (en espera)'),
  ('salidas_legacy.enabled',      false, 'Flujo contable Recibo -> Despacho con lotes (en espera)'),
  ('orders.enabled',              false, 'Ordenes de pedido (en espera)'),
  ('invoices.enabled',            false, 'Facturas de venta (en espera)'),
  ('receipts.enabled',            false, 'Recibos de caja (en espera)'),
  ('audits.enabled',              false, 'Auditoria avanzada (en espera)'),
  ('reports.enabled',             false, 'Reportes consolidados (en espera)')
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- 2. Ajustes del sistema para esta etapa
-- ============================================================

INSERT INTO "system_settings" ("key", "value", "description") VALUES
  ('sync_stale_minutes', '60', 'Minutos sin sincronizacion exitosa para marcar el inventario como desactualizado'),
  ('siigo_reserve_pending', 'true', 'Si las salidas pendientes reservan existencias informadas por Siigo')
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- 3. Catalogo base de programas / destinos
--    El Banco puede editar, agregar o desactivar cada uno.
-- ============================================================

INSERT INTO "programs" ("code", "name", "description", "requires_receiver", "status", "sort_order") VALUES
  ('GF', 'Grupos de Familia',        'Entrega de productos a grupos de familia',              true, 'ACTIVE', 10),
  ('PP', 'Plan Padrino',              'Entrega de productos del programa Plan Padrino',        true, 'ACTIVE', 20),
  ('CI', 'Consumo Interno',           'Consumo interno de la institucion',                    false,'ACTIVE', 30),
  ('DS', 'Desayunos Saludables',      'Entrega de desayunos saludables',                      true, 'ACTIVE', 40)
ON CONFLICT ("code") DO NOTHING;
