# Modelo de Datos

## Sistema de Gestión de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## Diagrama de Relaciones

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   users     │     │   roles     │     │ categories  │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │
│ username    │     │ name        │     │ name        │
│ password_hash│    │ description │     │ description │
│ first_name  │     │ permissions │     └─────────────┘
│ last_name   │     └─────────────┘            │
│ role (FK)   │                                │
│ status      │     ┌─────────────┐            │
│ last_login  │     │  products   │◄───────────┘
└─────────────┘     ├─────────────┤
       │            │ id (PK)     │
       │            │ code        │
       │            │ name        │
       │            │ description │
       │            │ presentation│
       │            │ weight      │
       │            │ unit        │
       │            │ category_id │
       │            │ status      │
       │            │ min_stock   │
       │            └─────────────┘
       │                   │
       │                   │
       │            ┌─────────────┐
       │            │  inventory  │
       │            ├─────────────┤
       │            │ id (PK)     │
       │            │ product_id  │
       │            │ warehouse_id│
       │            │ quantity    │
       │            │ last_movement│
       │            └─────────────┘
       │                   │
       │                   │
       │            ┌─────────────┐
       │            │  warehouses │
       │            ├─────────────┤
       │            │ id (PK)     │
       │            │ code        │
       │            │ name        │
       │            │ description │
       │            │ type        │
       │            │ status      │
       │            │ observations│
       │            └─────────────┘
       │
       │            ┌─────────────────────┐
       │            │ inventory_movements │
       │            ├─────────────────────┤
       │            │ id (PK)             │
       │            │ type                │
       │            │ product_id          │
       │            │ warehouse_id        │
       │            │ quantity            │
       │            │ balance_after       │
       │            │ document_id         │
       │            │ document_type       │
       │            │ user_id             │
       │            │ notes               │
       │            └─────────────────────┘
       │
       │            ┌─────────────┐     ┌─────────────┐
       │            │   entries   │     │  entry_items│
       │            ├─────────────┤     ├─────────────┤
       │            │ id (PK)     │◄────│ entry_id    │
       │            │ format      │     │ product_id  │
       │            │ number      │     │ warehouse_id│
       │            │ date        │     │ quantity    │
       │            │ nit         │     │ unit        │
       │            │ origin      │     │ presentation│
       │            │ document    │     └─────────────┘
       │            │ status      │
       │            │ user_id     │
       │            │ notes       │
       │            └─────────────┘
       │
       │            ┌─────────────┐     ┌─────────────┐
       │            │   orders    │     │ order_items │
       │            ├─────────────┤     ├─────────────┤
       │            │ id (PK)     │◄────│ order_id    │
       │            │ number      │     │ product_id  │
       │            │ date        │     │ warehouse_id│
       │            │ nit         │     │ quantity    │
       │            │ destination │     └─────────────┘
       │            │ status      │
       │            │ user_id     │
       │            │ notes       │
       │            └─────────────┘
       │                   │
       │                   │
       │            ┌─────────────┐     ┌─────────────┐
       │            │  invoices   │     │invoice_items│
       │            ├─────────────┤     ├─────────────┤
       │            │ id (PK)     │◄────│ invoice_id  │
       │            │ format      │     │ product_id  │
       │            │ number      │     │ quantity    │
       │            │ order_id    │     └─────────────┘
       │            │ date        │
       │            │ status      │
       │            │ user_id     │
       │            └─────────────┘
       │                   │
       │                   │
       │            ┌─────────────┐
       │            │  receipts   │
       │            ├─────────────┤
       │            │ id (PK)     │
       │            │ format      │
       │            │ number      │
       │            │ invoice_id  │
       │            │ date        │
       │            │ status      │
       │            │ user_id     │
       │            └─────────────┘
       │                   │
       │                   │
       │            ┌─────────────┐     ┌─────────────┐
       │            │ dispatches  │     │dispatch_items
       │            ├─────────────┤     ├─────────────┤
       │            │ id (PK)     │◄────│ dispatch_id │
       │            │ number      │     │ product_id  │
       │            │ receipt_id  │     │ warehouse_id│
       │            │ date        │     │ quantity    │
       │            │ status      │     └─────────────┘
       │            │ user_id     │
       │            │ notes       │
       │            └─────────────┘
       │
       │            ┌─────────────┐     ┌─────────────┐
       │            │   audits    │     │ audit_items │
       │            ├─────────────┤     ├─────────────┤
       │            │ id (PK)     │◄────│ audit_id    │
       │            │ date        │     │ product_id  │
       │            │ warehouse_id│     │ system_qty  │
       │            │ responsible │     │ physical_qty│
       │            │ status      │     │ difference  │
       │            │ user_id     │     │ observation │
       │            │ notes       │     └─────────────┘
       │            └─────────────┘
       │
       │            ┌─────────────┐
       │            │ audit_logs  │
       │            ├─────────────┤
       │            │ id (PK)     │
       │            │ user_id     │
       │            │ action      │
       │            │ entity      │
       │            │ entity_id   │
       │            │ result      │
       │            │ details     │
       │            │ ip_address  │
       │            └─────────────┘
       │
       │            ┌─────────────┐
       │            │  documents  │
       │            ├─────────────┤
       │            │ id (PK)     │
       │            │ type        │
       │            │ number      │
       │            │ related_id  │
       │            │ generated_by│
       │            └─────────────┘
```

---

## Tablas

### users
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Identificador único |
| username | VARCHAR(100) | Nombre de usuario (único) |
| password_hash | TEXT | Hash de contraseña |
| first_name | VARCHAR(100) | Nombre |
| last_name | VARCHAR(100) | Apellido |
| role | ENUM | Rol del usuario |
| status | ENUM | Estado del usuario |
| last_login_at | TIMESTAMP | Último inicio de sesión |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### products
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Identificador único |
| code | VARCHAR(50) | Código del producto (único) |
| name | VARCHAR(255) | Nombre del producto |
| description | TEXT | Descripción |
| presentation | VARCHAR(100) | Presentación |
| weight | DECIMAL(10,2) | Peso |
| unit | VARCHAR(20) | Unidad de medida |
| category_id | UUID | Categoría (FK) |
| status | ENUM | Estado del producto |
| min_stock | INTEGER | Stock mínimo |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### warehouses
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Identificador único |
| code | VARCHAR(20) | Código de bodega (único) |
| name | VARCHAR(255) | Nombre de bodega |
| description | TEXT | Descripción |
| type | ENUM | Tipo de bodega |
| status | ENUM | Estado de bodega |
| observations | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### inventory
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Identificador único |
| product_id | UUID | Producto (FK) |
| warehouse_id | UUID | Bodega (FK) |
| quantity | INTEGER | Cantidad en stock |
| last_movement_at | TIMESTAMP | Último movimiento |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### inventory_movements
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Identificador único |
| type | ENUM | Tipo de movimiento |
| product_id | UUID | Producto (FK) |
| warehouse_id | UUID | Bodega (FK) |
| quantity | INTEGER | Cantidad |
| balance_after | INTEGER | Saldo después del movimiento |
| document_id | UUID | Documento relacionado |
| document_type | VARCHAR(50) | Tipo de documento |
| user_id | UUID | Usuario (FK) |
| notes | TEXT | Notas |
| created_at | TIMESTAMP | Fecha de creación |

---

## Enums

### user_role
- SUPERADMIN
- ADMIN
- RECEPCION
- DESPACHO
- CONTABILIDAD

### user_status
- ACTIVE
- INACTIVE
- SUSPENDED

### product_status
- ACTIVE
- INACTIVE
- DISCONTINUED

### warehouse_type
- PROPIA
- TERCERO
- CAMPAIGN
- PROGRAM

### warehouse_status
- ACTIVE
- INACTIVE

### movement_type
- ENTRY
- EXIT
- ADJUSTMENT
- AUDIT

### entry_format
- E1
- E3
- N3
- N5

### entry_status
- DRAFT
- CONFIRMED
- CANCELLED

### order_status
- DRAFT
- APPROVED
- INVOICED
- DISPATCHED
- CANCELLED

### invoice_format
- SF1
- F2

### invoice_status
- DRAFT
- GENERATED
- ASSOCIATED_TO_RECEIPT
- CANCELLED

### receipt_format
- R1
- R2
- R3
- R4

### receipt_status
- DRAFT
- GENERATED
- CANCELLED

### dispatch_status
- PENDING
- PREPARED
- DISPATCHED
- CANCELLED

### audit_status
- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

### document_type
- ENTRY
- ORDER
- INVOICE
- RECEIPT
- DISPATCH

---

## Índices

| Tabla | Índice | Columnas |
|-------|--------|----------|
| users | idx_users_username | username |
| users | idx_users_role | role |
| users | idx_users_status | status |
| products | idx_products_code | code |
| products | idx_products_category | category_id |
| products | idx_products_status | status |
| warehouses | idx_warehouses_code | code |
| warehouses | idx_warehouses_status | status |
| inventory | idx_inventory_product_warehouse | product_id, warehouse_id (UNIQUE) |
| inventory | idx_inventory_product | product_id |
| inventory | idx_inventory_warehouse | warehouse_id |
| inventory_movements | idx_movements_product | product_id |
| inventory_movements | idx_movements_warehouse | warehouse_id |
| inventory_movements | idx_movements_user | user_id |
| inventory_movements | idx_movements_created | created_at |
| inventory_movements | idx_movements_type | type |
| entries | idx_entries_date | date |
| entries | idx_entries_status | status |
| entries | idx_entries_user | user_id |
| entry_items | idx_entry_items_entry | entry_id |
| entry_items | idx_entry_items_product | product_id |
| orders | idx_orders_date | date |
| orders | idx_orders_status | status |
| orders | idx_orders_user | user_id |
| order_items | idx_order_items_order | order_id |
| order_items | idx_order_items_product | product_id |
| invoices | idx_invoices_date | date |
| invoices | idx_invoices_status | status |
| invoices | idx_invoices_order | order_id |
| invoice_items | idx_invoice_items_invoice | invoice_id |
| invoice_items | idx_invoice_items_product | product_id |
| receipts | idx_receipts_date | date |
| receipts | idx_receipts_status | status |
| receipts | idx_receipts_invoice | invoice_id |
| dispatches | idx_dispatches_date | date |
| dispatches | idx_dispatches_status | status |
| dispatches | idx_dispatches_receipt | receipt_id |
| dispatch_items | idx_dispatch_items_dispatch | dispatch_id |
| dispatch_items | idx_dispatch_items_product | product_id |
| audits | idx_audits_date | date |
| audits | idx_audits_status | status |
| audits | idx_audits_warehouse | warehouse_id |
| audit_items | idx_audit_items_audit | audit_id |
| audit_items | idx_audit_items_product | product_id |
| audit_logs | idx_logs_user | user_id |
| audit_logs | idx_logs_created | created_at |
| audit_logs | idx_logs_action | action |
| documents | idx_documents_type | type |
| documents | idx_documents_related | related_id |

---

## Reglas de Negocio

1. No cantidades negativas en entradas
2. No cantidades cero
3. No salidas superiores a existencia disponible
4. No eliminar productos con historial (soft delete)
5. No modificar movimientos históricos directamente
6. Toda entrada afecta inventario
7. Toda salida confirmada disminuye inventario
8. Toda operación tiene usuario y fecha
9. Toda salida asociada a su flujo documental
10. Información histórica siempre trazable

---

*Última actualización: FASE 2 — Base de datos*
