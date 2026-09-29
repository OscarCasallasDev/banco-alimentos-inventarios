# Guía de Deploy — Vercel + Supabase

## Sistema de Gestión de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

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
4. Seleccionar la región más cercana (us-east-1 para Colombia)

### 1.2 Ejecutar migraciones

En el editor SQL de Supabase, ejecutar:

```sql
-- Ejecutar el archivo drizzle/0000_wet_nighthawk.sql
-- Esto crea todas las tablas y tipos ENUM
```

### 1.3 Ejecutar seed data

```sql
-- Ejecutar el archivo drizzle/seed.sql
-- Esto inserta los datos de prueba
```

### 1.4 Configurar Row Level Security (RLS)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

### 1.5 Obtener credenciales

En Supabase, ir a **Settings > API** y copiar:
- **Project URL**: `https://xxxxx.supabase.co`
- **Publishable key**: `sb_publishable_xxxxx`
- **Service role key**: `sb_secret_xxxxx` (NO exponer en frontend)

---

## Paso 2: Configurar Variables de Entorno

### 2.1 En desarrollo local (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://hszylkcojdjnbjatuhnv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4
DATABASE_URL=postgresql://postgres.hszylkcojdjnbjatuhnv:postgres@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### 2.2 En Vercel

1. Ir a tu proyecto en Vercel
2. Ir a **Settings > Environment Variables**
3. Agregar las siguientes variables:

| Nombre | Valor |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key de Supabase |
| `DATABASE_URL` | URL de conexión a la base de datos |

---

## Paso 3: Desplegar en Vercel

### 3.1 Opción A: Despliegue automático desde GitHub

1. Subir el código a GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/OscarCasallasDev/banco-alimentos-inventarios.git
   git push -u origin main
   ```

2. En Vercel:
   - Ir a **Add New > Project**
   - Seleccionar el repositorio de GitHub
   - Configurar las variables de entorno
   - Hacer clic en **Deploy**

### 3.2 Opción B: Despliegue manual con Vercel CLI

1. Instalar Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Iniciar sesión:
   ```bash
   vercel login
   ```

3. Desplegar:
   ```bash
   vercel
   ```

4. Para producción:
   ```bash
   vercel --prod
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

1. Abrir la consola del navegador (F12)
2. Verificar que no haya errores de conexión
3. Probar a crear un producto o bodega

---

## Paso 5: Configurar Dominio Personalizado (Opcional)

1. En Vercel, ir to **Settings > Domains**
2. Agregar tu dominio personalizado
3. Configurar los registros DNS según las instrucciones de Vercel

---

## Solución de Problemas

### Error: "DATABASE_URL no está definida"

- Verificar que la variable de entorno esté configurada en Vercel
- Verificar que el formato de la URL sea correcto

### Error: "Failed to fetch"

- Verificar que las variables de entorno estén correctas
- Verificar que las políticas CORS estén configuradas en Supabase

### Error: "Invalid credentials"

- Verificar que el usuario admin exista en la base de datos
- Verificar que el hash de la contraseña sea correcto

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

# Ejecutar pruebas con cobertura
npm run test:coverage

# Desplegar en Vercel
vercel

# Desplegar en producción
vercel --prod
```

---

## Credenciales de Acceso

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | SUPERADMIN |

---

## Próximos Pasos

1. **Monitoreo**: Configurar Sentry para monitoreo de errores
2. **Backups**: Configurar backups automáticos en Supabase
3. **CI/CD**: Configurar GitHub Actions para integración continua
4. **Pruebas E2E**: Implementar pruebas end-to-end con Playwright

---

*Última actualización: FASE 10 — Deploy*
