# Guía de Deploy — Vercel + Supabase

## Sistema de Gestión de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## Resumen

El proyecto se despliega en **Vercel** (frontend + API Routes) y usa
**Supabase PostgreSQL** como base de datos.

El error más habitual al desplegar es que **el proyecto de Vercel no tiene
variables de entorno configuradas**. En ese caso la aplicación compila
perfectamente, la página de login carga, pero al iniciar sesión la API
responde `500` con:

```
Error: DATABASE_URL no está definida. Configura la variable de entorno en .env.local
```

Ese mensaje aparece en los registros de Vercel
(*Deployments → tu despliegue → Logs → Runtime Logs*).

---

## Requisitos Previos

1. **Cuenta en GitHub** — Para el repositorio del código
2. **Cuenta en Vercel** — Para el despliegue del frontend
3. **Cuenta en Supabase** — Para la base de datos
4. **Node.js 18+** — Para desarrollo local

---

## Paso 1: Configurar Supabase

### 1.1 Crear proyecto en Supabase

1. Ir a [https://supabase.com](https://supabase.com)
2. Crear un nuevo proyecto
3. Configurar la contraseña de la base de datos
4. Seleccionar la región más cercana a las funciones de Vercel

> **Región y Vercel:** el plan Hobby de Vercel despliega las funciones
> únicamente en `iad1` (Virginia, EE. UU.). Si el proyecto de Supabase está
> en otra región (por ejemplo `us-west-2`), cada petición cruza el país y la
> base de datos responde más lento. No es un error, pero sí una latencia
> añadida. Si más adelante se contrata un plan con varias regiones, conviene
> alinear `regions` en `vercel.json` con la región de Supabase.

### 1.2 Ejecutar migraciones

En el editor SQL de Supabase, ejecutar los archivos de `drizzle/` en orden:

```sql
-- Ejecutar los archivos de drizzle/ en orden cronológico.
-- Esto crea todas las tablas y tipos ENUM
```

### 1.3 Ejecutar seed data

```sql
-- Ejecutar el archivo drizzle/seed.sql
-- Esto inserta los datos de prueba (incluye el usuario admin / admin123)
```

### 1.4 Configurar Row Level Security (RLS)

La aplicación se conecta a PostgreSQL directamente (no por PostgREST) con el
usuario `postgres`, por lo que las políticas de RLS **no** se aplican a este
acceso. Aun así, se recomienda habilitarlas para proteger el acceso por la
API de Supabase:

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ... (resto de tablas del modelo)
```

### 1.5 Obtener credenciales

En Supabase, ir a **Settings > API** y copiar:
- **Project URL**: `https://xxxxx.supabase.co`
- **Publishable key**: `sb_publishable_xxxxx`
- **Secret key**: `sb_secret_xxxxx` (NO exponer en frontend)

### 1.6 Obtener la URL de conexión

En **Settings > Database → Connection string**, copiar la del **Pooler** en
modo **Session** (puerto `5432`):

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

> ⚠️ **No usar el modo Transaction (puerto 6543).** Medido en este proyecto,
> ese modo se bloquea de forma intermitente al encadenar una transacción con
> consultas paralelas (postgres.js las canaliza por la misma conexión) y
> deja la petición colgada para siempre. Además, el modo Session es el
> único que respeta correctamente los `pg_advisory_xact_lock` que usa el
> sistema para serializar salidas concurrentes.

---

## Paso 2: Configurar Variables de Entorno

### 2.1 En desarrollo local (.env.local)

Copiar `.env.example` a `.env.local` y completar los valores:

```bash
cp .env.example .env.local
```

### 2.2 En Vercel (obligatorio)

**Settings → Environment Variables** y agregar las siguientes variables para
**los tres entornos** (Production, Preview y Development):

| Nombre | Tipo | Valor |
|--------|------|-------|
| `DATABASE_URL` | **Secret** | URL del pooler en modo sesión (puerto 5432) |
| `DATABASE_FALLBACK_URLS` | Secret | Vacío (ver nota abajo) |
| `DATABASE_POOL_MAX` | Config | `2` en Vercel |
| `DATABASE_IDLE_TIMEOUT` | Config | `30` |
| `SUPABASE_URL` | **Secret** | `https://[PROJECT_REF].supabase.co` |
| `SUPABASE_SECRET_KEY` | **Secret** | `sb_secret_...` |
| `SUPABASE_PUBLISHABLE_KEY` | Config | `sb_publishable_...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `https://[PROJECT_REF].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | `sb_publishable_...` |
| `SESSION_SECRET` | **Secret** | 64 caracteres hexadecimales |

Generar el `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **`NEXT_PUBLIC_*` se incrusta en el bundle del navegador durante el
> BUILD.** Por eso deben existir en el entorno del proyecto *antes* de que
> corra `next build`. Si se añaden después, hay que volver a desplegar.

#### Sincronización automática

En lugar de copiar las variables a mano, existe un script que toma los
valores de `.env.local` y los registra en Vercel (production, preview y
development) usando la API REST:

```bash
npm run vercel:env            # sincroniza
npm run vercel:env -- --dry-run   # muestra qué haría, sin cambiar nada
```

Requiere haber hecho `npx vercel login` una vez. El script aplica unos
valarios distintos en Vercel por las restricciones del entorno serverless
(`DATABASE_POOL_MAX=2`, `DATABASE_IDLE_TIMEOUT=30` y
`DATABASE_FALLBACK_URLS` vacío).

> **Sobre `DATABASE_FALLBACK_URLS`:** se deja vacío a propósito. La
> aplicación tiene lógica de failover entre varias URLs, pero el único
> candidato adicional posible (el pooler en modo transacción, 6543) se
> cuelga de forma intermitente. Un respaldo que cuelga es **peor** que no
> tener respaldo: el error real se reporta al instante con la conexión
> principal.

---

## Paso 3: Desplegar en Vercel

### 3.1 Opción A: Despliegue automático desde GitHub (recomendada)

1. Subir el código a GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/OscarCasallasDev/banco-alimentos-inventarios.git
   git push -u origin main
   ```

2. En Vercel:
   - Ir a **Add New > Project**
   - Seleccionar el repositorio de GitHub
   - Configurar las variables de entorno (Paso 2.2)
   - Hacer clic en **Deploy**

> El repositorio está conectado a GitHub con la rama de producción `main`.
> Cada `git push` a `main` dispara un despliegue automático.

### 3.2 Opción B: Despliegue manual con Vercel CLI

```bash
npx vercel login
npx vercel link --yes --project banco-alimentos-inventarios
npx vercel --prod
```

---

## Paso 4: Verificar el Despliegue

### 4.1 Verificar que la aplicación esté funcionando

1. Abrir la URL de Vercel en el navegador
2. Verificar que la página de login cargue correctamente
3. Iniciar sesión con las credenciales de prueba:
   - Usuario: `admin`
   - Contraseña: `admin123`

### 4.2 Verificar la conexión a Supabase

```bash
# Desde el equipo, con la CLI de Vercel conectada al proyecto
npx vercel logs --deployment <URL-del-despliegue>
```

Los errores de base de datos aparecen con el prefijo `[<módulo>]`.

### 4.3 Prueba automatizada

```bash
# Login + recorrido de los módulos contra el despliegue
E2E_URL=https://banco-alimentos-inventarios.vercel.app npm run test:e2e
```

---

## Paso 5: Configurar Dominio Personalizado (Opcional)

1. En Vercel, ir a **Settings > Domains**
2. Agregar tu dominio personalizado
3. Configurar los registros DNS según las instrucciones de Vercel

---

## Límites conocidos del despliegue en Vercel

### 15 conexiones simultáneas a la base de datos

El pooler de Supabase en modo sesión admite un máximo de **15 conexiones
simultáneas para todo el proyecto**. En Vercel cada instancia de función es
un proceso independiente, así que el número de conexiones crece con el
número de instancias activas.

Por eso `DATABASE_POOL_MAX` es `2` en producción: con 2 conexiones por
instancia, el sistema tolera hasta 7 instancias concurrentes antes de
agotar el pool.

Si aparece el error:

```
(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
```

significa que se alcanzó el límite. La aplicación lo reconoce y responde
`503 DATABASE_UNAVAILABLE` en lugar de un error genérico. Para resolverlo:
reducir `DATABASE_POOL_MAX` a `1`, o ampliar el pool de Supabase desde el
panel (proyectos de pago permiten configurarlo).

### Instancias congeladas

Vercel congela las instancias que quedan inactivas. Un socket congelado
puede morir en silencio y dejar una conexión «zombi» que la siguiente
petición intenta reutilizar. `DATABASE_IDLE_TIMEOUT=30` cierra las
conexiones ociosas antes de que ocurra, de modo que la siguiente petición
abre una conexión nueva (el handshake TLS con Supabase cuesta ~0,5 s).

---

## Solución de Problemas

### Error: "DATABASE_URL no está definida"

- El proyecto de Vercel **no tiene variables de entorno configuradas**.
- Revisar **Settings → Environment Variables** del proyecto.
- Alternativa: `npm run vercel:env` para sincronizarlas desde `.env.local`.

### Error: "SESSION_SECRET no está definida"

- Falta `SESSION_SECRET` en el entorno de Vercel. Debe tener al menos
  32 caracteres.

### Error: "Failed to fetch"

- Verificar que las variables de entorno estén correctas
- Verificar que las políticas CORS estén configuradas en Supabase

### Error: "Invalid credentials"

- Verificar que el usuario admin exista en la base de datos
- Verificar que el hash de la contraseña sea correcto
- El seed (`drizzle/seed.sql`) crea el usuario `admin` / `admin123`

### Error: "no hay conexión con la base de datos" (503)

- Consultar los registros de Vercel para ver el error real.
- Verificar la URL de `DATABASE_URL` (pooler, modo sesión, puerto 5432).
- Ejecutar `npm run db:check` para probar la conexión desde el equipo.

---

## Estructura de Producción

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend                        │   │
│  │  - Páginas estáticas                                 │   │
│  │  - API Routes                                        │   │
│  │  - Server Components                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Database                     │   │
│  │  - Tablas                                            │   │
│  │  - RLS Policies                                      │   │
│  │  - Triggers                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Comandos Útiles

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Ejecutar pruebas
npm run test:run

# Desplegar en producción
npx vercel --prod

# Sincronizar variables de entorno con Vercel
npm run vercel:env

# Ver variables registradas en Vercel
npx vercel env ls

# Ver los registros de una ejecución
npx vercel logs --deployment <URL>
```

---

## Credenciales de Acceso

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | SUPERADMIN |

> Cambiar esta contraseña antes de operar con datos reales.

---

*Última actualización: FASE 10 — Deploy*
