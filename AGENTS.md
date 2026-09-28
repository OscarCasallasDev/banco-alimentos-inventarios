# AGENTS.md — Reglas Permanentes del Proyecto

## Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. IDENTIDAD DEL PROYECTO

- **Nombre**: Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
- **Organización**: Banco Arquidiocesano de Alimentos de Ibagué
- **Desarrollador**: Oscar Daniel Casallas Lozano
- **Programa**: Paz y Región 2026B — Universidad de Ibagué
- **Sistema contable existente**: Siigo Pyme (NO reemplazar, complementar)

---

## 2. STACK TECNOLÓGICO

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
| Iconos | Lucide React |
| Despliegue | Vercel + Supabase |

---

## 3. ESTRUCTURA DE CARPETAS

```
src/
├── app/                    # Next.js App Router
│   ├── (protected)/        # Rutas protegidas (autenticadas)
│   ├── api/                # API Routes (backend)
│   ├── login/              # Página de login
│   ├── layout.tsx          # Layout raíz
│   └── page.tsx            # Página principal
├── components/
│   ├── ui/                 # Componentes base (shadcn/ui)
│   ├── layout/             # Sidebar, Header, Nav
│   ├── forms/              # Formularios reutilizables
│   ├── tables/             # Tablas de datos
│   ├── documents/          # Soportes/impresión
│   └── siigo/              # Integración Siigo
├── lib/
│   ├── db/                 # Drizzle schema + client
│   ├── auth/               # Autenticación
│   ├── services/           # Lógica de negocio
│   ├── validations/        # Schemas Zod
│   ├── reports/            # Generación Excel
│   └── utils/              # Utilidades
├── types/                  # Tipos TypeScript
└── hooks/                  # Custom React hooks
drizzle/                    # Migraciones SQL
docs/                       # Documentación técnica
```

---

## 4. REGLAS DE CÓDIGO

### TypeScript
- Usar TypeScript estricto SIEMPRE
- Prohibido `any` sin justificación documentada
- Crear tipos/interfaces para todas las entidades
- Usar `type` para uniones, `interface` para objetos

### Componentes
- Componentes funcionales con hooks
- Separar UI de lógica de negocio
- Usar React Query para datos del servidor
- Validación en frontend Y backend

### Base de datos
- Tablas normalizadas (3NF)
- UUIDs como claves primarias
- Claves foráneas con constraints
- Índices en consultas frecuentes
- RLS (Row Level Security) en Supabase
- Nunca eliminar datos históricos (soft delete)

### Seguridad
- NUNCA exponer service_role_key
- NUNCA hardcodear credenciales
- Variables de entorno para secretos
- Validación backend obligatoria
- Hash seguro de contraseñas (Supabase Auth)
- Logs de operaciones críticas

---

## 5. REGLAS DE NEGOCIO FUNDAMENTALES

1. **No cantidades negativas** en entradas
2. **No cantidades cero**
3. **No salidas superiores a existencia** disponible
4. **No eliminar productos** con historial (soft delete)
5. **No modificar movimientos** históricos directamente
6. **Toda entrada afecta** inventario
7. **Toda salida confirmada** disminuye inventario
8. **Toda operación** tiene usuario y fecha
9. **Toda salida** asociada a su flujo documental
10. **Información histórica** siempre trazable

---

## 6. INTEGRACIÓN CON SIIGO PYME

### Principios
- NO reemplazar Siigo Pyme
- NO inventar APIs ni comandos
- NO asumir estructuras no confirmadas
- Usar ExcelSiigo (GET/PUSH) cuando se valide

### Estados de integración
- **REAL**: Implementado y probado
- **DEMO**: Simulado con datos de prueba
- **PENDIENTE**: Requiere validación externa

### Pendientes de validación con el Banco
- Significado exacto formatos E1/E3/N3/N5
- Diferencia funcional SF1/F2
- Relación R1/R2/R3/R4 con SF1/F2
- Plantillas ExcelSiigo (GET/PUSH)
- Nombres definitivos de bodegas virtuales
- Formato físico de soportes

---

## 7. FLUJO DE TRABAJO

1. **FASE 0**: Análisis del entorno ✅
2. **FASE 1**: Arquitectura + Scaffold ✅
3. **FASE 2**: Base de datos (schema + migraciones + seed)
4. **FASE 3**: Autenticación + Layout
5. **FASE 4**: Productos + Bodegas (CRUD)
6. **FASE 5**: Inventario + Entradas
7. **FASE 6**: Salidas (Pedido → Factura → Recibo → Despacho)
8. **FASE 7**: Auditoría + Reportes
9. **FASE 8**: Integración Siigo (DEMO)
10. **FASE 9**: Pruebas
11. **FASE 10**: Deploy

---

## 8. CONVENCIONES

### Nombres
- Archivos de componentes: PascalCase (ej: `ProductTable.tsx`)
- Archivos de utilidades: camelCase (ej: `formatDate.ts`)
- Carpetas: kebab-case (ej: `integracion-siigo/`)
- Tablas DB: snake_case (ej: `inventory_movements`)
- Constantes: UPPER_SNAKE_CASE

### Commits
- Formato: `tipo(alcance): descripción`
- Tipos: feat, fix, docs, style, refactor, test, chore
- Ejemplo: `feat(productos): agregar CRUD de productos`

### Código
- Idioma del código: inglés (nombres de variables, funciones)
- Idioma de UI: español
- Idioma de documentación: español

---

## 9. PROHIBICIONES

- ❌ No usar `any` sin justificación
- ❌ No hardcodear credenciales o secretos
- ❌ No eliminar datos históricos
- ❌ No modificar movimientos confirmados
- ❌ No permitir salidas sin stock
- ❌ No mezclar lógica de Siigo con el resto
- ❌ No simular integraciones como si fueran reales
- ❌ No usar API de Siigo Nube como sustituto de Pyme
- ❌ No ejecutar PUSH real sin validación previa

---

## 10. CALIDAD

Antes de considerar terminado un módulo:
1. Implementar
2. Ejecutar
3. Probar
4. Detectar errores
5. Corregir
6. Verificar responsive
7. Verificar validaciones
8. Verificar base de datos
9. Verificar estados
10. Verificar que no rompa funcionalidades anteriores

---

## 11. DESPLIEGUE

- **Frontend**: Vercel (Git-based deployment)
- **Base de datos**: Supabase (PostgreSQL)
- **Variables de entorno**: Configuradas en Vercel + Supabase
- **NUNCA** subir secretos al repositorio

---

## 12. DOCUMENTACIÓN

Mantener actualizados:
- `docs/ARQUITECTURA.md` — Decisiones de arquitectura
- `docs/MODELO_DATOS.md` — Esquema de base de datos
- `docs/INTEGRACION_SIIGO.md` — Estado de integración
- `README.md` — Inicio rápido

---

*Última actualización: FASE 1 — Arquitectura + Scaffold*
