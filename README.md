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
| Autenticación | Supabase Auth |
| Validación | Zod |
| Estado/Cache | TanStack React Query |
| Gráficos | Recharts |
| Excel | SheetJS (xlsx) |
| Iconos | Lucide React |
| Despliegue | Vercel + Supabase |

---

## Colores Institucionales

| Color | Código | Uso |
|-------|--------|-----|
| Blanco | #FFFFFF | Fondos, texto principal |
| Primario | #48151C | Botones, navegación, énfasis |
| Negro | #000000 | Texto, bordes |
| Acento | #D5C58A | Alertas, detalles, badges |

---

## Inicio Rápido

### Requisitos

- Node.js 18+
- npm o yarn
- Cuenta en Supabase

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/OscarCasallasDev/banco-alimentos-inventarios.git

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local

# Ejecutar en desarrollo
npm run dev
```

### Variables de Entorno

Crea un archivo `.env.local` con las siguientes variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hszylkcojdjnbjatuhnv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4
DATABASE_URL=postgresql://postgres.hszylkcojdjnbjatuhnv:postgres@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

---

## Credenciales de Acceso

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | SUPERADMIN |

---

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── (protected)/        # Rutas protegidas
│   ├── api/                # API Routes
│   ├── login/              # Página de login
│   ├── layout.tsx          # Layout raíz
│   └── page.tsx            # Página principal
├── components/             # Componentes React
├── lib/                    # Lógica y utilidades
├── types/                  # Tipos TypeScript
└── hooks/                  # Custom hooks
drizzle/                    # Migraciones SQL
docs/                       # Documentación
```

---

## Fases del Proyecto

| Fase | Estado | Descripción |
|------|--------|-------------|
| FASE 0 | Completado | Análisis del entorno |
| FASE 1 | Completado | Arquitectura + Scaffold |
| FASE 2 | Completado | Base de datos (schema + migraciones + seed) |
| FASE 3 | Completado | Autenticación + Layout |
| FASE 4 | Completado | Productos + Bodegas (CRUD) |
| FASE 5 | Completado | Inventario + Entradas |
| FASE 6 | Completado | Salidas (Pedido → Factura → Recibo → Despacho) |
| FASE 7 | Completado | Auditoría + Reportes |
| FASE 8 | Parcial | Integración Siigo (PENDIENTE validación) |
| FASE 9 | Pendiente | Pruebas |
| FASE 10 | Pendiente | Deploy |

---

## Documentación

- [Arquitectura](./docs/ARQUITECTURA.md)
- [Modelo de Datos](./docs/MODELO_DATOS.md)
- [Integración Siigo](./docs/INTEGRACION_SIIGO.md)
- [Resumen de Implementación](./docs/RESUMEN_IMPLEMENTACION.md)

---

## Licencia

Proyecto educativo — Universidad de Ibagué, Programa Paz y Región 2026B

---

**Desarrollador**: Oscar Daniel Casallas Lozano
**Organización**: Banco Arquidiocesano de Alimentos de Ibagué
