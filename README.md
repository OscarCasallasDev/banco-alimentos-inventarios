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

# 3. Verificar la conexión (ajusta DATABASE_URL si hace falta)
npm run db:check

# 4. Crear tablas y cargar los datos demo (incluye el usuario admin)
npm run db:setup

# 5. Iniciar desarrollo
npm run dev

# 6. Abrir http://localhost:3000
```

### Variables de Entorno

Crea un archivo `.env.local` con las siguientes variables:

```env
# Connection string de Supabase PostgreSQL
# Directo (requiere IPv6):
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
# Pooler (recomendado, funciona en redes sin IPv6):
# DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Entorno
NODE_ENV="development"

# Secreto para firmar las cookies de sesión (mínimo 32 caracteres)
# Genera uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET="tu-secreto-seguro-de-64-caracteres"
```

**¿Cómo obtener DATABASE_URL?**
1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a Settings → Database
4. Copia el "Connection string"
5. Ejecuta `npm run db:check`: el script prueba la conexión directa y el
   *pooler* en varias regiones, y deja en `.env.local` la que funcione.

---

## Comandos

| Comando | Función |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | ESLint |
| `npm run test:run` | Pruebas unitarias |
| `npm run test:e2e` | Prueba end-to-end de todos los módulos |
| `npm run verify` | **Verificación integral**: conexión + esquema + un test por módulo, dejando los datos visibles en Supabase |
| `npm run verify:server` | Lo mismo, pero levanta el servidor de desarrollo él mismo |
| `npm run check:ui` | Verificación del render de todas las páginas |
| `npm run db:check` | Verifica la conexión a Supabase |
| `npm run db:setup` | Aplica migraciones y carga la semilla |
| `npm run db:setup:reset` | Reinicia la base de datos y recarga la semilla |

---

## Verificar que todo está conectado (y ver los datos en Supabase)

```bash
npm run verify
```

Este script:

1. Verifica la **conexión real** a Supabase (host, base, versión, latencia) y
   confirma una **escritura** efectiva en la base.
2. Revisa el **esquema**: 20 tablas, 17 enums, índices y claves foráneas.
3. Ejecuta **una prueba por cada módulo** a través de la API real: usuarios,
   categorías, bodegas, productos, entradas, pedidos, facturas, recibos,
   despachos, auditoría, inventario, dashboard, reportes, Siigo y configuración.
4. Vuelve a leer la base de datos **directamente** y confirma que cada dato
   quedó escrito con el valor esperado (cantidades, estados, saldos).
5. Te dice **exactamente dónde y cómo ver esos datos en Supabase**.

Los datos que crea se quedan en la base con el prefijo `PRUEBA-AAAAMMDD-HHMM`
para que puedas encontrarlos en el *Table Editor* de Supabase:

```sql
-- filtro en el Table Editor
code ilike "PRUEBA-20261020-1430%"
```

Además hay dos archivos SQL listos para pegar en el **SQL Editor** de Supabase:

| Archivo | Para qué sirve |
|---|---|
| `scripts/supabase-verificar.sql` | Informe completo de los datos de la corrida (por módulo, con movimientos y conciliaciones) |
| `scripts/supabase-limpiar.sql` | Borra **solo** los datos de prueba (por prefijo), sin tocar los datos reales del Banco |

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
│   ├── api/                # API Routes (26 endpoints)
│   │   ├── auth/           # Login, logout, me, register
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
│   │   ├── configuracion/  # Estado del sistema
│   │   ├── dashboard/      # Estadísticas
│   │   └── siigo/          # Integración Siigo
│   ├── login/              # Página de login
│   ├── layout.tsx          # Layout raíz
│   └── page.tsx            # Página principal
├── components/             # Componentes React
│   ├── layout/             # Sidebar, Header, ProtectedLayout
│   ├── forms/              # FormField
│   └── ui/                 # Toast
├── lib/
│   ├── db/                 # Schema Drizzle + cliente + conexión
│   ├── services/           # Lógica de negocio (14 servicios)
│   ├── api/                # Respuestas y manejo de errores de la API
│   ├── auth/               # Sesión firmada + hash de contraseñas
│   ├── siigo/              # Formatos + exportador Excel
│   ├── validations/        # Schemas Zod (fuente única)
│   ├── utils/              # Utilidades (errores, números, fechas)
│   └── __tests__/          # Tests
├── types/                  # Tipos TypeScript (derivados del schema)
└── proxy.ts                # Protección de rutas (convención Next.js 16)
drizzle/                    # Migraciones SQL + seed
scripts/                    # Utilidades de base de datos y pruebas
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
| FASE 8 | ✅ Implementada | Integración Siigo (plantilla PENDIENTE de validación) |
| FASE 9 | ✅ Completado | Pruebas unitarias, end-to-end y de interfaz |
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
