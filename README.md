# Sistema de Gestión, Trazabilidad y Conciliación de Inventarios

## Banco Arquidiocesano de Alimentos de Ibagué

Sistema web de gestión de inventarios que funciona como solución complementaria a Siigo Pyme, especializado en gestión, control, trazabilidad y conciliación de inventarios.

---

## Características

- **Dashboard** con resumen general del sistema
- **Gestión de productos** (CRUD completo)
- **Bodegas virtuales** configurables
- **Entradas** con formatos E1/E3/N3/N5
- **Salidas** con flujo Pedido → Factura → Recibo → Despacho
- **Inventario** calculado desde movimientos
- **Auditoría** de inventario (sistema vs físico)
- **Reportes** exportables a Excel
- **Integración Siigo** (preparada, estado DEMO)
- **Responsive** (Desktop / Tablet / Móvil)
- **Autenticación** con roles y permisos

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript (estricto) |
| UI | React 19 + Tailwind CSS 4 |
| Base de datos | Supabase PostgreSQL |
| ORM | Drizzle ORM |
| Autenticación | Supabase Auth |
| Validación | Zod |
| Estado/Cache | TanStack React Query |
| Gráficos | Recharts |
| Excel | SheetJS (xlsx) |
| Despliegue | Vercel + Supabase |

---

## Inicio Rápido

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd banco-alimentos-inventarios
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales de Supabase.

### 4. Configurar la base de datos

```bash
# Generar migraciones
npx drizzle-kit generate

# Aplicar migraciones
npx drizzle-kit push

# Cargar datos DEMO
# (Ejecutar drizzle/seed.sql en tu cliente de Supabase)
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### 6. Credenciales de demostración

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin123 | SUPERADMIN |

---

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── (protected)/        # Rutas protegidas
│   ├── api/                # API Routes
│   ├── login/              # Login
│   └── layout.tsx          # Layout raíz
├── components/             # Componentes React
│   ├── ui/                 # Componentes base
│   ├── layout/             # Sidebar, Header
│   ├── forms/              # Formularios
│   ├── tables/             # Tablas
│   ├── documents/          # Soportes
│   └── siigo/              # Integración Siigo
├── lib/                    # Lógica y utilidades
│   ├── db/                 # Drizzle schema + client
│   ├── auth/               # Autenticación
│   ├── services/           # Lógica de negocio
│   ├── validations/        # Schemas Zod
│   ├── reports/            # Generación Excel
│   └── utils/              # Utilidades
├── types/                  # Tipos TypeScript
└── hooks/                  # Custom hooks
drizzle/                    # Migraciones SQL
docs/                       # Documentación
```

---

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | Linter ESLint |
| `npx drizzle-kit generate` | Generar migraciones |
| `npx drizzle-kit push` | Aplicar migraciones |
| `npx drizzle-kit studio` | Studio de Drizzle |

---

## Fases del Proyecto

| Fase | Estado | Descripción |
|---|---|---|
| FASE 0 | ✅ | Análisis del entorno |
| FASE 1 | ✅ | Arquitectura + Scaffold |
| FASE 2 | ⏳ | Base de datos (schema + migraciones + seed) |
| FASE 3 | ⏳ | Autenticación + Layout |
| FASE 4 | ⏳ | Productos + Bodegas (CRUD) |
| FASE 5 | ⏳ | Inventario + Entradas |
| FASE 6 | ⏳ | Salidas (Pedido → Factura → Recibo → Despacho) |
| FASE 7 | ⏳ | Auditoría + Reportes |
| FASE 8 | ⏳ | Integración Siigo (DEMO) |
| FASE 9 | ⏳ | Pruebas |
| FASE 10 | ⏳ | Deploy |

---

## Integración con Siigo Pyme

El sistema está preparado para integrarse con Siigo Pyme mediante ExcelSiigo (GET/PUSH).

**Estado actual**: DEMO (simulado)

Ver `docs/INTEGRACION_SIIGO.md` para más detalles.

---

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Modelo de Datos](docs/MODELO_DATOS.md)
- [Integración Siigo](docs/INTEGRACION_SIIGO.md)
- [Reglas del Proyecto](AGENTS.md)

---

## Licencia

Proyecto educativo — Universidad de Ibagué, Programa Paz y Región 2026B.

---

*Desarrollado por Oscar Daniel Casallas Lozano*
