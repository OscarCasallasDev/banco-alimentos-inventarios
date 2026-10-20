# Arquitectura del Sistema

## Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. VISIÓN GENERAL

Aplicación web responsive construida con Next.js 16 (App Router) que funciona
como **solución complementaria** a Siigo Pyme, especializada en gestión,
control, trazabilidad y conciliación de inventarios.

---

## 2. DIAGRAMA DE ARQUITECTURA

```
┌─────────────────────────────────────────────────────────┐
│                    NAVEGADOR                             │
│         (Responsive: Desktop / Tablet / Móvil)          │
└────────────────────────┬────────────────────────────────┘
                          │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│              VERCEL (Next.js 16)                         │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │   Frontend UI   │  │     API Routes (/api/*)      │  │
│  │  React 19 + TW  │  │  • Zod (schemas compartidos) │  │
│  │  Client Comp.   │  │  • requireUser()             │  │
│  └─────────────────┘  │  • jsonOk / handleRouteError │  │
│                       └──────────────┬───────────────┘  │
│                                      │                   │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │         Capa de servicios (src/lib/services)      │  │
│  │  entry · order · invoice · receipt · dispatch     │  │
│  │  audit · inventory · product · warehouse · user    │  │
│  │  dashboard · report · siigo · document · auditLog │  │
│  │  → Reglas de negocio en transacciones             │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                          │ Drizzle ORM + postgres.js
                          │ (transacciones reales)
┌────────────────────────▼────────────────────────────────┐
│              SUPABASE POSTGRESQL                         │
│                                                          │
│  Tablas:                                                 │
│  • users, roles, audit_logs                            │
│  • products, categories                                 │
│  • warehouses, inventory, inventory_movements           │
│  • entries, entry_items                                 │
│  • orders, order_items                                  │
│  • invoices, invoice_items                              │
│  • receipts                                             │
│  • dispatches, dispatch_items                           │
│  • audits, audit_items                                  │
│  • documents                                            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. CAPAS DE LA APLICACIÓN

### 3.1 Presentación (Frontend)
- **Páginas**: 14 módulos bajo `src/app/(protected)`
- **Componentes**: `layout/` (Sidebar, Header, ProtectedLayout) y `ui/` (Toast)
- **Estado**: `useState` + `useEffect` con *fetch* (migración a React Query pendiente)
- **Convención**: la UI consume y envía **camelCase**, igual que la API

### 3.2 API (Backend)
- **Route Handlers** de Next.js en `src/app/api/*`
- **Validación**: `src/lib/validations/schemas.ts` (fuente única, Zod)
- **Autenticación**: `requireUser()` en cada endpoint
- **Respuestas**: `jsonOk(data)` / `jsonError(code, mensaje, status)`
- **Errores**: `handleRouteError()` traduce Zod, `ApplicationError` y errores
  de PostgreSQL a respuestas consistentes

### 3.3 Servicios (Lógica de Negocio)
Cada servicio recibe un `DbExecutor` (la base de datos o una transacción), de
modo que la misma función se puede usar dentro o fuera de una transacción.

| Servicio | Responsabilidad |
|---|---|
| `inventory.service` | Existencia, movimientos, bloqueo de fila (`FOR UPDATE`), ajustes |
| `entry.service` | Entrada + ítems + stock + soporte + bitácora |
| `order.service` | Pedido + ítems (no mueve stock) |
| `invoice.service` | Factura que hereda los ítems del pedido |
| `receipt.service` | Recibo que habilita el despacho |
| `dispatch.service` | Despacho que descuenta el stock (un despacho por recibo) |
| `audit.service` | Conciliación física y ajuste de inventario |
| `product/warehouse/user.service` | Catálogo con baja lógica |
| `dashboard/report.service` | Indicadores y agregados |
| `siigo.service` | Estructuras ExcelSiigo a partir de datos reales |
| `document.service` | Soportes documentales del flujo |
| `audit-log.service` | Bitácora de operaciones |

### 3.4 Acceso a datos
- **Drizzle ORM** sobre `postgres.js`
- **Una sola conexión**: `src/lib/db/client.ts` (inicialización perezosa)
- **Transacciones**: `withTransaction()` para las operaciones críticas
- **Tipos**: `src/types/database.ts` se deriva del schema (fuente única)

### 3.5 Resiliencia de la conexión

El host directo de Supabase (`db.<ref>.supabase.co`) resuelve por DNS de forma
**intermitente**: cuando su DNS falla, toda consulta muere con
`getaddrinfo ENOTFOUND`. El *pooler* (`aws-0-<region>.pooler.supabase.com`)
tiene direcciones fijas y es estable.

Por eso la capa de datos:

| Mecanismo | Descripción |
|---|---|
| `DATABASE_URL` | Conexión **principal**: siempre el pooler |
| `DATABASE_FALLBACK_URLS` | Conexiones de **respaldo**, separadas por coma |
| Failover automático | Ante un error de red, la consulta se reintenta con la siguiente candidata |
| `isConnectionError()` | Distingue un fallo de red de un error de SQL (revisando la cadena de `cause`) |
| Respuesta 503 | Si ninguna conexión responde, la API devuelve `DATABASE_UNAVAILABLE` con un mensaje accionable |

El failover se implementa en `src/lib/db/client.ts` interceptando las
consultas de postgres.js (`unsafe`, template y `values()`), de modo que
**ninguna ruta de la aplicación** queda sin protección.

Para reconfigurar la conexión tras un problema:

```bash
npm run db:check    # prueba todas las variantes y deja la que funciona
```

---

## 4. CONVENCIONES

| Capa | Convención | Ejemplo |
|---|---|---|
| PostgreSQL | `snake_case` | `min_stock`, `created_at` |
| Drizzle / TypeScript | `camelCase` | `minStock`, `createdAt` |
| API (entrada y salida) | `camelCase` | `{ productId, warehouseId, quantity }` |
| Documentos | `PREFIJO-AÑO-CONSECUTIVO` | `ENT-2026-0001` |

El único punto donde conviven las dos convenciones es la traducción que hace
Drizzle. Fuera de ahí, toda la aplicación habla camelCase.

---

## 5. FLUJO DE DATOS

### 5.1 Entrada de producto
```
Usuario → Formulario → POST /api/entradas
  → Zod (createEntrySchema)
  → requireUser()
  → BEGIN
      → INSERT entries
      → INSERT entry_items
      → si CONFIRMED: applyStockMovement (inventory + inventory_movements)
      → INSERT documents
      → INSERT audit_logs
  → COMMIT
```

### 5.2 Salida de producto
```
Pedido → Factura → Recibo → Despacho
  → POST /api/despachos
  → Validar que el recibo no tenga ya un despacho
  → Heredar los ítems del pedido
  → BEGIN
      → INSERT dispatches + dispatch_items
      → applyStockMovement (EXIT, quantity negativa)
      → UPDATE orders SET status = 'DISPATCHED'
      → INSERT documents + audit_logs
  → COMMIT
```

### 5.3 Conciliación por auditoría
```
Auditoría → POST /api/auditoria
  → La existencia del sistema se lee de la base (no del cliente)
  → INSERT audits + audit_items
  → si COMPLETED: adjustStockToPhysical (movimiento ADJUSTMENT)
```

### 5.4 Cálculo de inventario
```
existencia = Σ movimientos(ENTRY) − Σ movimientos(EXIT) + Σ movimientos(ADJUSTMENT)
```
`inventory.quantity` materializa ese valor; `inventory_movements` es la
fuente de verdad histórica e inmutable.

---

## 6. SEGURIDAD

### 6.1 Autenticación
- Cookie `session_token` `HttpOnly` firmada con HMAC-SHA256 (`SESSION_SECRET`)
- El token contiene el `userId` y su expiración: no es falsificable
- `src/proxy.ts` (convención Next.js 16) bloquea páginas y APIs sin sesión
- El layout protegido revalida la sesión en el servidor

### 6.2 Autorización
- Roles: `SUPERADMIN`, `ADMIN`, `RECEPCION`, `DESPACHO`, `CONTABILIDAD`
- `requireUser()` en todos los endpoints de negocio
- La aplicación accede con el rol de servicio: la validación vive en el servidor

### 6.3 Protección de datos
- Secretos solo en variables de entorno (`.env.local` está en `.gitignore`)
- Validación en frontend **y** backend
- `password_hash` nunca se devuelve en ninguna respuesta
- Bitácora de auditoría en cada operación crítica

---

## 7. INTEGRACIÓN CON SIIGO PYME

### 7.1 Principios
- NO reemplazar Siigo Pyme
- NO inventar APIs ni comandos
- Los datos del archivo salen de la base de datos real del sistema
- Los campos contables que solo existen en Siigo (cuenta, centro de costo,
  precio) quedan vacíos hasta que el Banco valide la plantilla

### 7.2 Estados
- **REAL**: implementado y probado
- **DEMO**: funciona con datos reales pero la plantilla está sin validar
- **PENDIENTE**: requiere validación externa

### 7.3 Flujo
```
Sistema → POST /api/siigo/export { format, documentId? }
  → siigo.service construye la estructura con datos de la BD
  → exporter genera el .xlsx (hojas "Encabezado" + "Items")
  → el Banco lo abre en ExcelSiigo y ejecuta PUSH hacia Siigo Pyme
```

---

## 8. DESPLIEGUE

| Componente | Plataforma | Método |
|---|---|---|
| Frontend | Vercel | Git-based deployment |
| Base de datos | Supabase | PostgreSQL managed (pooler) |
| Variables | Vercel + Supabase | `DATABASE_URL`, `SESSION_SECRET` |

Variables requeridas en producción: `DATABASE_URL` y `SESSION_SECRET`.
El resto de variables de Supabase son opcionales mientras la aplicación no
use la API REST de Supabase.

---

## 9. DECISIONES TÉCNICAS

| Decisión | Alternativa | Justificación |
|---|---|---|
| Next.js 16 | Next.js 15 | Convención `proxy` y React 19 |
| Drizzle ORM | Prisma | Ligero, tipado estricto, ideal para serverless |
| `postgres.js` | `pg` | Driver más eficiente, soporte de transacciones |
| Transacciones | API REST | La API REST de Supabase no permite operaciones multi-tabla atómicas |
| Cookie HMAC | JWT en cookie | Menos dependencias, verificación en runtime Edge |
| Tailwind 4 | Tailwind 3 | Configuración basada en CSS, mejor rendimiento |
| SheetJS | ExcelJS | Más ligero, suficiente para ExcelSiigo |

---

## 10. COMANDOS

| Comando | Función |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | ESLint |
| `npm run test:run` | Pruebas unitarias |
| `npm run test:e2e` | Prueba end-to-end de todos los módulos |
| `npm run check:ui` | Verificación del render de todas las páginas |
| `npm run db:check` | Verifica la conexión y ajusta `DATABASE_URL` |
| `npm run db:setup` | Aplica migraciones y carga la semilla |
| `npm run db:setup:reset` | Reinicia la base de datos y recarga la semilla |

---

*Documento actualizado en 2026-10-20 — FASE 9 (Pruebas) completada*
