# Modelo de Datos

## Sistema de Gestión de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. DIAGRAMA ENTIDAD-RELACIÓN

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  users   │     │   products   │     │ categories  │
├──────────┤     ├──────────────┤     ├─────────────┤
│ id (PK)  │     │ id (PK)      │     │ id (PK)     │
│ email    │     │ code         │     │ name        │
│ password │     │ name         │     │ description │
│ role     │     │ description  │     └─────────────┘
│ status   │     │ presentation │            │
└──────────┘     │ weight       │            │
     │           │ unit         │            │
     │           │ categoryId(FK)────────────┘
     │           │ status       │
     │           │ minStock     │
     │           └──────────────┘
     │                  │
     │                  │
     │           ┌──────────────┐     ┌─────────────┐
     │           │  inventory   │     │ warehouses  │
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │     │ id (PK)     │
     │           │ productId(FK)│────│ code        │
     │           │ warehouseId(FK)───│ name        │
     │           │ quantity     │     │ type        │
     │           └──────────────┘     │ status      │
     │                  │             └─────────────┘
     │                  │
     │           ┌──────────────────┐
     │           │inventory_movements│
     │           ├──────────────────┤
     │           │ id (PK)          │
     │           │ type             │
     │           │ productId (FK)   │
     │           │ warehouseId (FK) │
     │           │ quantity         │
     │           │ balanceAfter     │
     │           │ documentId       │
     │           │ userId (FK)      │
     │           └──────────────────┘
     │
     │           ┌──────────────┐     ┌─────────────┐
     │           │   entries    │     │ entry_items │
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │◄────│ entryId(FK) │
     │           │ format       │     │ productId   │
     │           │ number       │     │ warehouseId │
     │           │ date         │     │ quantity    │
     │           │ nit          │     └─────────────┘
     │           │ status       │
     │           │ userId (FK)  │
     │           └──────────────┘
     │
     │           ┌──────────────┐     ┌─────────────┐
     │           │   orders     │     │ order_items │
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │◄────│ orderId(FK) │
     │           │ number       │     │ productId   │
     │           │ date         │     │ warehouseId │
     │           │ nit          │     │ quantity    │
     │           │ status       │     └─────────────┘
     │           │ userId (FK)  │
     │           └──────────────┘
     │                  │
     │                  ▼
     │           ┌──────────────┐     ┌─────────────┐
     │           │  invoices    │     │invoice_items│
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │◄────│ invoiceId   │
     │           │ format       │     │ productId   │
     │           │ number       │     │ quantity    │
     │           │ orderId (FK) │     └─────────────┘
     │           │ status       │
     │           │ userId (FK)  │
     │           └──────────────┘
     │                  │
     │                  ▼
     │           ┌──────────────┐
     │           │  receipts    │
     │           ├──────────────┤
     │           │ id (PK)      │
     │           │ format       │
     │           │ number       │
     │           │ invoiceId(FK)│
     │           │ status       │
     │           │ userId (FK)  │
     │           └──────────────┘
     │                  │
     │                  ▼
     │           ┌──────────────┐     ┌─────────────┐
     │           │  dispatches  │     │dispatch_items│
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │◄────│ dispatchId  │
     │           │ number       │     │ productId   │
     │           │ receiptId(FK)│     │ warehouseId │
     │           │ status       │     │ quantity    │
     │           │ userId (FK)  │     └─────────────┘
     │           └──────────────┘
     │
     │           ┌──────────────┐     ┌─────────────┐
     │           │   audits     │     │ audit_items │
     │           ├──────────────┤     ├─────────────┤
     │           │ id (PK)      │◄────│ auditId(FK) │
     │           │ date         │     │ productId   │
     │           │ warehouseId  │     │ systemQty   │
     │           │ status       │     │ physicalQty │
     │           │ userId (FK)  │     │ difference  │
     │           └──────────────┘     └─────────────┘
     │
     │           ┌──────────────┐
     └──────────►│ audit_logs   │
                 ├──────────────┤
                 │ id (PK)      │
                 │ userId (FK)  │
                 │ action       │
                 │ entity       │
                 │ entityId     │
                 │ result       │
                 │ createdAt    │
                 └──────────────┘
```

---

## 2. DESCRIPCIÓN DE TABLAS

### 2.1 users
Almacena los usuarios del sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| email | VARCHAR(255) | Correo electrónico (único) |
| password_hash | TEXT | Hash de contraseña (bcrypt) |
| first_name | VARCHAR(100) | Nombre |
| last_name | VARCHAR(100) | Apellido |
| role | VARCHAR(50) | Rol del usuario |
| status | VARCHAR(20) | Estado: ACTIVE, INACTIVE, SUSPENDED |
| last_login_at | TIMESTAMP | Último inicio de sesión |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.2 products
Catálogo de productos del Banco de Alimentos.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| code | VARCHAR(50) | Código único del producto |
| name | VARCHAR(255) | Nombre del producto |
| description | TEXT | Descripción detallada |
| presentation | VARCHAR(100) | Presentación (ej: "Bolsa 500g") |
| weight | DECIMAL(10,2) | Peso numérico |
| unit | VARCHAR(20) | Unidad de medida |
| category_id | UUID FK | Categoría del producto |
| status | VARCHAR(20) | Estado: ACTIVE, INACTIVE, DISCONTINUED |
| min_stock | INTEGER | Stock mínimo para alertas |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.3 warehouses
Bodegas virtuales para diferenciar productos, campañas o programas.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| code | VARCHAR(20) | Código de la bodega (ej: "1.1") |
| name | VARCHAR(255) | Nombre descriptivo |
| description | TEXT | Descripción |
| type | VARCHAR(20) | Tipo: PROPIA, TERCERO, CAMPAIGN, PROGRAM |
| status | VARCHAR(20) | Estado: ACTIVE, INACTIVE |
| observations | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.4 inventory
Existencias calculadas por producto y bodega.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| product_id | UUID FK | Producto |
| warehouse_id | UUID FK | Bodega |
| quantity | INTEGER | Cantidad actual |
| last_movement_at | TIMESTAMP | Último movimiento |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

**Constraint UNIQUE**: (product_id, warehouse_id)

### 2.5 inventory_movements
Historial de todos los movimientos de inventario.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| type | VARCHAR(20) | Tipo: ENTRY, EXIT, ADJUSTMENT, AUDIT |
| product_id | UUID FK | Producto |
| warehouse_id | UUID FK | Bodega |
| quantity | INTEGER | Cantidad (positivo/negativo) |
| balance_after | INTEGER | Saldo después del movimiento |
| document_id | UUID | ID del documento relacionado |
| document_type | VARCHAR(50) | Tipo de documento |
| user_id | UUID FK | Usuario que realizó el movimiento |
| notes | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha del movimiento |

### 2.6 entries
Documentos de entrada/ingreso.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| format | VARCHAR(10) | Formato: E1, E3, N3, N5 |
| number | VARCHAR(50) | Consecutivo interno |
| date | DATE | Fecha de la entrada |
| nit | VARCHAR(50) | NIT del proveedor/donante |
| origin | VARCHAR(255) | Origen del producto |
| document | VARCHAR(100) | Número de documento |
| status | VARCHAR(20) | Estado: DRAFT, CONFIRMED, CANCELLED |
| user_id | UUID FK | Usuario responsable |
| notes | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.7 entry_items
Detalle de productos en una entrada.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| entry_id | UUID FK | Entrada relacionada |
| product_id | UUID FK | Producto |
| warehouse_id | UUID FK | Bodega destino |
| quantity | INTEGER | Cantidad |
| unit | VARCHAR(20) | Unidad de medida |
| presentation | VARCHAR(100) | Presentación |
| created_at | TIMESTAMP | Fecha de creación |

### 2.8 orders
Órdenes de pedido.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| number | VARCHAR(50) | Número de pedido |
| date | DATE | Fecha del pedido |
| nit | VARCHAR(50) | NIT del destinatario |
| destination | VARCHAR(255) | Destino |
| status | VARCHAR(20) | Estado: DRAFT, APPROVED, INVOICED, DISPATCHED, CANCELLED |
| user_id | UUID FK | Usuario responsable |
| notes | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.9 invoices
Facturas de venta.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| format | VARCHAR(10) | Formato: SF1, F2 |
| number | VARCHAR(50) | Número de factura |
| order_id | UUID FK | Pedido relacionado |
| date | DATE | Fecha de la factura |
| status | VARCHAR(20) | Estado: DRAFT, GENERATED, ASSOCIATED_TO_RECEIPT, CANCELLED |
| user_id | UUID FK | Usuario responsable |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.10 receipts
Recibos de caja.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| format | VARCHAR(10) | Formato: R1, R2, R3, R4 |
| number | VARCHAR(50) | Número de recibo |
| invoice_id | UUID FK | Factura relacionada |
| date | DATE | Fecha del recibo |
| status | VARCHAR(20) | Estado: DRAFT, GENERATED, CANCELLED |
| user_id | UUID FK | Usuario responsable |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.11 dispatches
Despachos de productos.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| number | VARCHAR(50) | Número de despacho |
| receipt_id | UUID FK | Recibo relacionado |
| date | DATE | Fecha del despacho |
| status | VARCHAR(20) | Estado: PENDING, PREPARED, DISPATCHED, CANCELLED |
| user_id | UUID FK | Usuario responsable |
| notes | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.12 audits
Auditorías de inventario.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| date | DATE | Fecha de la auditoría |
| warehouse_id | UUID FK | Bodega auditada |
| responsible | VARCHAR(255) | Responsable del conteo |
| status | VARCHAR(20) | Estado: PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| user_id | UUID FK | Usuario que registró |
| notes | TEXT | Observaciones |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Fecha de actualización |

### 2.13 audit_items
Detalle de productos auditados.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| audit_id | UUID FK | Auditoría relacionada |
| product_id | UUID FK | Producto |
| system_quantity | INTEGER | Existencia según sistema |
| physical_quantity | INTEGER | Existencia física contada |
| difference | INTEGER | Diferencia (física - sistema) |
| observation | TEXT | Observación |
| created_at | TIMESTAMP | Fecha de creación |

### 2.14 audit_logs
Registro de actividad del sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Identificador único |
| user_id | UUID FK | Usuario que realizó la acción |
| action | VARCHAR(50) | Acción realizada |
| entity | VARCHAR(100) | Entidad afectada |
| entity_id | UUID | ID del registro afectado |
| result | VARCHAR(20) | Resultado: SUCCESS, FAILURE, ERROR |
| details | TEXT | Detalles adicionales |
| ip_address | INET | Dirección IP |
| created_at | TIMESTAMP | Fecha del evento |

---

## 3. ÍNDICES

| Tabla | Índice | Columnas | Justificación |
|---|---|---|---|
| products | idx_products_code | code | Búsqueda por código |
| products | idx_products_category | category_id | Filtro por categoría |
| products | idx_products_status | status | Filtro por estado |
| inventory | idx_inventory_product_warehouse | product_id, warehouse_id | Búsqueda de stock |
| inventory_movements | idx_movements_product | product_id | Historial por producto |
| inventory_movements | idx_movements_warehouse | warehouse_id | Historial por bodega |
| inventory_movements | idx_movements_user | user_id | Historial por usuario |
| inventory_movements | idx_movements_created | created_at | Filtro por fecha |
| entries | idx_entries_date | date | Filtro por fecha |
| entries | idx_entries_status | status | Filtro por estado |
| orders | idx_orders_date | date | Filtro por fecha |
| orders | idx_orders_status | status | Filtro por estado |
| audit_logs | idx_logs_user | user_id | Historial por usuario |
| audit_logs | idx_logs_created | created_at | Filtro por fecha |

---

## 4. CONSTRAINTS

| Tabla | Constraint | Descripción |
|---|---|---|
| products | UNIQUE (code) | Código único |
| products | CHECK (weight > 0) | Peso positivo |
| products | CHECK (min_stock >= 0) | Stock mínimo no negativo |
| inventory | UNIQUE (product_id, warehouse_id) | Un registro por producto-bodega |
| inventory | CHECK (quantity >= 0) | Cantidad no negativa |
| inventory_movements | CHECK (quantity != 0) | Cantidad diferente de cero |
| entry_items | CHECK (quantity > 0) | Cantidad positiva |
| order_items | CHECK (quantity > 0) | Cantidad positiva |
| dispatch_items | CHECK (quantity > 0) | Cantidad positiva |
| audit_items | CHECK (physical_quantity >= 0) | Cantidad física no negativa |

---

## 5. POLÍTICAS RLS (ROW LEVEL SECURITY)

| Tabla | Política | Descripción |
|---|---|---|
| products | SELECT | Todos los usuarios autenticados pueden ver |
| products | INSERT/UPDATE/DELETE | Solo SUPERADMIN y ADMIN |
| warehouses | SELECT | Todos los usuarios autenticados pueden ver |
| warehouses | INSERT/UPDATE/DELETE | Solo SUPERADMIN |
| inventory | SELECT | Todos los usuarios autenticados pueden ver |
| inventory | INSERT/UPDATE | Solo vía triggers/API |
| inventory_movements | SELECT | Todos los usuarios autenticados pueden ver |
| inventory_movements | INSERT | Solo vía API (no directo) |
| audit_logs | SELECT | Solo SUPERADMIN y CONTABILIDAD |
| audit_logs | INSERT | Solo vía API (no directo) |

---

*Documento actualizado en FASE 1 — Arquitectura + Scaffold*
