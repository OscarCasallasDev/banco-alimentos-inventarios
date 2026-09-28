# Arquitectura del Sistema

## Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. VISIÓN GENERAL

El sistema es una aplicación web responsive construida con Next.js 16 (App Router) que funciona como una solución complementaria a Siigo Pyme, especializada en gestión, control, trazabilidad y conciliación de inventarios.

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
│  │  React 19 + TW  │  │  • Lógica de negocio         │  │
│  │  shadcn/ui      │  │  • Validación (Zod)          │  │
│  └─────────────────┘  │  • Autenticación             │  │
│                       └──────────────┬───────────────┘  │
│                                      │                   │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │        SiigoIntegrationService (DEMO)              │  │
│  │  • Exportar Excel → Validar → PUSH (futuro)       │  │
│  │  • Importar Excel → Validar → Importar            │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Supabase Client (RLS)
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

### 3.1 Capa de Presentación (Frontend)
- **Componentes UI**: Componentes base reutilizables (shadcn/ui)
- **Layout**: Sidebar responsive, header móvil
- **Páginas**: Dashboard, módulos CRUD, reportes
- **Estado**: React Query para datos del servidor

### 3.2 Capa de API (Backend)
- **API Routes**: Next.js Route Handlers (`/api/*`)
- **Validación**: Schemas Zod compartidos
- **Autenticación**: Supabase Auth + JWT
- **Autorización**: Middleware de roles

### 3.3 Capa de Servicios (Lógica de Negocio)
- **InventoryService**: Cálculo de existencias, validación de stock
- **EntryService**: Registro de entradas, actualización de inventario
- **ExitService**: Flujo pedido → factura → recibo → despacho
- **SiigoIntegrationService**: Abstracción para integración futura

### 3.4 Capa de Acceso a Datos
- **Drizzle ORM**: Type-safe, migrations
- **Supabase Client**: Conexión a PostgreSQL
- **RLS**: Row Level Security para multi-tenancy

---

## 4. FLUJO DE DATOS

### 4.1 Entrada de Producto
```
Usuario → Formulario → API /api/entradas
  → Validación Zod
  → Crear Entry + EntryItems
  → Crear InventoryMovement (ENTRY)
  → Actualizar Inventory
  → Crear AuditLog
  → Respuesta JSON
```

### 4.2 Salida de Producto
```
Usuario → Pedido → Factura → Recibo → Despacho
  → Validar stock disponible
  → Crear Dispatch + DispatchItems
  → Crear InventoryMovement (EXIT)
  → Actualizar Inventory
  → Crear AuditLog
  → Respuesta JSON
```

### 4.3 Cálculo de Inventario
```
Existencia = Σ Entradas - Σ Salidas + Σ Ajustes

Se calcula en tiempo real desde inventory_movements
No se almacena como campo editable
```

---

## 5. SEGURIDAD

### 5.1 Autenticación
- Supabase Auth con email/contraseña
- JWT tokens con expiración
- Protección de rutas con middleware

### 5.2 Autorización
- Roles: SUPERADMIN, ADMIN, RECEPCION, DESPACHO, CONTABILIDAD
- Verificación en cada API route
- RLS en Supabase como capa adicional

### 5.3 Protección de Datos
- Variables de entorno para secretos
- NUNCA exponer service_role_key
- Validación en frontend Y backend
- Sanitización de inputs
- Logs de operaciones críticas

---

## 6. INTEGRACIÓN CON SIIGO PYME

### 6.1 Principios
- NO reemplazar Siigo Pyme
- NO inventar APIs ni comandos
- Usar ExcelSiigo (GET/PUSH) cuando se valide
- Módulo independiente (SiigoIntegrationService)

### 6.2 Estados
- **REAL**: Implementado y probado
- **DEMO**: Simulado con datos de prueba
- **PENDIENTE**: Requiere validación externa

### 6.3 Arquitectura Futura
```
Nube (Vercel + Supabase)
        ↓
SiigoIntegrationService
        ↓
Archivo Excel compatible
        ↓
[Componente local en equipo del Banco]
        ↓
ExcelSiigo → Siigo Pyme
```

---

## 7. DESPLIEGUE

| Componente | Plataforma | Método |
|---|---|---|
| Frontend | Vercel | Git-based deployment |
| Base de datos | Supabase | PostgreSQL managed |
| Variables | Vercel + Supabase | Environment variables |
| Dominio | Por definir | — |

---

## 8. DECISIONES TÉCNICAS

| Decisión | Alternativa | Justificación |
|---|---|---|
| Next.js 16 | Next.js 15 | Última versión estable |
| Drizzle ORM | Prisma | Más ligero, mejor para serverless |
| Tailwind 4 | Tailwind 3 | Mejor rendimiento, CSS-based config |
| React Query | SWR | Mejor para paginación y mutations |
| SheetJS | ExcelJS | Más ligero, suficiente para el MVP |

---

*Documento actualizado en FASE 1 — Arquitectura + Scaffold*
