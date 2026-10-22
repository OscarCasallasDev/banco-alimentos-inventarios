-- ============================================================
-- SEED DATA — Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
-- ============================================================
-- DATOS DEMO — No utilizar información real del Banco
-- ============================================================

-- ---------- ROLES ----------

INSERT INTO roles (id, name, description, permissions) VALUES
  (gen_random_uuid(), 'SUPERADMIN', 'Administrador total del sistema', ARRAY['*']),
  (gen_random_uuid(), 'ADMIN', 'Administrador del sistema', ARRAY['products.*', 'warehouses.*', 'entries.*', 'exits.*', 'reports.*']),
  (gen_random_uuid(), 'RECEPCION', 'Encargado de recepción e ingresos', ARRAY['entries.*', 'products.read']),
  (gen_random_uuid(), 'DESPACHO', 'Encargado de despachos y salidas', ARRAY['exits.*', 'products.read']),
  (gen_random_uuid(), 'CONTABILIDAD', 'Encargado de contabilidad y auditoría', ARRAY['audits.*', 'reports.*', 'products.read']);

-- ---------- USUARIO ADMIN (DEMO) ----------
-- Usuario: admin / Contraseña: admin123 (hash SHA-256)
-- Hash: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9

INSERT INTO users (id, username, email, password_hash, first_name, last_name, role, status) VALUES
  (gen_random_uuid(), 'admin', 'admin@bancoalimentos.org', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Admin', 'Sistema', 'SUPERADMIN', 'ACTIVE');

-- ---------- CATEGORÍAS ----------

INSERT INTO categories (id, name, description) VALUES
  (gen_random_uuid(), 'Granos', 'Productos básicos de granos y cereales'),
  (gen_random_uuid(), 'Enlatados', 'Productos en conserva y enlatados'),
  (gen_random_uuid(), 'Lácteos', 'Productos lácteos y derivados'),
  (gen_random_uuid(), 'Frutas y Verduras', 'Productos frescos de frutas y verduras'),
  (gen_random_uuid(), 'Panadería', 'Productos de panadería y repostería'),
  (gen_random_uuid(), 'Bebidas', 'Bebidas y líquidos'),
  (gen_random_uuid(), 'Aseo', 'Productos de aseo y limpieza'),
  (gen_random_uuid(), 'Otros', 'Otros productos varios');

-- ---------- BODEGAS VIRTUALES ----------

INSERT INTO warehouses (id, code, name, description, type, status, observations) VALUES
  (gen_random_uuid(), '1.1', 'Productos Propios', 'Bodega principal de productos propios del Banco', 'PROPIA', 'ACTIVE', 'Bodega principal'),
  (gen_random_uuid(), '1.2', 'Productos Donados', 'Productos recibidos por donaciones', 'TERCERO', 'ACTIVE', NULL),
  (gen_random_uuid(), '2.1', 'Campaña Navideña', 'Productos para campaña navideña', 'CAMPAIGN', 'ACTIVE', NULL),
  (gen_random_uuid(), '2.2', 'Programa Escolar', 'Productos para programa escolar', 'PROGRAM', 'ACTIVE', NULL),
  (gen_random_uuid(), '3.1', 'Productos Vencidos', 'Productos próximos a vencer o vencidos', 'PROPIA', 'ACTIVE', 'Requiere revisión especial'),
  (gen_random_uuid(), '3.2', 'Productos en Cuarentena', 'Productos en revisión de calidad', 'PROPIA', 'ACTIVE', NULL),
  (gen_random_uuid(), '4.1', 'Almacén Central', 'Almacén de alto volumen', 'PROPIA', 'ACTIVE', NULL),
  (gen_random_uuid(), '4.2', 'Punto de Distribución', 'Punto de distribución secundario', 'PROPIA', 'ACTIVE', NULL);

-- ---------- PRODUCTOS DEMO ----------

INSERT INTO products (id, code, name, description, presentation, weight, unit, category_id, status, min_stock) VALUES
  (gen_random_uuid(), 'GRN-001', 'Arroz', 'Arroz blanco de primera calidad', 'Bolsa 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Granos'), 'ACTIVE', 50),
  (gen_random_uuid(), 'GRN-002', 'Frijol', 'Frijol rojo seleccionado', 'Bolsa 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Granos'), 'ACTIVE', 30),
  (gen_random_uuid(), 'GRN-003', 'Lenteja', 'Lenteja nacional', 'Bolsa 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Granos'), 'ACTIVE', 25),
  (gen_random_uuid(), 'GRN-004', 'Avena', 'Avena en hojuelas', 'Paquete 400g', 0.4, 'kg', (SELECT id FROM categories WHERE name = 'Granos'), 'ACTIVE', 20),
  (gen_random_uuid(), 'ENL-001', 'Atún', 'Atún en lata al natural', 'Lata 180g', 0.18, 'kg', (SELECT id FROM categories WHERE name = 'Enlatados'), 'ACTIVE', 40),
  (gen_random_uuid(), 'ENL-002', 'Sardinas', 'Sardinas en salsa de tomate', 'Lata 250g', 0.25, 'kg', (SELECT id FROM categories WHERE name = 'Enlatados'), 'ACTIVE', 35),
  (gen_random_uuid(), 'ENL-003', 'Frijol Enlatado', 'Frijol rojo enlatado', 'Lata 400g', 0.4, 'kg', (SELECT id FROM categories WHERE name = 'Enlatados'), 'ACTIVE', 30),
  (gen_random_uuid(), 'LAC-001', 'Leche', 'Leche entera en caja', 'Caja 1L', 1.0, 'L', (SELECT id FROM categories WHERE name = 'Lácteos'), 'ACTIVE', 60),
  (gen_random_uuid(), 'LAC-002', 'Queso', 'Queso fresco', 'Paquete 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Lácteos'), 'ACTIVE', 20),
  (gen_random_uuid(), 'LAC-003', 'Yogurt', 'Yogurt natural', 'Vaso 150g', 0.15, 'kg', (SELECT id FROM categories WHERE name = 'Lácteos'), 'ACTIVE', 25),
  (gen_random_uuid(), 'FRV-001', 'Manzana', 'Manzana roja fresca', 'Unidad', 0.2, 'kg', (SELECT id FROM categories WHERE name = 'Frutas y Verduras'), 'ACTIVE', 100),
  (gen_random_uuid(), 'FRV-002', 'Banano', 'Banano criollo', 'Unidad', 0.15, 'kg', (SELECT id FROM categories WHERE name = 'Frutas y Verduras'), 'ACTIVE', 150),
  (gen_random_uuid(), 'FRV-003', 'Papa', 'Papa criolla', 'Libra', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Frutas y Verduras'), 'ACTIVE', 80),
  (gen_random_uuid(), 'FRV-004', 'Zanahoria', 'Zanahoria fresca', 'Libra', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Frutas y Verduras'), 'ACTIVE', 40),
  (gen_random_uuid(), 'PAN-001', 'Pan', 'Pan tajado', 'Paquete 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Panadería'), 'ACTIVE', 30),
  (gen_random_uuid(), 'PAN-002', 'Galletas', 'Galletas de soda', 'Paquete 200g', 0.2, 'kg', (SELECT id FROM categories WHERE name = 'Panadería'), 'ACTIVE', 25),
  (gen_random_uuid(), 'BEB-001', 'Agua', 'Agua embotellada', 'Botella 1.5L', 1.5, 'L', (SELECT id FROM categories WHERE name = 'Bebidas'), 'ACTIVE', 100),
  (gen_random_uuid(), 'BEB-002', 'Jugo', 'Jugo de fruta natural', 'Caja 1L', 1.0, 'L', (SELECT id FROM categories WHERE name = 'Bebidas'), 'ACTIVE', 50),
  (gen_random_uuid(), 'ASE-001', 'Jabón', 'Jabón de barra', 'Unidad', 0.25, 'kg', (SELECT id FROM categories WHERE name = 'Aseo'), 'ACTIVE', 40),
  (gen_random_uuid(), 'ASE-002', 'Detergente', 'Detergente en polvo', 'Paquete 500g', 0.5, 'kg', (SELECT id FROM categories WHERE name = 'Aseo'), 'ACTIVE', 30);

-- ---------- INVENTARIO INICIAL ----------

INSERT INTO inventory (id, product_id, warehouse_id, quantity, last_movement_at)
SELECT
  gen_random_uuid(),
  p.id,
  w.id,
  CASE
    WHEN p.code = 'GRN-001' THEN 150
    WHEN p.code = 'GRN-002' THEN 80
    WHEN p.code = 'GRN-003' THEN 60
    WHEN p.code = 'GRN-004' THEN 45
    WHEN p.code = 'ENL-001' THEN 120
    WHEN p.code = 'ENL-002' THEN 90
    WHEN p.code = 'ENL-003' THEN 70
    WHEN p.code = 'LAC-001' THEN 200
    WHEN p.code = 'LAC-002' THEN 40
    WHEN p.code = 'LAC-003' THEN 55
    WHEN p.code = 'FRV-001' THEN 300
    WHEN p.code = 'FRV-002' THEN 450
    WHEN p.code = 'FRV-003' THEN 160
    WHEN p.code = 'FRV-004' THEN 80
    WHEN p.code = 'PAN-001' THEN 60
    WHEN p.code = 'PAN-002' THEN 50
    WHEN p.code = 'BEB-001' THEN 250
    WHEN p.code = 'BEB-002' THEN 100
    WHEN p.code = 'ASE-001' THEN 80
    WHEN p.code = 'ASE-002' THEN 60
    ELSE 0
  END,
  NOW() - INTERVAL '7 days'
FROM products p
CROSS JOIN warehouses w
WHERE w.code = '1.1';

-- ---------- MOVIMIENTOS INICIALES (ENTRADAS) ----------

INSERT INTO inventory_movements (id, type, product_id, warehouse_id, quantity, balance_after, document_id, document_type, user_id, notes, created_at)
SELECT
  gen_random_uuid(),
  'ENTRY',
  i.product_id,
  i.warehouse_id,
  i.quantity,
  i.quantity,
  NULL,
  'SEED',
  (SELECT id FROM users WHERE username = 'admin'),
  'Carga inicial de inventario DEMO',
  NOW() - INTERVAL '7 days'
FROM inventory i;

-- ---------- UNIDADES DE MEDIDA ----------
-- Catálogo derivado de las unidades y presentaciones que ya usa el
-- catálogo de productos (kg, L, g y "unidad" por defecto del schema).

INSERT INTO units (id, code, name, status) VALUES
  (gen_random_uuid(), 'g',  'GRAMOS',    'ACTIVE'),
  (gen_random_uuid(), 'kg', 'KILOGRAMOS','ACTIVE'),
  (gen_random_uuid(), 'L',  'LITROS',    'ACTIVE'),
  (gen_random_uuid(), 'unidad', 'UNIDADES', 'ACTIVE');

-- ---------- CENTROS DE COSTO ----------
-- El catálogo se carga con los valores reales del Banco. Se deja vacío
-- a propósito: el campo puede quedar en blanco en el comprobante.

-- ---------- TERCEROS (DATOS DEMO) ----------
-- Entidades que entregan productos. Sustituir por el registro real.

INSERT INTO third_parties (id, nit, branch, name, type, address, phone, city, status) VALUES
  (gen_random_uuid(), '222.222.222', '001', 'CANTIDAD MENORES', 'CLIENTE',
   'CR 4 ESTADIO 23 44', '2624927', 'IBAGUÉ - TOLIMA', 'ACTIVE'),
  (gen_random_uuid(), '900.123.456-7', '001', 'DONACIÓN EMPRESA LOCAL', 'DONANTE',
   'CR 5 ESTADIO 10 20', '2624927', 'IBAGUÉ - TOLIMA', 'ACTIVE'),
  (gen_random_uuid(), '811.009.111-2', '001', 'PASTORAL SOCIAL', 'PARROQUIA',
   'CR 6 ESTADIO 15 30', '5151727', 'IBAGUÉ - TOLIMA', 'ACTIVE');

-- ---------- ENTRADA DEMO ----------
-- Número con el código documental nuevo: E-001-1 (tipo E1, consecutivo 1).

INSERT INTO entries (id, format, number, date, nit, origin, document, status, user_id, notes, third_party_id, purchase_order, seller_number, created_at)
VALUES (
  gen_random_uuid(),
  'E1',
  'E-001-1',
  CURRENT_DATE - INTERVAL '7 days',
  '900.123.456-7',
  'DONACIÓN EMPRESA LOCAL',
  'FAC-2026-001',
  'CONFIRMED',
  (SELECT id FROM users WHERE username = 'admin'),
  'Entrada DEMO de arroz y frijol',
  (SELECT id FROM third_parties WHERE nit = '900.123.456-7' AND branch = '001'),
  NULL,
  1,
  NOW() - INTERVAL '7 days'
);

-- Consecutivo del tipo E1: la siguiente entrada E1 automática será E-001-2.
INSERT INTO document_sequences (type, last_number) VALUES ('E1', 1)
ON CONFLICT (type) DO UPDATE SET last_number = 1;

-- ---------- PEDIDO DEMO ----------

INSERT INTO orders (id, number, date, nit, destination, status, user_id, notes, created_at)
VALUES (
  gen_random_uuid(),
  'PED-2026-0001',
  CURRENT_DATE - INTERVAL '3 days',
  '800.987.654-3',
  'Comunidad Rural El Salado',
  'APPROVED',
  (SELECT id FROM users WHERE username = 'admin'),
  'Pedido DEMO para comunidad rural',
  NOW() - INTERVAL '3 days'
);

-- ---------- FACTURA DEMO ----------

INSERT INTO invoices (id, format, number, order_id, date, status, user_id, created_at)
VALUES (
  gen_random_uuid(),
  'SF1',
  'FAC-2026-0001',
  (SELECT id FROM orders WHERE number = 'PED-2026-0001'),
  CURRENT_DATE - INTERVAL '3 days',
  'GENERATED',
  (SELECT id FROM users WHERE username = 'admin'),
  NOW() - INTERVAL '3 days'
);

-- ---------- RECIBO DEMO ----------

INSERT INTO receipts (id, format, number, invoice_id, date, status, user_id, created_at)
VALUES (
  gen_random_uuid(),
  'R1',
  'REC-2026-0001',
  (SELECT id FROM invoices WHERE number = 'FAC-2026-0001'),
  CURRENT_DATE - INTERVAL '3 days',
  'GENERATED',
  (SELECT id FROM users WHERE username = 'admin'),
  NOW() - INTERVAL '3 days'
);

-- ---------- DESPACHO DEMO ----------

INSERT INTO dispatches (id, number, receipt_id, date, status, user_id, notes, created_at)
VALUES (
  gen_random_uuid(),
  'DES-2026-0001',
  (SELECT id FROM receipts WHERE number = 'REC-2026-0001'),
  CURRENT_DATE - INTERVAL '2 days',
  'DISPATCHED',
  (SELECT id FROM users WHERE username = 'admin'),
  'Despacho DEMO completado',
  NOW() - INTERVAL '2 days'
);

-- ---------- AUDITORÍA DEMO ----------

INSERT INTO audits (id, date, warehouse_id, responsible, status, user_id, notes, created_at)
VALUES (
  gen_random_uuid(),
  CURRENT_DATE - INTERVAL '1 day',
  (SELECT id FROM warehouses WHERE code = '1.1'),
  'Oscar Casallas',
  'COMPLETED',
  (SELECT id FROM users WHERE username = 'admin'),
  'Auditoría DEMO mensual',
  NOW() - INTERVAL '1 day'
);

-- ---------- AUDITORÍA LOG ----------

INSERT INTO audit_logs (id, user_id, action, entity, entity_id, result, details, ip_address, created_at)
VALUES
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'LOGIN', 'users', NULL, 'SUCCESS', 'Inicio de sesión DEMO', '127.0.0.1', NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'PRODUCT_CREATE', 'products', NULL, 'SUCCESS', 'Carga inicial de productos DEMO', '127.0.0.1', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'ENTRY_CREATE', 'entries', NULL, 'SUCCESS', 'Entrada DEMO registrada', '127.0.0.1', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'ORDER_CREATE', 'orders', NULL, 'SUCCESS', 'Pedido DEMO creado', '127.0.0.1', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'DISPATCH_CREATE', 'dispatches', NULL, 'SUCCESS', 'Despacho DEMO registrado', '127.0.0.1', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), (SELECT id FROM users WHERE username = 'admin'), 'AUDIT_CREATE', 'audits', NULL, 'SUCCESS', 'Auditoría DEMO completada', '127.0.0.1', NOW() - INTERVAL '1 day');

-- ============================================================
-- DETALLE DE DOCUMENTOS (trazabilidad del flujo)
-- ============================================================

INSERT INTO entry_items (id, entry_id, product_id, warehouse_id, quantity, unit, presentation, sequence, description, nit, value, debit_credit)
SELECT
  gen_random_uuid(),
  e.id,
  p.id,
  w.id,
  CASE p.code WHEN 'GRN-001' THEN 150 WHEN 'GRN-002' THEN 80 END,
  p.unit,
  p.presentation,
  CASE p.code WHEN 'GRN-001' THEN 1 ELSE 2 END,
  p.name || CASE WHEN p.presentation IS NOT NULL THEN ' ' || p.presentation ELSE '' END,
  e.nit,
  0,
  0
FROM entries e
CROSS JOIN products p
CROSS JOIN warehouses w
WHERE e.number = 'E-001-1' AND p.code IN ('GRN-001', 'GRN-002') AND w.code = '1.1';

INSERT INTO order_items (id, order_id, product_id, warehouse_id, quantity)
SELECT
  gen_random_uuid(),
  o.id,
  p.id,
  w.id,
  CASE p.code WHEN 'GRN-001' THEN 10 WHEN 'LAC-001' THEN 5 END
FROM orders o
CROSS JOIN products p
CROSS JOIN warehouses w
WHERE o.number = 'PED-2026-0001' AND p.code IN ('GRN-001', 'LAC-001') AND w.code = '1.1';

INSERT INTO invoice_items (id, invoice_id, product_id, quantity)
SELECT gen_random_uuid(), i.id, oi.product_id, oi.quantity
FROM invoices i
JOIN order_items oi ON oi.order_id = i.order_id;

INSERT INTO dispatch_items (id, dispatch_id, product_id, warehouse_id, quantity)
SELECT gen_random_uuid(), d.id, oi.product_id, oi.warehouse_id, oi.quantity
FROM dispatches d
JOIN receipts r ON r.id = d.receipt_id
JOIN invoices i ON i.id = r.invoice_id
JOIN order_items oi ON oi.order_id = i.order_id;

-- ---------- AUDITORÍA: ÍTEMS Y AJUSTE DE INVENTARIO ----------

INSERT INTO audit_items (id, audit_id, product_id, system_quantity, physical_quantity, difference, observation)
SELECT
  gen_random_uuid(),
  a.id,
  p.id,
  i.quantity,
  i.quantity - 2,
  -2,
  'Faltante de 2 unidades verificado en conteo físico'
FROM audits a
CROSS JOIN products p
JOIN inventory i ON i.product_id = p.id AND i.warehouse_id = a.warehouse_id
WHERE p.code = 'GRN-001';

-- El inventario refleja el conteo físico de la auditoría.
UPDATE inventory
SET quantity = quantity - 2, last_movement_at = NOW() - INTERVAL '1 day'
WHERE product_id = (SELECT id FROM products WHERE code = 'GRN-001')
  AND warehouse_id = (SELECT id FROM warehouses WHERE code = '1.1');

INSERT INTO inventory_movements (id, type, product_id, warehouse_id, quantity, balance_after, document_id, document_type, user_id, notes, created_at)
SELECT
  gen_random_uuid(),
  'ADJUSTMENT',
  i.product_id,
  i.warehouse_id,
  -2,
  i.quantity,
  a.id,
  'AUDIT',
  a.user_id,
  'Ajuste por auditoría física',
  NOW() - INTERVAL '1 day'
FROM audits a
JOIN inventory i ON i.product_id = (SELECT id FROM products WHERE code = 'GRN-001')
  AND i.warehouse_id = a.warehouse_id;

-- ---------- SOPORTES DOCUMENTALES ----------

INSERT INTO documents (id, type, number, related_id, generated_by, created_at)
SELECT gen_random_uuid(), 'ENTRY'::document_type, e.number, e.id, e.user_id, e.created_at FROM entries e
UNION ALL
SELECT gen_random_uuid(), 'ORDER'::document_type, o.number, o.id, o.user_id, o.created_at FROM orders o
UNION ALL
SELECT gen_random_uuid(), 'INVOICE'::document_type, i.number, i.id, i.user_id, i.created_at FROM invoices i
UNION ALL
SELECT gen_random_uuid(), 'RECEIPT'::document_type, r.number, r.id, r.user_id, r.created_at FROM receipts r
UNION ALL
SELECT gen_random_uuid(), 'DISPATCH'::document_type, d.number, d.id, d.user_id, d.created_at FROM dispatches d;

-- ============================================================
-- FIN DEL SEED
-- ============================================================