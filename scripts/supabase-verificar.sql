-- ============================================================
-- VERIFICACIÓN DE DATOS — Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- USO: Supabase Dashboard → SQL Editor → New query → pega este archivo → Run
--
-- Muestra TODO lo que creó la última verificación automática, agrupado
-- por módulo. Cambia el valor de `run_id` por el que aparece en pantalla
-- al ejecutar `npm run verify` (por ejemplo: PRUEBA-20261020-1430).
-- ============================================================

WITH params AS (
  SELECT 'PRUEBA-20261020-1430'::text AS run_id
),

-- ---------- 1. Resumen por módulo ----------
modulos AS (
  SELECT 'usuarios' AS modulo,
         (SELECT count(*) FROM users u, params p
           WHERE u.email = lower(p.run_id) || '@bancoalimentos.org') AS filas,
         (SELECT string_agg(u.username || ' (' || u.role || ')', ', ')
            FROM users u, params p
           WHERE u.email = lower(p.run_id) || '@bancoalimentos.org') AS detalle
  UNION ALL
  SELECT 'categorías',
         (SELECT count(*) FROM categories c, params p WHERE c.name = p.run_id || ' Categoria'),
         (SELECT string_agg(c.name, ', ') FROM categories c, params p WHERE c.name = p.run_id || ' Categoria')
  UNION ALL
  SELECT 'bodegas',
         (SELECT count(*) FROM warehouses w, params p WHERE w.name = p.run_id || ' Bodega'),
         (SELECT string_agg(w.code || ' — ' || w.name, ', ') FROM warehouses w, params p WHERE w.name = p.run_id || ' Bodega')
  UNION ALL
  SELECT 'productos',
         (SELECT count(*) FROM products pr, params p WHERE pr.code LIKE p.run_id || '-%'),
         (SELECT string_agg(pr.code || ' · ' || pr.name, ', ') FROM products pr, params p WHERE pr.code LIKE p.run_id || '-%')
  UNION ALL
  SELECT 'entradas',
         (SELECT count(*) FROM entries e, params p WHERE e.origin = p.run_id || ' Origen verificacion'),
         (SELECT string_agg(e.number || ' (' || e.format || ' · ' || e.status || ')', ', ')
            FROM entries e, params p WHERE e.origin = p.run_id || ' Origen verificacion')
  UNION ALL
  SELECT 'pedidos',
         (SELECT count(*) FROM orders o, params p WHERE o.destination = p.run_id || ' Destino verificacion'),
         (SELECT string_agg(o.number || ' (' || o.status || ')', ', ')
            FROM orders o, params p WHERE o.destination = p.run_id || ' Destino verificacion')
  UNION ALL
  SELECT 'facturas',
         (SELECT count(*) FROM invoices i JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion'),
         (SELECT string_agg(i.number || ' (' || i.format || ' · ' || i.status || ')', ', ')
            FROM invoices i JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion')
  UNION ALL
  SELECT 'recibos',
         (SELECT count(*) FROM receipts r JOIN invoices i ON i.id = r.invoice_id
            JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion'),
         (SELECT string_agg(r.number || ' (' || r.format || ' · ' || r.status || ')', ', ')
            FROM receipts r JOIN invoices i ON i.id = r.invoice_id
            JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion')
  UNION ALL
  SELECT 'despachos',
         (SELECT count(*) FROM dispatches d JOIN receipts r ON r.id = d.receipt_id
            JOIN invoices i ON i.id = r.invoice_id JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion'),
         (SELECT string_agg(d.number || ' (' || d.status || ')', ', ')
            FROM dispatches d JOIN receipts r ON r.id = d.receipt_id
            JOIN invoices i ON i.id = r.invoice_id JOIN orders o ON o.id = i.order_id, params p
           WHERE o.destination = p.run_id || ' Destino verificacion')
  UNION ALL
  SELECT 'auditorías',
         (SELECT count(*) FROM audits a, params p WHERE a.responsible = p.run_id || ' Verificador'),
         (SELECT string_agg(a.responsible || ' (' || a.status || ')', ', ')
            FROM audits a, params p WHERE a.responsible = p.run_id || ' Verificador')
)

SELECT
  modulo,
  filas,
  COALESCE(detalle, '—') AS detalle
FROM modulos
ORDER BY modulo;

-- ============================================================
-- 2. Detalle del inventario y sus movimientos
-- ============================================================

WITH params AS (
  SELECT 'PRUEBA-20261020-1430'::text AS run_id
)
SELECT
  pr.code        AS producto,
  w.code         AS bodega,
  i.quantity     AS existencia,
  COALESCE(
    (SELECT string_agg(m.type || ' ' || CASE WHEN m.quantity > 0 THEN '+' ELSE '' END || m.quantity,
                       ' | ' ORDER BY m.created_at)
       FROM inventory_movements m
      WHERE m.product_id = i.product_id AND m.warehouse_id = i.warehouse_id),
    'sin movimientos'
  ) AS movimientos
FROM inventory i
JOIN products pr ON pr.id = i.product_id
JOIN warehouses w ON w.id = i.warehouse_id
CROSS JOIN params p
WHERE pr.code LIKE p.run_id || '-%'
ORDER BY pr.code;

-- ============================================================
-- 3. Conciliación de la auditoría
-- ============================================================

WITH params AS (
  SELECT 'PRUEBA-20261020-1430'::text AS run_id
)
SELECT
  pr.code            AS producto,
  ai.system_quantity AS sistema,
  ai.physical_quantity AS fisico,
  ai.difference      AS diferencia,
  a.responsible      AS responsable,
  a.status           AS estado
FROM audit_items ai
JOIN audits a ON a.id = ai.audit_id
JOIN products pr ON pr.id = ai.product_id
CROSS JOIN params p
WHERE a.responsible = p.run_id || ' Verificador';

-- ============================================================
-- 4. Bitácora del sistema (auditoría de operaciones)
-- ============================================================

WITH params AS (
  SELECT 'PRUEBA-20261020-1430'::text AS run_id
)
SELECT
  al.action  AS accion,
  al.entity  AS entidad,
  al.result  AS resultado,
  al.details AS detalle,
  al.created_at AS fecha
FROM audit_logs al
CROSS JOIN params p
WHERE al.created_at > now() - interval '15 minutes'
  AND al.details IS DISTINCT FROM 'Prueba automatica ' || p.run_id
ORDER BY al.created_at DESC
LIMIT 25;

-- ============================================================
-- FIN DEL INFORME
-- ============================================================
