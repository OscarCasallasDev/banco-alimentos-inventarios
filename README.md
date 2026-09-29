# Sistema de Gestión, Trazabilidad y Conciliación de Inventarios

**Banco Arquidiocesano de Alimentos de Ibagué**

Sistema integral para la gestión de inventarios, trazabilidad de movimientos y conciliación de existencias, diseñado específicamente para las necesidades del Banco de Alimentos.

---

## Características

- **Gestión de Productos**: CRUD completo del catálogo de productos
- **Gestión de Bodegas**: Administración de bodegas y almacenes
- **Inventario en Tiempo Real**: Consulta de stock por producto y bodega
- **Entradas**: Registro de ingresos al inventario con trazabilidad
- **Salidas**: Flujo completo (Pedido → Factura → Recibo → Despacho)
- **Auditoría**: Control y conciliación de inventarios
- **Reportes**: Análisis y exportación de datos
- **Integración Siigo**: Preparado para integración con Siigo Pyme (pendiente validación)

---

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript (estricto) |
| UI | React 19 + Tailwind CSS 4 |
| Base de datos | Supabase PostgreSQL |
| ORM | Drizzle ORM |
| Autenticación | Cookies de sesión + middleware |
| Validación | Zod |
| Estado/Cache | TanStack React Query |
| Gráficos | Recharts |
| Excel | SheetJS (xlsx) |
| Iconos | Lucide React |
| Despliegue | Vercel + Supabase |

---

## Inicio Rápido

### Requisitos

- Node.js 18+
- npm o yarn
- Cuenta en Supabase

### Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

# 3. Ejecutar migraciones (crear tablas)
npx drizzle-kit push

# 4. Ejecutar seed (crear usuario admin y datos demo)
# Conectar a tu base de datos Supabase y ejecutar:
# drizzle/seed.sql

# 5. Iniciar desarrollo
npm run dev

# 6. Abrir http://localhost:3000
```

### Variables de Entorno

Crea un archivo `.env.local` con las siguientes variables:

```env
# Connection string de Supabase PostgreSQL
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Entorno
NODE_ENV="development"

# Secreto para sesiones (genera uno con: openssl rand -hex 32)
SESSION_SECRET="tu-secreto-seguro-de-32-caracteres"
```

**¿Cómo obtener DATABASE_URL?**
1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a Settings → Database
4. Copia el "Connection string" (modo Transaction)

---

## Credenciales de Acceso (DEMO)

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | SUPERADMIN |

---

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── (protected)/        # Rutas protegidas (14 páginas)
│   ├── api/                # API Routes (20 endpoints)
│   │   ├── auth/           # Login, logout, me
│   │   ├── productos/      # CRUD productos
│   │   ├── bodegas/        # CRUD bodegas
│   │   ├── entradas/       # Gestión de entradas
│   │   ├── pedidos/        # Gestión de pedidos
│   │   ├── facturas/       # Gestión de facturas
│   │   ├── recibos/        # Gestión de recibos
│   │   ├── despachos/      # Gestión de despachos
│   │   ├── auditoria/      # Auditoría
│   │   ├── inventario/     # Consulta de inventario
│   │   ├── reportes/       # Reportes
│   │   ├── usuarios/       # CRUD usuarios
│   │   ├── categorias/     # CRUD categorías
│   │   ├── dashboard/      # Estadísticas
│   │   └── siigo/          # Integración Siigo
│   ├── login/              # Página de login
│   ├── layout.tsx          # Layout raíz
│   └── page.tsx            # Página principal
├── components/             # Componentes React (por crear)
├── lib/
│   ├── db/                 # Schema Drizzle + cliente
│   ├── siigo/              # Formatos + exportador Excel
│   ├── validations/        # Schemas Zod
│   ├── utils/              # Utilidades (errores, confirmaciones)
│   └── __tests__/          # Tests
├── types/                  # Tipos TypeScript
├── hooks/                  # Custom hooks (por crear)
└── middleware.ts           # Protección de rutas
drizzle/                    # Migraciones SQL + seed
docs/                       # Documentación
```

---

## Fases del Proyecto

| Fase | Estado | Descripción |
|------|--------|-------------|
| FASE 0 | ✅ Completado | Análisis del entorno |
| FASE 1 | ✅ Completado | Arquitectura + Scaffold |
| FASE 2 | ✅ Completado | Base de datos (schema + migraciones + seed) |
| FASE 3 | ✅ Completado | Autenticación + Layout |
| FASE 4 | ✅ Completado | Productos + Bodegas (CRUD) |
| FASE 5 | ✅ Completado | Inventario + Entradas |
| FASE 6 | ✅ Completado | Salidas (Pedido → Factura → Recibo → Despacho) |
| FASE 7 | ✅ Completado | Auditoría + Reportes |
| FASE 8 | ⚠️ Demo | Integración Siigo (export Excel, PUSH pendiente) |
| FASE 9 | ⚠️ Parcial | Pruebas (solo validaciones unitarias) |
| FASE 10 | ⏳ Pendiente | Deploy |

---

## Documentación

- [Arquitectura](./docs/ARQUITECTURA.md)
- [Modelo de Datos](./docs/MODELO_DATOS.md)
- [Integración Siigo](./docs/INTEGRACION_SIIGO.md)
- [Estado Actual](./docs/ESTADO_ACTUAL.md)
- [Resumen de Implementación](./docs/RESUMEN_IMPLEMENTACION.md)

---

## Licencia

Proyecto educativo — Universidad de Ibagué, Programa Paz y Región 2026B

---

**Desarrollador**: Oscar Daniel Casallas Lozano
**Organización**: Banco Arquidiocesano de Alimentos de Ibagué
