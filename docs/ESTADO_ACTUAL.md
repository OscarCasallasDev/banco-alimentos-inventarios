# Estado Actual del Proyecto

**Última actualización:** 2026-11-10

---

## Resumen Ejecutivo

El sistema está en la **primera etapa** de la ruta acordada con el Banco:
la **comunicación entre el almacenista y la persona encargada del despacho**.

El flujo operativo completo funciona de extremo a extremo:

```
Almacenista ──► nueva orden de pedido ──► ORDEN DE PEDIDO imprimible (OP-2026-0001)
                                                            │
Despacho ────────► recibe, verifica y continúa en Siigo Pyme ◄─┘
```

Todo lo anterior del proyecto **se conserva**: 33 tablas del modelo original,
los 14 módulos previos, sus rutas, sus datos y sus pruebas. Los módulos que
no se necesitan en esta etapa están **en espera mediante banderas
reversibles**, no eliminados.

---

## ✅ Estado por capa

### Base de datos — COMPLETO

| Elemento | Estado |
|---|---|
| Tablas | **49** (33 originales + 16 nuevas de esta etapa) |
| Enums | 28 |
| Migraciones | `0000` … `0011`, idempotentes y aditivas |
| Script de instalación | `npm run db:setup` (re-ejecutable) |

**Migraciones nuevas de esta etapa:**

| Migración | Contenido |
|---|---|
| `0009_salidas_siigo_import.sql` | Importación desde Siigo, salidas de almacén, reservas, mapeo de bodegas, banderas de módulo |
| `0010_flags_programas.sql` | Banderas de módulo y catálogo base de programas |
| `0011_destinos_orden_pedido.sql` | Catálogo de destinos, ubicaciones de Siigo, movimientos del reporte resumen, peso/vencimiento en las líneas, campos de bodega |

### Importación desde Siigo Pyme — COMPLETO

Se procesan **los dos reportes** que genera Siigo, con tratamiento distinto
porque no dicen lo mismo:

| Reporte | Qué actualiza | Saldos |
|---|---|---|
| **Detallado** (65.832 filas) | existencias, movimientos, catálogo | **Sí** (trae `CANT. ANTERIOR`) |
| **Resumen por bodega** (2.209 filas) | bodegas, ubicaciones, productos, movimientos agregados | **No** (su columna de diferencia es el movimiento neto) |

- Lector propio del `.xlsx`: **1.830 ms / 212 MB** frente a **30.065 ms / 900 MB** de SheetJS.
- Idempotencia en 5 capas (hash del archivo, corrida, lote, fila, clave natural del movimiento).
- Importar el mismo archivo **no duplica nada**.
- Detecta **1 fila corrupta** en el archivo real y marca **1 grupo** para revisión.

Ver `docs/IMPORTACION_SIIGO.md`.

### Salidas de almacén / Orden de pedido — COMPLETO

- Formulario con destino (autocompletado), bodega, productos (autocompletado
  desde el inventario importado) y líneas editables con cantidad, unidad,
  peso, unidad de peso y fecha de vencimiento.
- Numeración única e irrepetible `OP-2026-0001`.
- Documento imprimible **ORDEN DE PEDIDO** (carta, con logo, encabezados
  repetidos, espacios de firma y reimpresión idéntica).
- Estados: `DRAFT` → `GENERATED` → `DELIVERED` → `CONFIRMED_SIIGO` → `CANCELLED`.

### Control de existencias — COMPLETO (sin doble descuento)

- La existencia informada por Siigo **nunca** se modifica desde la aplicación.
- Las salidas **reservan** cantidades; la reserva se libera cuando una
  importación **demuestra** que Siigo ya reflejó el descuento.
- Verificado con `npm run test:reconciliacion`: 100 → salida de 50 → disponible
  50 → nueva importación con 50 → **disponible 50 (no 0)**.

### Roles y permisos — COMPLETO

- Rol nuevo `ALMACENISTA` (además de `SUPERADMIN`, `ADMIN`, `RECEPCION`,
  `DESPACHO`, `CONTABILIDAD`).
- Permisos **configurables** en la tabla `roles.permissions`.
- Validación en el **backend** (`requireRole`, `requirePermission`,
  `requireModuleAccess`), no solo ocultando botones.

### Módulos en espera — REVERSIBLES

Se desactivan con una bandera desde **Configuración → Módulos del sistema**.
Sus rutas, tablas y datos siguen intactos.

| Módulo | Estado |
|---|---|
| Entradas, Pedidos, Facturas, Recibos, Auditoría, Lotes, Movimientos, Reportes, Productos, Despachos (flujo contable) | En espera |

---

## 🧪 Pruebas

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias + integración | `npm run test:run` | **154 / 154** ✅ |
| Flujo operativo (orden de pedido) | `npm run test:orden` | **42 / 42** ✅ |
| Reconciliación (sin doble descuento) | `npm run test:reconciliacion` | **9 / 9** ✅ |
| Tipos | `npm run typecheck` | ✅ |
| Lint | `npm run lint` | ✅ 0 errores |
| Build | `npm run build` | ✅ |

> Las pruebas de integración usan la base de datos real: **no deben
> ejecutarse en paralelo** con una importación (`npm run siigo:import`),
> porque comparten las mismas tablas.

---

## 🔧 Pendientes

### Alta prioridad

1. **Mapeo de las 7 bodegas de Siigo** con las de la aplicación (los
   nombres llegan truncados en el reporte).
2. **Reporte de existencias actuales**: el reporte resumen no trae saldos.
   Para refrescar existencias cada 1–2 horas sin el reporte detallado hace
   falta un reporte con saldo inicial o final.
3. **Catálogo oficial de parroquias y grupos de familia** para reemplazar los
   10 destinos de demostración.

### Media prioridad

4. Rotar las claves de Supabase que quedaron en el historial de Git.
5. Migrar el hash de contraseñas a bcrypt/argon2.
6. Impresión directa a PDF desde el servidor (hoy se usa el diálogo del
   navegador, igual que el comprobante de entrada).
7. Rate limiting en el login y reglas de RLS en Supabase.

### Baja prioridad

8. Migrar el resto de las páginas a React Query.
9. Exportación de reportes a Excel.

---

## ▶️ Inicio rápido

```bash
npm install
npm run db:setup        # aplica las migraciones (idempotente)
npm run dev             # http://localhost:3000
```

**Usuario:** `admin` · **Contraseña:** `admin123`

### Cargar el inventario de Siigo

```bash
npm run siigo:import -- "tests/fixtures/siigo-reporte-inventarios.xlsx"
npm run siigo:import -- "tests/fixtures/siigo-reporte-resumido.xlsx"
```

### Sincronización automática (opcional)

```bash
npm run agent:install   # registra la Tarea Programada de Windows (cada hora)
npm run agent:run       # prueba manual del agente
```

---

## 📌 Decisiones técnicas destacadas

| Decisión | Motivo |
|---|---|
| Lector propio del `.xlsx` | 12× más rápido y 4× menos memoria que SheetJS; el Excel nunca se procesa en el navegador |
| `INSERT … SELECT … FROM unnest(...)` | Un parámetro por columna en vez de uno por celda: la importación del resumen pasó de 440 s a 7 s |
| Código de producto normalizado a `LIN-GRUP-ELEMEN` | Los dos reportes de Siigo codifican el producto distinto; sin normalizar el catálogo queda duplicado |
| `siigo_balances` separado del `inventory` legacy | Las existencias de Siigo no tienen lotes; mezclarlas contaminaría el módulo de trazabilidad por lotes |
| Reservas en vez de descuento directo | Evita el doble descuento cuando Siigo refleja el movimiento |
| Banderas en base de datos | Activar o desactivar módulos sin tocar código ni despliegues |

---

*Desarrollador: Oscar Daniel Casallas Lozano · Programa: Paz y Región 2026B — Universidad de Ibagué*
