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

## Modelo de Lotes y Trazabilidad (FASE 11)

### La idea central

El **catálogo de productos** y los **ingresos** son cosas distintas:

- Un **producto** es una referencia comercial (arroz de 500 g).
- Un **lote** es una cantidad específica de ese producto recibida en una
  entrada concreta, con su propia fecha de vencimiento y su propia existencia.

Dos ingresos del mismo producto con vencimientos distintos son **dos lotes**,
aunque compartan el mismo `product_id`.

### Fuente de verdad

| Nivel | Fuente | Naturaleza |
|---|---|---|
| Existencias por lote | `lots.quantity_available` | Verdad |
| Historial | `inventory_movements` (inmutable, con `lot_id`) | Verdad |
| Existencias por producto/bodega | `inventory.quantity` | **Caché materializada** |

El agregado y los lotes se actualizan **siempre en la misma transacción**.
La vista `v_inventory_reconciliation` compara ambos: su diferencia debe ser
cero. Si no lo es, el dashboard lo muestra como alerta.

> Nunca se suman el agregado y los lotes: son dos vistas del mismo hecho.

### Relaciones

```
products   1 ─── N lots
warehouses 1 ─── N lots
entries    1 ─── N entry_items 1 ─── N lots
lots       1 ─── N inventory_movements
dispatch_items N ─── M lots   (dispatch_item_lots)
audit_items   N ─── M lots   (audit_item_lots)
inventory      (product_id, warehouse_id) = caché del agregado
```

### Tabla `lots`

| Columna | Tipo | Significado |
|---|---|---|
| `id` | uuid PK | Identificador interno (UUID de PostgreSQL) |
| `code` | varchar(50) **UNIQUE** | Código visible: `L-ARR001-20261027-0001` |
| `external_code` | varchar(100) | Código del proveedor/fabricante (no único) |
| `entry_id` / `entry_item_id` | uuid FK | Documento y línea de entrada de origen |
| `product_id` | uuid FK | Producto del lote |
| `warehouse_id` | uuid FK | Bodega lógica |
| `status` | lot_status | DRAFT, ACTIVE, BLOCKED, DEPLETED, DISPOSED, CANCELLED |
| `origin` | lot_origin | ENTRY, OPENING, ADJUSTMENT, RETURN, TRANSFER, MIGRATION |
| `traceability` | lot_traceability | FULL, PARTIAL, NONE |
| `expiration_date` | date | Vencimiento. **NULL = dato no conocido** |
| `received_at` | timestamp | Fecha de recepción |
| `quantity_received` | numeric(14,3) | **Histórica e inmutable** |
| `quantity_available` | numeric(14,3) | Existencias actuales del lote |
| `stock_unit` | varchar(20) | Snapshot de la unidad de manejo |
| `unit_kind` | stock_unit_kind | Snapshot de la naturaleza (COUNT/MASS/VOLUME) |
| `presentation` | varchar(100) | Snapshot de la presentación comercial |
| `net_weight_grams` | numeric(14,3) | **Peso neto por unidad de stock** (snapshot) |
| `net_volume_ml` | numeric(14,3) | Volumen neto por unidad de stock (snapshot) |
| `weight_is_estimate` | boolean | El contenido es estimado |
| `is_historical` | boolean | Lote de apertura o sin trazabilidad completa |
| `parent_lot_id` | uuid FK | Lote origen (transferencias / división) |
| `created_by` | uuid FK | Usuario que creó el lote |

Restricciones de integridad:

- `UNIQUE (code)` — la garantía final de unicidad.
- `quantity_received > 0`.
- `0 <= quantity_available <= quantity_received`.
- `net_weight_grams IS NULL OR > 0` (igual para `net_volume_ml`).
- Trigger `trg_lots_immutable_keys`: no se puede cambiar `code`, `product_id`,
  `warehouse_id`, `entry_item_id`, `quantity_received`, `created_by` ni
  `received_at`.
- Trigger `trg_lots_no_delete`: los lotes no se eliminan; se cancelan.
- Trigger `trg_lots_expiration_required`: un lote de entrada cuyo producto
  controla vencimiento no puede declararse `FULL` sin fecha.

### Código de lote

Formato: `L-{PREFIJO_PRODUCTO}-{AAAAMMDD}-{NNNN}` (ej. `L-ARR001-20261027-0001`).

- El prefijo sale del código del producto normalizado.
- La fecha es la **de recepción**, no la de vencimiento: el vencimiento puede
  ser desconocido o corregirse sin que el lote pierda su identidad.
- El consecutivo se reserva en `lot_sequences` con
  `INSERT … ON CONFLICT DO UPDATE` (atómico). **Nunca** se usa `MAX()+1`.
- El ámbito del consecutivo es `LOT:{prefijo}:{fecha}`: dos productos con
  prefijos equivalentes comparten contador y no pueden colisionar.
- El código **no depende de la cantidad**: sigue siendo válido aunque el
  lote se consuma por completo.

La etiqueta legible con el vencimiento se muestra aparte:
`L-ARR001-20261027-0001 · Vence 01/11/2026`.

### Reglas de peso

```
peso_recibido_kg  = quantity_received  × net_weight_grams / 1000
peso_disponible_kg = quantity_available × net_weight_grams / 1000
volumen_disponible_l = quantity_available × net_volume_ml / 1000
```

- 300 bolsas de 500 g = **150 kg**.
- Si no hay contenido neto conocido, el peso es `null`: **no se inventa** y
  no se reporta 0 kg. El dashboard informa la **cobertura** del peso.
- Las unidades no se suman entre naturalezas distintas: el conteo, la masa y
  el volumen se informan por separado.
- Conversiones: 1 kg = 1000 g, 1 L = 1000 ml, 1 lb = 453,59237 g.
- La aritmética se hace con enteros escalados (`multiplyExact`) y los
  agregados en SQL con `numeric`, nunca con coma flotante.

### Reglas de vencimiento

| Estado | Regla | Efecto |
|---|---|---|
| `EXPIRED` | vencimiento < hoy | No despachable; alerta roja |
| `EXPIRES_TODAY` | = hoy | Crítico; no despachable |
| `EXPIRES_TOMORROW` | = mañana | Crítico |
| `CRITICAL` | ≤ `expiry_critical_days` (7) | Alerta alta |
| `WARNING` | ≤ `expiry_alert_days` (30) | Alerta media |
| `OK` | > horizonte | Sin alerta |
| `NO_EXPIRY` | sin fecha | Dato faltante si el producto lo controla |

- El "hoy" es siempre el del Banco (`America/Bogota`).
- Las fechas son `date`, nunca marcas de tiempo: no se desplazan un día.
- Solo generan alerta los lotes `ACTIVE` con `quantity_available > 0`.
- El horizonte se configura en `system_settings` (pantalla de Configuración).

### Reglas de disponibilidad

- **Entrada DRAFT**: lotes `DRAFT`, disponible 0, sin movimientos.
- **Entrada CONFIRMED**: lotes `ACTIVE`, disponible = recibido, movimiento
  `ENTRY`. Idempotente mediante `entries.stock_applied_at`.
- **Salida**: consume lotes FEFO (o los que el usuario elija). Un lote
  vencido **no** se despacha automáticamente. Registra
  `dispatch_item_lots` y un movimiento `EXIT`.
- **Auditoría**: por producto (reparto FEFO) o **por lote** (si el conteo se
  informa por lote). El sobrante se registra en un lote de ajuste; la
  cantidad recibida de un lote nunca se reescribe.
- **Lote agotado**: queda `DEPLETED`, se conserva para consulta histórica y
  no aparece como disponible ni genera alerta.
- **Bloqueo / disposición** (`PATCH /api/lotes/[id]/estado`, solo ADMIN): la
  mercancía sale del pool disponible y queda registrada en el libro de
  movimientos.

### Tablas de soporte

| Tabla | Propósito |
|---|---|
| `lot_sequences` | Consecutivo atómico de códigos de lote |
| `dispatch_item_lots` | Qué lote se consumió en cada línea de salida |
| `audit_item_lots` | Conteo/ajuste por lote con cantidad anterior, física y diferencia |
| `system_settings` | Parámetros del Banco (horizonte de alertas) |

### Datos históricos

- Los lotes de apertura (`origin = 'OPENING'`, `is_historical = true`)
  representan el saldo previo al modelo. **No** tienen vencimiento ni
  documento: inventarlos violaría la trazabilidad.
- Las entradas anteriores al modelo **no** reciben lotes retroactivos: su
  saldo ya está en los lotes de apertura. Duplicarlo sería incorrecto.
- Los movimientos con `lot_id IS NULL` se conservan y se identifican como
  históricos: no se les inventa una relación con un lote.
- `npm run db:auditar` revisa estas inconsistencias sin modificar datos.

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
11. Cada ingreso genera lotes trazables con cantidad, peso y vencimiento propios
12. Un lote vencido no se despacha; los lotes agotados no generan alerta
13. El peso nunca se inventa: si no hay contenido neto, se informa la cobertura
14. Las unidades de naturaleza distinta (conteo, masa, volumen) no se suman entre sí

---

*Última actualización: FASE 11 — Trazabilidad por lotes, vencimientos y peso*
