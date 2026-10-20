-- ============================================================
-- LIMPIEZA DE LOS DATOS DE PRUEBA — Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- USO: Supabase Dashboard → SQL Editor → New query → pega este archivo → Run
--
-- IMPORTANTE:
--   - Borra SOLO los registros creados por la verificación automática.
--   - Se identifican por el prefijo PRUEBA-AAAAMMDD-HHMM.
--   - Los datos reales del Banco NO se ven afectados.
--   - Cambia `run_id` por el marcador de la corrida que quieras limpiar.
-- ============================================================

BEGIN;

WITH params AS (
  SELECT 'PRUEBA-20261020-1430'::text AS run_id
),

-- Documentos de la corrida (se borran de abajo hacia arriba por las FK)
auditorias AS (
  SELECT id FROM audits, params p WHERE responsible = p.run_id || ' Verificador'
),
entradas AS (
  SELECT id FROM entries, params p WHERE origin = p.run_id || ' Origen verificacion'
),
pedidos AS (
  SELECT id FROM orders, params p WHERE destination = p.run_id || ' Destino verificacion'
),
facturas AS (
  SELECT i.id FROM invoices i JOIN pedidos pd ON pd.id = i.order_id
),
recibos AS (
  SELECT r.id FROM receipts r JOIN facturas f ON f.id = r.invoice_id
),
despachos AS (
  SELECT d.id FROM dispatches d JOIN recibos r ON r.id = d.receipt_id
),
productos AS (
  SELECT id FROM products, params p WHERE code LIKE p.run_id || '-%'
),
bodegas AS (
  SELECT id FROM warehouses, params p WHERE name = p.run_id || ' Bodega'
),
usuarios AS (
  SELECT id FROM users, params p WHERE email = lower(p.run_id) || '@bancoalimentos.org'
)

-- 1. Movimientos de inventario de estos productos
DELETE FROM inventory_movements
WHERE product_id IN (SELECT id FROM productos);

-- 2. Documentos y sus soportes
DELETE FROM documents
WHERE related_id IN (SELECT id FROM entradas)
   OR related_id IN (SELECT id FROM pedidos)
   OR related_id IN (SELECT id FROM facturas)
   OR related_id IN (SELECT id FROM recibos)
   OR related_id IN (SELECT id FROM despachos);

-- 3. Detalles de los documentos
DELETE FROM dispatch_items  WHERE dispatch_id IN (SELECT id FROM despachos);
DELETE FROM audit_items     WHERE audit_id   IN (SELECT id FROM auditorias);
DELETE FROM entry_items     WHERE entry_id   IN (SELECT id FROM entradas);
DELETE FROM order_items     WHERE order_id   IN (SELECT id FROM pedidos);
DELETE FROM invoice_items   WHERE invoice_id IN (SELECT id FROM facturas);

-- 4. Cabeceras de los documentos
DELETE FROM dispatches WHERE id IN (SELECT id FROM despachos);
DELETE FROM receipts   WHERE id IN (SELECT id FROM recibos);
DELETE FROM invoices   WHERE id IN (SELECT id FROM facturas);
DELETE FROM orders     WHERE id IN (SELECT id FROM pedidos);
DELETE FROM entries    WHERE id IN (SELECT id FROM entradas);
DELETE FROM audits     WHERE id IN (SELECT id FROM auditorias);

-- 5. Inventario y catálogo
DELETE FROM inventory
WHERE product_id IN (SELECT id FROM productos)
   OR warehouse_id IN (SELECT id FROM bodegas);

DELETE FROM products   WHERE id IN (SELECT id FROM productos);
DELETE FROM warehouses WHERE id IN (SELECT id FROM bodegas);
DELETE FROM categories WHERE name IN (SELECT p.run_id || ' Categoria' FROM params p);
DELETE FROM users      WHERE id IN (SELECT id FROM usuarios);

-- 6. Bitácora de la corrida
DELETE FROM audit_logs
WHERE created_at > now() - interval '15 minutes'
  AND (entity IN ('products', 'warehouses', 'users', 'entries', 'orders',
                  'invoices', 'receipts', 'dispatches', 'audits'));

COMMIT;

-- ============================================================
-- FIN DE LA LIMPIEZA
-- ============================================================
