# Ajustes del Banco — Orden de Pedido, Existencias e Impresión

**Fecha:** 2026-11-12
**Ámbito:** sistema existente del Banco Arquidiocesano de Alimentos de Ibagué
**Naturaleza:** ajustes sobre la aplicación actual. No se reconstruyó nada, no
se eliminó ningún módulo, tabla, ruta ni dato.

---

## 1. Resumen ejecutivo

| # | Ajuste | Estado |
|---|--------|--------|
| 1 | Existencias separadas por **código de Siigo + bodega** (fin de la consolidación por descripción) | ✅ |
| 2 | **Bodega de salida por línea de producto**, elegible y validada | ✅ |
| 3 | Opción **«Otro programa»** con nombre libre | ✅ |
| 4 | Cédula del almacenista en la orden | ✅ |
| 5 | Observaciones movidas después de la tabla de productos | ✅ |
| 6 | Recepción simplificada (sin hora manual, sin botón morado, sin anulación) | ✅ |
| 7 | CRUD de órdenes: crear, consultar, **editar** y **eliminar** | ✅ |
| 8 | Impresión: separación superior, encabezado derecho sin corte, código en una línea, columna de bodega | ✅ |
| 9 | Configuración simplificada (conserva control de vencimientos y módulos) | ✅ |
| 10 | Indicadores «Siigo 1 / 2 / 4» aclarados y reemplazados por nombres reales | ✅ |

---

## 2. Existencias: se revierte la consolidación por descripción

### Qué cambió

La disponibilidad se calculaba agrupando por **(descripción + unidad +
bodega)**. Eso unía productos de Siigo con **códigos distintos** pero el
mismo nombre. La dirección pidió identificar **de qué bodega sale cada
producto**, así que ahora la clave es:

```
CÓDIGO DE SIIGO  +  BODEGA
```

### Reglas vigentes

- Dos productos con el **mismo nombre** y **bodegas distintas** son
  existencias distintas: **nunca se suman entre sí**.
- Dos productos con el **mismo nombre**, **misma bodega** y **códigos
  distintos** también son distintos (13 casos reales en la base).
- Un **mismo código** en la **misma bodega** sí suma sus ubicaciones: es el
  mismo stock repartido en el almacén. Se muestra cuántas ubicaciones tiene.
- Los registros originales de `siigo_balances` (producto, bodega, ubicación y
  cantidad) **no se modifican**: son la fuente de verdad y la trazabilidad.
- La vista anterior (`v_stock_consolidated`) **se conserva** como registro
  histórico, pero ya no participa en la disponibilidad ni en la selección.

### Datos

| Medida | Valor |
|---|---|
| Registros originales por ubicación | **5 528** (sin cambios) |
| Filas por código + bodega (vigente) | **5 257** |
| Filas por descripción + unidad + bodega (histórico) | **5 227** |
| Suma total de existencias | **215 628,124** (idéntica en las tres) |

### Objetos de base de datos

| Objeto | Tipo | Contenido |
|---|---|---|
| `mv_stock_by_bodega` | Vista materializada | Existencias por producto y bodega |
| `v_stock_by_bodega` | Vista | Lo anterior + reservas pendientes del grupo |
| `siigo_balances.warehouse_id` | Columna | Se completó con el catálogo importado |

La vista materializada se refresca al cerrar cada importación.

### Clave de grupo de reservas y conciliaciones

Pasó de `descripción|unidad|bodega` a `código|bodega`. El cambio es
**más preciso**: antes una salida de un producto podía liberar la reserva de
otro producto con el mismo nombre; ahora cada salida se descuenta
exactamente del saldo de su producto en su bodega.

Las reservas pendientes existentes se actualizaron en la migración `0015`.

---

## 3. Bodega de salida por línea de producto

### Interfaz

La bodega **ya no es un dato de la orden**: es una columna de la tabla de
productos.

```
# | Código | Producto | Bodega de salida | Cantidad | Unidad | Peso | Unidad de peso | Vencimiento
```

- El selector ofrece **únicamente bodegas del catálogo importado de Siigo**
  (no se pueden crear bodegas a mano).
- Al agregar un producto, la línea nace con la bodega donde se encontró.
- La bodega se puede **cambiar** en cualquier momento.
- Al cambiar de bodega se recalcula la disponibilidad de esa línea.

### Validación (frontend **y** backend)

| Regla | Comportamiento |
|---|---|
| Disponibilidad > 0 | Se puede agregar |
| Disponibilidad = 0 | Botón «Agregar» deshabilitado |
| Disponibilidad < 0 | Botón «Agregar» deshabilitado |
| Cantidad > disponibilidad de **esa** bodega | Error, en ambos lados |

Mensajes:

- `Este producto no tiene unidades disponibles para agregar a la orden de pedido`
- `La cantidad solicitada supera las unidades disponibles de <producto> en la
  bodega <bodega>: disponible <n> (existencia <x> – comprometido <y>);
  solicitado <z>.`

El backend usa un **bloqueo consultivo por producto y bodega**
(`pg_advisory_xact_lock`), de modo que dos órdenes simultáneas no pueden
descontar la misma existencia.

### Endpoint nuevo

`GET /api/existencias/producto/[productId]` → las bodegas donde ese producto
tiene existencia y cuánta disponibilidad hay en cada una. Es lo que alimenta
el selector de bodega de la línea.

---

## 4. Programa «Otro»

Los cuatro programas del catálogo se conservan tal cual:

- Grupos de familia
- Plan Padrino
- Consumo Interno
- Desayunos Saludables

Al elegir **«Otro programa»** aparece un campo de texto. El nombre escrito se
guarda en `salidas.custom_program_name` y aparece en:

- la orden (detalle y listado),
- el **documento impreso** (bloque de información general, campo PROGRAMA).

No se toca el catálogo de Siigo ni el de programas: el nombre libre es un
dato **de la orden**, no un programa del sistema.

`salidas.program_id` pasó a sernullable para dar cabida a esta opción; los
registros existentes conservan su programa.

---

## 5. Almacenista

El nombre **y** la cédula se escriben en el formulario y se guardan con la
orden (`deliverer_name`, `deliverer_document`). No hay valores fijos en el
código.

**Orden de la información general** (como lo pidió la dirección):

1. Destino
2. Programa
3. Nombre del almacenista (quien entrega)
4. Cédula del almacenista

La fecha y la hora de la orden las registra el sistema automáticamente.

---

## 6. Recepción en despacho simplificada

### Se retiró de la interfaz del almacenista

- ⛔ Campo editable de **hora de recepción**
- ⛔ Botón morado **«Registrar recepción en despacho»**
- ⛔ Campo de **motivo de anulación**
- ⛔ Botón **«Anular salida»**
- ⛔ Acciones operativas de anulación

### Se conserva

- ✅ **Nombre de quien recibe en despacho**
- ✅ **Cédula de quien recibe en despacho**

Ambos se guardan con `PUT /api/salidas/[id]/recepcion`. La **hora la genera
el sistema** (no es un campo editable) y, si ya había una, **se conserva**
porque es un dato histórico. No se marca una recepción física como
verificada sin que alguien registre quién recibió.

La gestión de una orden incorrecta se hace ahora **editándola o
eliminándola**, no anulándola.

---

## 7. CRUD de órdenes

| Acción | Cómo | Regla |
|---|---|---|
| **Crear** | `/salidas-almacen/nueva` | Valida disponibilidad por línea y bodega |
| **Consultar** | `/salidas-almacen/[id]` | Detalle, estado y conciliación |
| **Editar** | `/salidas-almacen/[id]/editar` | Solo órdenes en `DRAFT` |
| **Eliminar** | Botón «Eliminar orden» | Borrado lógico si ya está confirmada en Siigo |

### Integridad histórica al eliminar

| Estado de la orden | Resultado |
|---|---|
| `DRAFT` | Eliminación definitiva (nunca dejó rastro operativo) |
| `GENERATED` / `DELIVERED` | Eliminación definitiva y liberación de reservas |
| `CONFIRMED_SIIGO` | **Borrado lógico**: se marca `deleted_at`, se oculta del listado y **se conserva todo el historial** |

En el último caso el sistema responde: *«La orden se ocultó del listado
(borrado lógico) porque ya está confirmada en Siigo Pyme. Su historial se
conserva.»*

---

## 8. Impresión

### 8.1 Separación superior recuperada

```
┌──────────────────────────────────────────────────────────────┐
│ Sistema de Gestión de Inventarios | Banco de Alimentos Ibagué │  ← fecha y hora
├──────────────────────────────────────────────────────────────┤
│                      (2 cm de aire)                           │
├──────────────────────────────────────────────────────────────┤
│ [logo]  Banco Arquidiocesano…        ORDEN DE PEDIDO        │  ← encabezado
│         NIT … · Tel. …                OP-2026-0028          │     institucional
└──────────────────────────────────────────────────────────────┘
```

### 8.2 El encabezado superior derecho ya no se corta

**Causa raíz:** la rejilla usaba `grid-template-columns: 56% 44%` **más un
`gap` de 0,2 cm**. Los porcentajes suman el 100 % y el `gap` se sumaba
encima: la columna derecha se salía **0,2 cm** del área imprimible y por eso
se cortaban el título, el número, la fecha, la hora y el estado.

**Solución:** `grid-template-columns: minmax(0, 56fr) minmax(0, 44fr)`. Las
unidades `fr` descontaban el `gap` del espacio disponible. Se añade además
`min-width: 0`, `overflow-wrap: break-word` y 0,2 cm de holgura a la
derecha.

**No se redujeron los márgenes generales ni el tamaño de letra**: el resto
del documento ya imprimía bien.

### 8.3 La columna CÓDIGO

| | Antes | Ahora |
|---|---|---|
| Ancho | 14 % | **15 %** (2,88 cm) |
| Código de Siigo «001-0001-000001» | ~2,2 cm → se partía | **2,22 cm → cabe en una línea** |
| Tratamiento | `break-word` (partía la fila) | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis` |

La columna **BODEGA DE SALIDA** (16 %) también Holgura para el nombre de
bodega más largo («DONAC ORG ROA FLOR HU»).

### 8.4 Nueva columna BODEGA DE SALIDA

Cada producto muestra **su propia** bodega. Ya no hay bodega general en el
bloque de información general de la orden.

### 8.5 Varias páginas

- `thead { display: table-header-group }` → el encabezado de la tabla **se
  repite** en cada página.
- 9 bloques con `break-inside: avoid` → filas, resumen, observaciones y
  firmas **no se parten** entre páginas.

### 8.6 Geometría verificada

`scripts/verificar-impresion.ts` calcula la geometría real a partir del CSS:

| Medida | Valor |
|---|---|
| Hoja carta | 21,59 cm |
| Área imprimible (márgenes 1 + 1 cm) | 19,59 cm |
| Ancho del documento | 19,20 cm |
| Holgura a la derecha | **0,39 cm** |
| Bloque derecho del encabezado | 8,36 cm |
| Columna CÓDIGO | 2,88 cm (necesita 2,22 cm) |
| Columna BODEGA DE SALIDA | 3,07 cm (necesita 2,62 cm) |

---

## 9. Configuración

### Apartados retirados de la interfaz

- Base de datos
- Seguridad
- Apariencia
- Notificaciones

### Apartados conservados

- **Control de vencimientos** (días de anticipación y días críticos)
- **Módulos del sistema** (activar/desactivar módulos, reversible)

> Nada se eliminó del sistema: las tablas, los servicios, las políticas y la
> lógica de esos apartados siguen intactos. Solo se retiraron de la pantalla
> de configuración porque el personal del Banco no los utiliza.

---

## 10. Indicadores «Siigo 1», «Siigo 2», «Siigo 4»

### Investigación

Se rastreó el origen de esos textos. Resultado:

**Eran el código numérico de bodega de Siigo**, y aparecían porque **el
nombre de la bodega nunca se podía resolver**: la columna
`siigo_balances.warehouse_id` estaba en `NULL` en las **5 528** filas, por lo
que la unión con `warehouses` siempre fallaba y la interfaz caía al texto
alternativo `Siigo ${código}`.

### Solución

1. La migración `0015` completa `siigo_balances.warehouse_id` con el catálogo
   importado (`warehouses.siigo_code = siigo_balances.siigo_bodega_code`).
2. La vista `mv_stock_by_bodega` une por `siigo_code`, de modo que el nombre
   está disponible aunque `warehouse_id` venga vacío.
3. En **todas** las pantallas operativas se muestra el nombre real
   (`PRINCIPAL`, `ALMACEN`, `Ola Invernal - Cordob`, …). Donde no hay bodega
   asignada se dice `Bodega <n>`, nunca un código suelto.

### Pantallas revisadas

| Pantalla | Antes | Ahora |
|---|---|---|
| Inventario | `Siigo 1 (sin asignar)` | `PRINCIPAL` |
| Buscador de la orden | `Siigo 3` | `PRINCIPAL` |
| Vencimientos | `3` (número crudo) | `PRINCIPAL` |
| Detalle de la orden | `Siigo 5` | `Campaña: Juntos por V` |
| Documento impreso | — | `PRINCIPAL` (por línea) |
| Integración Siigo | `Siigo 3` | `Código Siigo 3` (pantalla administrativa de mapeo: ahí el código **es** la clave) |

---

## 11. Pruebas ejecutadas

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test:run` | **224 / 224** ✅ |
| Integración de existencias | `npx tsx scripts/test-consolidacion.ts` | **30 / 30** ✅ |
| Geometría de impresión | `npx tsx scripts/verificar-impresion.ts` | **23 / 23** ✅ |
| Conciliación (sin doble descuento) | `npx tsx scripts/test-reconciliacion.ts` | **9 / 9** ✅ |
| Funcional de los ajustes | `E2E_URL=… node scripts/e2e-ajustes-banco.mjs` | **55 / 55** ✅ |
| Compilación | `npm run build` | ✅ |
| Lint | `npm run lint` | 0 errores ✅ |

### Qué comprueba la prueba de integración de existencias

- Cada fila **(producto, bodega)** coincide **exactamente** con el saldo
  original de ese producto en esa bodega (invariante que fallaría si se
  sumaran entre bodegas).
- El mismo nombre en dos bodegas produce filas separadas.
- El mismo nombre + misma bodega con códigos distintos produce filas
  separadas.
- Los 5 528 registros originales siguen intactos.
- La suma total de existencias no cambia.
- Todas las existencias muestran el nombre de su bodega.

### Qué comprueba la verificación funcional

1. Configuración conserva los dos apartados y retira los cuatro.
2. Los cuatro programas del catálogo están disponibles.
3. El nombre y la cédula del almacenista se guardan.
4. Un producto con el mismo nombre en dos bodegas aparece como dos filas.
5. Cada línea conserva su bodega y su nombre legible.
6. El backend rechaza pedir más de lo disponible en esa bodega.
7. El backend rechaza un producto sin disponibilidad.
8. La orden se puede consultar, editar y eliminar.
9. Una orden confirmada en Siigo se borra de forma lógica.
10. La recepción guarda nombre y cédula y la hora la genera el sistema.
11. No existe hora de recepción editable, ni botón morado, ni anulación.
12. El documento impreso incluye título, encabezado superior, columna de
    bodega, firmas y observaciones.
13. Los tiempos de respuesta de las APIs están por debajo de 1,2 s.

---

## 12. Rendimiento

| Endpoint | Tiempo medio |
|---|---|
| `/api/existencias?pageSize=25` | ~700 ms |
| `/api/existencias?availability=positive&pageSize=50` | ~840 ms |
| `/api/salidas?pageSize=10` | ~1 090 ms |
| `/api/bodegas/importadas` | ~480 ms |
| `/api/destinos?search=San` | ~780 ms |

El tiempo restante es **latencia de red** hacia Supabase (la base está en
Oregón, ~200 ms por consulta). El trabajo de base de datos se mantiene
optimizado: una sola consulta por pantalla (totales por funciones de
ventana), vista materializada para las existencias y caché de permisos por
rol.

---

## 13. Pendientes

| Pendiente | Motivo |
|---|---|
| Archivo Excel de vencimientos por lotes | El Banco aún no lo ha entregado. La estructura (`vencimiento_lotes`), las alertas y el importador están preparados; falta el lector de sus columnas. |
| Nombres definitivos de las 7 bodegas | Siigo los entrega truncados («Ola Invernal - Cordob», «Campaña: Juntos por V»). Se pueden renombrar en el catálogo de bodegas. |
| Impresión física | La geometría está verificada por cálculo (23 comprobaciones) y por la vista previa del navegador; falta la prueba en la impresora del Banco. |

---

## 14. Cómo iniciar

```bash
npm install
npm run db:setup     # aplica las migraciones pendientes (0015 incluida)
npm run dev          # http://localhost:3000
```

**Acceso:** `admin` / `admin123`

### Guion de demostración (5 minutos)

1. **Configuración** → solo «Control de vencimientos» y «Módulos del
   sistema».
2. **Nueva orden de pedido**:
   - Destino: escribir `San Juan` → elegir la parroquia.
   - Programa: elegir «Otro programa» → escribir `Jornada de atención
     especial`.
   - Nombre y cédula del almacenista.
   - **Agregar producto** → buscar `ACEITE` o `FRIJOL`: se ven los productos
     **con su bodega**; los que no tienen stock, con el botón deshabilitado.
   - Cambiar la **bodega de salida** de la línea: el disponible se recalcula.
   - Cantidad, peso y **vencimiento** por línea.
   - **Observaciones generales** (abajo de la tabla).
   - **Guardar y generar orden**.
3. **Detalle de la orden** → «Guardar datos de recepción» (nombre y cédula).
   Editar / eliminar.
4. **Ver comprobante** → **Imprimir** (Ctrl+P): tamaño carta, márgenes por
   defecto, encabezados repetidos.
5. **Inventario** →_existencias por producto y bodega con nombres reales.

Orden de prueba con 24 líneas de varias bodegas:

```bash
node scripts/crear-orden-demo.mjs
```
