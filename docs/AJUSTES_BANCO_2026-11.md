# Ajustes del Banco — Orden de Pedido, Existencias e Impresión

**Fecha:** 2026-11-12
**Ámbito:** sistema existente del Banco Arquidiocesano de Alimentos de Ibagué
**Naturaleza:** ajustes sobre la aplicación actual. No se reconstruyó nada, no
se eliminó ningún módulo, tabla, ruta ni dato.

---

## 1. Resumen ejecutivo

| # | Ajuste | Estado |
|---|--------|--------|
| 1 | Existencias consolidadas por **descripción exacta + bodega** (sumando ubicaciones) | ✅ |
| 2 | Importador del «Reporte resumido de productos por bodega» (columnas A–O) | ✅ |
| 3 | Selector de bodegas limitado al catálogo importado de Siigo | ✅ |
| 4 | Almacenista y recepción en despacho claramente diferenciados | ✅ |
| 5 | Buscador con disponibilidad real y validaciones en frontend y backend | ✅ |
| 6 | Validaciones de cantidad, peso y vencimiento con los mensajes pedidos | ✅ |
| 7 | Impresión: encabezado derecho sin corte y columna de código ampliada | ✅ |
| 8 | Módulo de vencimientos y alertas con importador preparado | ✅ |
| 9 | Pruebas unitarias, de integración y funcionales | ✅ |

---

## 2. Existencias: consolidación por descripción y bodega

### La regla

Siigo registra un mismo producto en varias **ubicaciones** de una bodega, y
el mismo **nombre** puede aparecer en distintas bodegas. El Banco pidió:

```
ACEITE DE OLIVA / Bodega 1 / Ubicación 1 / 30 unidades.
ACEITE DE OLIVA / Bodega 1 / Ubicación 4 / 20 unidades.
  → ACEITE DE OLIVA / Bodega 1 / 50 unidades.
```

Así que la disponibilidad se calcula por **descripción exacta + bodega**, y la
consolidación es un **cálculo derivado**: los registros originales de
`siigo_balances` (producto, bodega, ubicación y cantidad) no se tocan.

### Reglas vigentes

- Las **ubicaciones** de un mismo producto en la misma bodega **se suman**
  (es el mismo stock repartido en el almacén). El grupo muestra cuántas
  ubicaciones y cuántos códigos de Siigo lo componen.
- Las existencias de **bodegas distintas nunca se mezclan**: la misma
  descripción en PRINCIPAL y en ALMACEN son dos filas independientes.
- **No se fusionan descripciones diferentes**: se conservan las 4 830
  descripciones distintas del inventario.
- Las cantidades **negativas** y los resultados en **cero** se conservan.
- La vista por código (`mv_stock_by_bodega`) se conserva como detalle
  original de cada grupo.

### Datos

| Medida | Valor |
|---|---|
| Registros originales por ubicación | **5 528** (sin cambios) |
| Grupos consolidados (descripción + bodega) | **5 225** |
| Grupos con más de una ubicación | 262 |
| Grupos con más de un código | 16 |
| Suma total de existencias | **215 628,124** (idéntica al original) |

### Objetos de base de datos

| Objeto | Tipo | Contenido |
|---|---|---|
| `mv_stock_consolidated` | Vista materializada | Consolidación por descripción y bodega |
| `v_stock_consolidated` | Vista | Lo anterior + reservas pendientes del grupo |
| `mv_stock_by_bodega` | Vista materializada | Detalle original por código de Siigo y bodega |
| `siigo_balances.warehouse_id` | Columna | Se completó con el catálogo importado |

La vista materializada se refresca al cerrar cada importación.

### Clave de grupo de reservas y conciliaciones

Es `descripción|bodega`: la reserva se descuenta exactamente del saldo del
grupo (descripción + bodega) que tomó la orden.

Las reservas pendientes existentes se actualizaron en la migración `0016`.

---

## 3. Importador del «Reporte resumido de productos por bodega»

### Mapeo de columnas

| Columna | Contenido | Uso |
|---|---|---|
| A | información del reporte | — |
| B | código de bodega | **Identifica la bodega** |
| C | descripción de bodega | **Nombre de la bodega** |
| D | ubicación | **Conserva la ubicación** |
| E, F | información de ubicación | **Nombre de la ubicación** |
| G | código del producto | **Identifica el producto** |
| H | descripción del producto | **Nombre del producto** |
| I | entradas | **Se usa** |
| J, K | — | **Se ignoran por completo** |
| L | salidas | **Se usa** |
| M, N | — | **Se ignoran por completo** |
| O | diferencia entre entradas y salidas | **Se usa como diferencia** |

El lector propio trabaja sobre el XML del ZIP: **lee las columnas tanto si
están ocultas como si están visibles**.

### La columna O no es el saldo

El reporte resumido es un **resumen de movimientos de un periodo**: la
columna O es `CANTIDAD ENTRADAS − CANTIDAD SALIDAS` (verificado en las
2 209 filas del archivo real), es decir, el **movimiento neto del periodo**.

**No es el inventario disponible**: el archivo no trae saldo inicial ni
final. Por eso estas filas se guardan como **MOVIMIENTOS** (`siigo_resumen_movimientos`)
y **nunca como existencias**. Las existencias solo pueden venir del reporte
**detallado**, que sí trae `CANT. ANTERIOR`.

### Idempotencia y catálogo

- El `upsert` de `siigo_resumen_movements` **reemplaza** por
  `(producto, bodega, ubicación)`: reimportar **no duplica ni acumula**.
- Las bodegas se crean o actualizan desde el reporte (`warehouses.source =
  'SIIGO'`), **sin duplicados**, y las órdenes anteriores conservan sus
  referencias históricas.
- El historial de importaciones (`siigo_import_runs`) se conserva, con el
  periodo y la naturaleza del dato de cada corrida.

---

## 4. Bodegas disponibles

El selector de bodegas de las nuevas órdenes usa `/api/bodegas/importadas`:
**solo** las bodegas identificadas en la información importada desde Siigo,
con **código y nombre real** (`S1 · PRINCIPAL`).

- No se pueden crear bodegas manualmente desde la orden.
- El catálogo se actualiza después de cada importación.
- Las referencias históricas de órdenes anteriores no se tocan.

Las 7 bodegas del catálogo actual: PRINCIPAL, ALMACEN, Ola Invernal - Cordob,
DONAC ORG ROA FLOR HU, CANASTO DE SEMANA SAN, Campaña: Juntos por V y
Bodega alterna.

---

## 5. Almacenista y recepción en despacho

### Entrega — el almacenista que crea la orden

El campo se llama **«Nombre del almacenista (quien entrega)»**, es
obligatorio y se guarda en la orden junto con su cédula. No hay nombres ni
identificaciones fijas en el código.

### Recepción — la persona encargada de despacho

Al confirmar la recepción se registran:

- **Nombre** de quien recibe
- **Cédula** de quien recibe
- **Firma** (deja constancia de que se firmó el documento impreso)
- **Fecha y hora automáticas** del sistema

La fecha y la hora **no son editables**: las genera el backend. Si la
recepción ya estaba confirmada, la fecha y la hora originales se conservan
porque son datos históricos.

Si aún no hay recepción confirmada, los espacios del documento impreso
quedan **vacíos**: no se inventa información.

---

## 6. Buscador y disponibilidad

El buscador muestra **todos** los productos del inventario importado,
incluidos los que tienen disponibilidad **cero o negativa**. Cada resultado
muestra **código, descripción, bodega, disponibilidad y unidad**.

| Regla | Comportamiento |
|---|---|
| Disponibilidad > 0 | Se puede agregar |
| Disponibilidad = 0 | Botón «Agregar» deshabilitado |
| Disponibilidad < 0 | Botón «Agregar» deshabilitado |
| Cantidad > disponibilidad de esa bodega | Error en frontend **y** backend |

Mensajes:

- `Este producto no tiene unidades disponibles para agregar a la orden de pedido`
- `La cantidad solicitada supera las unidades disponibles de <producto> en la
  bodega <bodega>: disponible <n> (existencia <x> – comprometido <y>);
  solicitado <z>.`

El backend usa un **bloqueo consultivo por producto y bodega**
(`pg_advisory_xact_lock`), de modo que dos órdenes simultáneas no pueden
comprometer las mismas existencias. Las órdenes pendientes se restan de la
disponibilidad mediante `siigo_reservations`.

---

## 7. Validaciones de cantidad, peso y vencimiento

Los campos se pueden **borrar por completo** mientras se editan: no se
reemplazan automáticamente por cero. La validación ocurre al **salir del
campo** o al **guardar**, nunca mientras el usuario escribe.

| Campo | Mensaje exacto |
|---|---|
| Cantidad vacía, cero, negativa o inválida | `Debes ingresar una cantidad mayor que 0` |
| Peso vacío, cero, negativo o inválido | `Debes ingresar un peso mayor que 0` |
| Fecha de vencimiento vacía o inválida | `Debes seleccionar la fecha de vencimiento del producto` |

El backend valida también al guardar.

---

## 8. Impresión

### Encabezado superior derecho

El bloque de la derecha lleva **título, número de orden, fecha, hora y
estado**.

**Causa raíz del corte:** la rejilla usaba `grid-template-columns: 56% 44%`
**más un `gap` de 0,2 cm**. Los porcentajes suman el 100 % y el `gap` se
sumaba encima: la columna derecha se salía **0,2 cm** del área imprimible.

**Solución:** `grid-template-columns: minmax(0, 56fr) minmax(0, 44fr)`. Las
unidades `fr` descontaban el `gap` del espacio disponible. Se añade además
`min-width: 0`, `overflow-wrap: break-word` y 0,2 cm de holgura a la
derecha.

**No se redujeron los márgenes generales ni el tamaño de letra**: el resto
del documento ya imprimía bien.

### Columna de código

| | Antes | Ahora |
|---|---|---|
| Ancho | 14 % | **15 %** (2,88 cm) |
| Código «001-0001-000001» | ~2,2 cm → se partía | **2,22 cm → cabe en una línea** |
| Tratamiento | `break-word` (partía la fila) | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis` |

La columna **BODEGA DE SALIDA** (16 %) también tiene holgura para el nombre
de bodega más largo («DONAC ORG ROA FLOR HU»).

### Elementos que se conservan

Logotipo, nombre institucional, número de orden, información general, tabla,
totales, observaciones, firmas y texto aclaratorio del pie.

### Firmas

```
ENTREGA — ALMACENISTA          RECIBE — ENCARGADO(A) DE DESPACHO
─────────────────────          ─────────────────────────────
Nombre: (registrado)           Nombre: (quien recibe)
Cédula: (registrada)           Cédula: (de quien recibe)
Fecha / Hora                   Fecha / Hora
```

Cada bloque tiene **1,1 cm** de espacio físico para la firma.

### Varias páginas

`thead { display: table-header-group }` → el encabezado de la tabla **se
repite** en cada página. Hay 9 bloques con `break-inside: avoid` (filas,
resumen, observaciones y firmas no se parten).

### Geometría verificada

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

## 9. Vencimientos y alertas

El módulo está **implementado y operativo** en `/vencimientos`, con el
importador preparado para el segundo Excel del Banco.

### Estructura

| Elemento | Ubicación |
|---|---|
| Tabla de lotes con vencimiento | `vencimiento_lotes` |
| Importador | `POST /api/vencimientos/importar` |
| Historial de importaciones | `siigo_import_runs` (`report_format = 'FECHAS_DE_VENCIMIENTO'`) |
| Relación producto ↔ lote ↔ bodega | `product_id`, `product_code`, `lot_code`, `siigo_bodega_code`, `location_code` |

**No se mezclan lotes diferentes**: el índice único es
`(product_code, lot_code, siigo_bodega_code, location_code)` y el `upsert`
usa exactamente esa clave.

Las filas se asocian al catálogo de productos **por código**, nunca por
nombre.

### Alertas

La alerta principal son los productos que vencen **durante la próxima
semana calendario**, con el rango calculado de forma **dinámica** a partir
de la fecha actual y la **zona horaria de Colombia** (`America/Bogota`):

| Categoría | Rango |
|---|---|
| Próxima semana | lunes a domingo de la semana siguiente |
| Semana actual | lunes a domingo de esta semana |
| Vencidos | fecha anterior a hoy |
| 15 días | hoy + 15 días |
| 30 días | hoy + 30 días |

Además: **existencias negativas**, **existencias en cero** y **registros
incompletos o inconsistentes** (código ausente, descripción ausente, bodega
desconocida, cantidades no interpretables, lote sin fecha).

### Pendiente del Banco

El **segundo Excel (fechas de vencimiento) todavía no existe**. No se
supone su estructura: lo que existe es la estructura de almacenamiento, el
importador de filas normalizadas, el historial, las alertas y la interfaz.
Cuando el Banco lo entregue se adapta el lector a sus columnas reales
(código, producto, lote, bodega, cantidad y vencimiento).

---

## 10. Pruebas ejecutadas

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test:run` | **224 / 224** ✅ |
| Consolidación (integración) | `npx tsx scripts/test-consolidacion.ts` | **27 / 27** ✅ |
| Importador (archivo real) | `npx tsx scripts/verificar-importador.ts` | **14 / 14** ✅ |
| Geometría de impresión | `npx tsx scripts/verificar-impresion.ts` | **23 / 23** ✅ |
| Documento impreso | `node scripts/verificar-documento.mjs` | **22 / 22** ✅ |
| Conciliación (sin doble descuento) | `npx tsx scripts/test-reconciliacion.ts` | **9 / 9** ✅ |
| Orden de pedido (E2E) | `node scripts/e2e-orden-pedido.mjs` | **44 / 44** ✅ |
| Ajustes del Banco (E2E) | `node scripts/e2e-ajustes-banco.mjs` | **55 / 55** ✅ |
| Compilación | `npm run build` | ✅ |
| Lint | `npm run lint` | 0 errores ✅ |

### Qué comprueba la prueba de consolidación

- Las ubicaciones del mismo producto en la misma bodega **se suman** y el
  resultado coincide con la suma de los registros originales.
- **Cada** grupo cuadra **exactamente** con la suma de sus originales
  (invariante que fallaría si se mezclaran bodegas).
- Ningún grupo contiene existencias de otra bodega.
- Se conservan las 4 830 descripciones distintas: ninguna se fusionó.
- Los 5 528 registros originales siguen intactos, con sus códigos y
  ubicaciones.
- La suma total de existencias no cambia.
- Ningún grupo con saldo negativo se pierde.

### Qué comprueba la verificación del importador

- El archivo real se reconoce y se leen sus 2 209 filas.
- La lectura no depende de que las columnas estén ocultas o visibles.
- Ninguna fila expone datos de J, K, M ni N.
- La columna O coincide con entradas − salidas en las 2 209 filas.
- No hay movimientos duplicados: cada producto+bodega+ubicación aparece una vez.
- Las 7 bodegas del reporte están en el catálogo, sin duplicados.
- Las existencias provienen del reporte **detallado**: el resumen no las toca.

---

## 11. Rendimiento

| Endpoint | Tiempo medio |
|---|---|
| `/api/existencias?pageSize=25` | ~700 ms |
| `/api/existencias?availability=positive&pageSize=50` | ~850 ms |
| `/api/salidas?pageSize=10` | ~950 ms |
| `/api/bodegas/importadas` | ~500 ms |
| `/api/destinos?search=San` | ~800 ms |

El tiempo restante es **latencia de red** hacia Supabase (la base está en
Oregón, ~200 ms por consulta). El trabajo de base de datos se mantiene
optimizado: una sola consulta por pantalla (totales por funciones de
ventana), vista materializada para las existencias y caché de permisos por
rol.

---

## 12. Pendientes

| Pendiente | Motivo |
|---|---|
| **Archivo Excel de vencimientos** | El Banco aún no lo ha entregado. La estructura, las alertas, la interfaz y el importador de filas normalizadas están listos; falta el lector de sus columnas. |
| Nombres definitivos de las 7 bodegas | Siigo los entrega truncados («Ola Invernal - Cordob», «Campaña: Juntos por V»). Se pueden renombrar en el catálogo de bodegas. |
| Impresión en papel | La geometría está verificada por cálculo (23 comprobaciones) y por la vista previa del navegador; falta la prueba en la impresora del Banco. |

---

## 13. Cómo iniciar

```bash
npm install
npm run db:setup     # aplica las migraciones pendientes (0016 incluida)
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
   - **Agregar producto** → buscar `ACEITE` o `FRIJOL`: cada resultado
     muestra **código, descripción, bodega, disponibilidad y unidad**; los
     que no tienen stock, con el botón deshabilitado.
   - Cambiar la **bodega de salida** de la línea: el disponible se recalcula.
   - Cantidad, peso y **vencimiento** por línea.
   - **Observaciones generales** (abajo de la tabla).
   - **Guardar y generar orden**.
3. **Detalle de la orden** → «Confirmar recepción en despacho» (nombre,
   cédula y confirmación de la firma; la fecha y la hora las pone el
   sistema). Editar / eliminar.
4. **Ver comprobante** → **Imprimir** (Ctrl+P): tamaño carta, márgenes por
   defecto, encabezados repetidos, columna BODEGA DE SALIDA.
5. **Inventario** → existencias consolidadas por descripción y bodega con
   nombres reales.

Orden de prueba con 24 líneas de varias bodegas:

```bash
node scripts/crear-orden-demo.mjs
```
