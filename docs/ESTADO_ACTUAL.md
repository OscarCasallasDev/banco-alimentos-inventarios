# Estado Actual del Proyecto

**Última actualización:** 2026-10-20

---

## Resumen Ejecutivo

El sistema está **conectado y funcional de extremo a extremo** contra la base de
datos real de Supabase. Todos los módulos (catálogo, inventario, entradas,
flujo de salida, auditoría, reportes, dashboard, usuarios e integración
Siigo) están implementados, probados y verificados con una suite end-to-end
de **60 pruebas** que se ejecuta contra la aplicación en ejecución.

---

## ✅ Estado por capa

### Base de datos — COMPLETO Y CONECTADO
- 20 tablas de negocio + tabla de control de migraciones (`_migrations`)
- 16 tipos ENUM
- Migraciones `0000` … `0003` aplicadas y registradas
- Seed completo y coherente (productos, bodegas, inventario, documentos y su detalle)
- Script de instalación idempotente: `npm run db:setup`

### Capa de acceso a datos — COMPLETA
- **Drizzle ORM** sobre `postgres.js` (única capa de acceso a datos)
- Conexión directa o *pooler* de Supabase (se detecta sola)
- Transacciones reales para las operaciones que mueven inventario
- Convenciones unificadas: la base usa `snake_case`, la aplicación `camelCase`

### Autenticación — COMPLETA
- Cookie `HttpOnly` firmada con HMAC-SHA256 (no falsificable)
- `src/proxy.ts` protege páginas y APIs (401 en JSON para las APIs)
- Validación de sesión en el servidor en el layout protegido
- Contraseñas con SHA-256 (deuda técnica documentada)

### API — COMPLETA (26 rutas)
| Módulo | Rutas | Estado |
|---|---|---|
| Autenticación | `login`, `logout`, `me`, `register` | ✅ |
| Productos | `GET/POST /api/productos`, `GET/PUT/DELETE /api/productos/[id]` | ✅ |
| Bodegas | `GET/POST /api/bodegas`, `GET/PUT/DELETE /api/bodegas/[id]` | ✅ |
| Categorías | `GET/POST /api/categorias` | ✅ |
| Inventario | `GET /api/inventario` | ✅ |
| Entradas | `GET/POST /api/entradas`, `POST /api/entradas/[id]/confirmar` | ✅ |
| Pedidos | `GET/POST /api/pedidos` | ✅ |
| Facturas | `GET/POST /api/facturas` | ✅ |
| Recibos | `GET/POST /api/recibos` | ✅ |
| Despachos | `GET/POST /api/despachos` | ✅ |
| Auditoría | `GET/POST /api/auditoria` | ✅ |
| Dashboard | `GET /api/dashboard` | ✅ |
| Reportes | `GET /api/reportes` | ✅ |
| Usuarios | `GET/POST /api/usuarios`, `GET/PUT/DELETE /api/usuarios/[id]` | ✅ |
| Configuración | `GET /api/configuracion` | ✅ |
| Siigo | `POST /api/siigo/export` | ✅ DEMO |

Todas las rutas: validación Zod con schemas compartidos, sesión obligatoria,
manejo centralizado de errores y bitácora de auditoría.

### Frontend — COMPLETO (14 páginas)
Dashboard, Entradas, Pedidos, Facturas, Recibos, Despachos, Auditoría,
Inventario, Productos, Bodegas, Reportes, Usuarios, Integración Siigo y
Configuración. Las 14 renderizan correctamente y la redirección sin sesión
funciona.

### Reglas de negocio — IMPLEMENTADAS Y VERIFICADAS
1. No se aceptan cantidades cero ni negativas.
2. Toda entrada confirmada suma al inventario.
3. Un despacho por encima de la existencia se rechaza y **no** altera el stock.
4. Cada recibo genera un único despacho (no se puede descontar dos veces).
5. Las entradas y auditorías en DRAFT se confirman con un endpoint dedicado.
6. La auditoría toma la existencia **real** del sistema, no la que envía el cliente.
7. Productos, bodegas y usuarios se desactivan; nunca se borra su historial.
8. Todo movimiento queda registrado en `inventory_movements` con su saldo.
9. Todo documento queda registrado en `documents` y en `audit_logs`.

### Pruebas — AUTOMATIZADAS
| Suite | Comando | Resultado |
|---|---|---|
| Unitarias (validaciones + exportador Siigo) | `npm run test:run` | 34 ✅ |
| End-to-end (todos los módulos por HTTP) | `npm run test:e2e` | 60 ✅ |
| Interfaz (render de las 14 páginas) | `npm run check:ui` | 15 ✅ |
| Tipos | `npm run typecheck` | ✅ |
| Lint | `npm run lint` | 0 errores ✅ |

---

## 🔧 Pendientes (por prioridad)

### Alta prioridad
1. **Rotar las claves de Supabase**: la clave secreta estuvo hardcodeada en
   scripts antiguos que ya están en el historial de git. Genera una nueva en
   *Supabase Dashboard → Project Settings → API* y actualiza `.env.local`.
2. **Validar los formatos Siigo** con el Banco (ver más abajo).
3. **Reglas de RLS** en Supabase si se decide exponer el acceso directo desde
   el cliente. Hoy la aplicación accede con el rol de servicio y toda la
   validación vive en el servidor.

### Media prioridad
4. **Paginación y filtros** en los listados (hoy devuelven todo).
5. **Migrar el hash de contraseñas** a bcrypt/argon2 o Supabase Auth.
6. **Rate limiting** en el endpoint de login.
7. **Impresión/PDF** de los soportes físicos.
8. **Alertas automáticas** de stock bajo.

### Baja prioridad
9. Migrar las páginas a React Query (hoy usan `fetch` + `useState`).
10. Componentes reutilizables de formulario (`FormField` ya existe, falta Adoption).
11. Exportación de reportes a Excel/PDF.
12. Respaldo automático de la base de datos.

---

## 📋 Pendientes de validación con el Banco

- [ ] Significado exacto de los formatos E1/E3/N3/N5
- [ ] Diferencia funcional entre SF1 y F2
- [ ] Relación de R1/R2/R3/R4 con SF1/F2
- [ ] Plantillas ExcelSiigo (GET/PUSH)
- [ ] Nombres definitivos de las bodegas virtuales
- [ ] Formato físico de los soportes
- [ ] Cuenta contable y centro de costo para el formato N5
- [ ] Precio unitario de los productos (hoy vive en Siigo Pyme)

---

## 🚀 Inicio rápido

```bash
npm install
cp .env.example .env.local     # y completar con los datos de Supabase

npm run db:check               # verifica la conexión y ajusta DATABASE_URL
npm run db:setup               # aplica migraciones y carga la semilla
npm run dev                    # http://localhost:3000
```

**Usuario:** `admin` · **Contraseña:** `admin123`

Comandos de verificación:

```bash
npm run typecheck   # TypeScript estricto
npm run lint        # ESLint
npm run test:run    # pruebas unitarias
npm run test:e2e    # prueba end-to-end de todos los módulos
npm run check:ui    # render de todas las páginas
```

Para dejar la base de datos como recién salida de la semilla:
`npm run db:setup:reset`

---

## 📊 Progreso por FASE

| FASE | Descripción | Estado |
|------|-------------|--------|
| FASE 0 | Análisis del entorno | ✅ Completado |
| FASE 1 | Arquitectura + Scaffold | ✅ Completado |
| FASE 2 | Base de datos (schema + migraciones + seed) | ✅ Completado |
| FASE 3 | Autenticación + Layout | ✅ Completado |
| FASE 4 | Productos + Bodegas (CRUD) | ✅ Completado |
| FASE 5 | Inventario + Entradas | ✅ Completado |
| FASE 6 | Salidas (Pedido → Factura → Recibo → Despacho) | ✅ Completado |
| FASE 7 | Auditoría + Reportes | ✅ Completado |
| FASE 8 | Integración Siigo (DEMO) | ✅ Implementada (plantilla PENDIENTE) |
| FASE 9 | Pruebas | ✅ Unitarias + E2E + UI |
| FASE 10 | Deploy | ⏳ Pendiente de rotar claves y configurar Vercel |

---

## 🔐 Notas de seguridad

- **NUNCA** subir `.env.local` al repositorio (ya está en `.gitignore`).
- **NUNCA** exponer la clave secreta de Supabase: solo se usa en el servidor.
- Los scripts de `scripts/` leen las credenciales del `.env.local`; no hay
  secretos en el código.
- Las contraseñas usan SHA-256 por compatibilidad con la semilla. Migrar a
  bcrypt/argon2 antes de producción.
- La sesión viaja en cookie `HttpOnly` firmada (no falsificable desde el cliente).
- No hay rate limiting en el login ni protección CSRF.

---

## 📞 Soporte

- **Desarrollador:** Oscar Daniel Casallas Lozano
- **Programa:** Paz y Región 2026B — Universidad de Ibagué
