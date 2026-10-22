# Módulo de Entradas — Comprobante y procedimiento

**Sistema de Gestión, Trazabilidad y Conciliación de Inventarios**
**Banco Arquidiocesano de Alimentos de Ibagué**

> Adaptación del módulo de Entradas al procedimiento de Siigo Pyme:
> captura de la entrada en el orden que usa el personal y comprobante
> impreso con la estructura de la nota de entrada.

---

## 1. Procedimiento de captura

El formulario sigue el orden del procedimiento:

| # | Paso | Cómo se resuelve |
|---|---|---|
| 1 | Tipo de entrada | Desplegable con **E1, E3, N3, N5**. Al elegirlo se muestran el título y el código documental. |
| 2 | Entidad que entrega | Buscador por NIT, cédula, razón social, sucursal o ciudad (`/api/terceros`). |
| 3 | Datos de la entidad | Se completan solos: **NIT** y **razón social** (en mayúsculas). |
| 4 | Fecha del documento | Selector de fecha, con la fecha actual por defecto. |
| 5 | Orden de compra | Campo independiente. Si no aplica, queda vacío. |
| 6 | Centro de costo | Desplegable del catálogo. Puede quedar vacío. |
| 7 | Número de vendedor | Campo numérico (por defecto 1). |
| 8 | Número de la entrada | Manual o automático. Si se deja vacío se asigna el consecutivo. |
| 9 | Productos | Buscador por referencia, nombre, presentación o categoría. |
| 10 | Código y descripción | Se completan solos del catálogo. La descripción es editable (caso "CD 6020 …"). |
| 11 | Unidad | Desplegable del catálogo de unidades; se propone la del producto. |
| 12 | Bodega | Desplegable; se propone según el tipo de entrada. |
| 13 | Ubicación | Campo de texto del usuario. |
| 14 | Cantidad | Numérica, mayor que cero, admite decimales. |
| 15 | Valor monetario | Numérico, admite 0. |
| 16 | D/C | Indicador débito/crédito (0 por defecto). |
| 17 | Lotes y vencimientos | Panel por producto: código, denominación, fecha de vencimiento y cantidad. |
| 18 | Observaciones | Campo de texto libre, en mayúsculas. |
| 19 | Guardar | Valida todo y guarda cabecera, detalle, lotes y movimiento de inventario en una transacción. |
| 20 | Imprimir | Pregunta si se imprime y abre el comprobante. |

### Campos que se completan solos

- **NIT** y **razón social** → desde el tercero seleccionado.
- **Ciudad** → desde el tercero seleccionado.
- **Código, nombre y presentación del producto** → desde el catálogo.
- **Unidad** → la del producto (editable con el desplegable de unidades).
- **Descripción** → compuesta con nombre y presentación (editable).
- **Bodega** → sugerida por el tipo de entrada.
- **Número de la entrada** → consecutivo del tipo, si el usuario no escribe uno.
- **Centro de costo de la línea** → el del documento, si seIndicó.

---

## 2. Tipos de entrada

| Código | Nombre | Título del documento | Código documental |
|---|---|---|---|
| E1 | Entrada por donación | NOTA ENTRADA DONACIÓN | `E-001-n` |
| E3 | Entrada productos otros | NOTA ENTRADA PRODUCCIÓN OTROS | `E-003-n` |
| N3 | Nota de ajuste | NOTA AJUSTE | `N-003-n` |
| N5 | Nota de contabilización | NOTA CONTABILIZACIÓN | `N-005-n` |

El catálogo vive en `src/lib/entries/entry-types.ts` y es la fuente única para
el formulario, el comprobante y el exportador a Siigo.

> **Pendiente de validar con el Banco**: el procedimiento de Siigo maneja
> además E2 (entrada interna), E4 y E5, que **no** están soportados por el
> sistema. No se agregaron porque el enum `entry_format` del proyecto solo
> tiene E1, E3, N3 y N5.

---

## 3. Consecutivo documental

El número completo tiene la forma `E-003-28`:

- `E-003` → tipo de documento (del catálogo anterior).
- `28` → consecutivo de ese tipo.

El consecutivo se asigna con un contador atómico en la tabla
`document_sequences` (`INSERT … ON CONFLICT DO UPDATE`), de modo que **dos
usuarios que registran entradas al mismo tiempo reciben números distintos**.
El número completo se guarda en `entries.number` y es el que se imprime.

---

## 4. Bodega de destino

La bodega se determina con la clasificación que ya existe en el catálogo:

| Tipo de entrada | Bodega sugerida | Criterio |
|---|---|---|
| E1 (donación) | Bodega de tipo `TERCERO` → **1.2** Productos Donados | Lo entrega un tercero |
| E3 (productos otros) | Bodega de tipo `PROPIA` → **1.1** Productos Propios | Producto propio del Banco |
| N3 / N5 | Sin sugerencia | El usuario elige |

La selección siempre es del desplegable de bodegas activas: la sugerencia es
un valor inicial, no una imposedición.

> **Pendiente de validar con el Banco**: la referencia operativa del
> procedimiento indica **1-4** para los productos donados, pero el catálogo
> de bodegas del sistema tiene **1.2 = Productos Donados**. Se follows la
> clasificación existente del sistema; si el Banco confirma que la bodega de
> donados es 1-4, se crea esa bodega y se ajusta la sugerencia.

---

## 5. Lotes y vencimientos

- Cada línea de producto puede tener **uno o varios lotes**.
- Cada lote guarda: **código**, **denominación** (por defecto "Lotes
  Inicial"), **fecha de vencimiento** y **cantidad**.
- Los lotes se guardan en `entry_item_lots`, ligados al ítem de la entrada.
- **Si una línea tiene lotes, la suma de sus cantidades debe coincidir con la
  cantidad de la línea.** Si no coincide, el sistema rechaza el guardado con
  un mensaje que indica la diferencia.
- La fecha de vencimiento es independiente de la fecha del documento y se
  captura con selector de fecha (formato `AAAA-MM-DD`).

> El código `9999999999` del ejemplo de la plantilla **no** se asigna
> automáticamente: el código del lote lo ingresa el usuario.

---

## 6. Comprobante impreso

Ruta: `/entradas/[id]/comprobante` (botón **Imprimir** en el listado y
opción al guardar).

### Área de impresión

| Propiedad | Valor |
|---|---|
| Tamaño de página | 21,59 cm × 13,97 cm (media hoja carta) |
| Márgenes | 0,4 cm |
| Orientación | Horizontal, mitad de una hoja tamaño carta |

### Estructura

```
┌────────────┬───────────────────────────┬────────────────────────┐
│  LOGO      │ BANCO ARQUIDIOCESANO DE   │ NOTA ENTRADA DONACIÓN   │
│  (recorte  │ ALIMENTOS DE IBAGUÉ       │ E - 001 - 28            │
│  del logo  │ NIT: 809.009.880 - 0      │                         │
│  oficial)  │ CR 4 ESTADIO 23 44         │                         │
│            │ 2624927 - 5151727          │                         │
├────────────┴───────────────────────────┴────────────────────────┤
│ SEÑORES: …      │ TELÉFONO: …   │ FECHA DOCUMENTO: …          │
│ NIT: …          │ CIUDAD: …     │ ORDEN DE COMPRA: …          │
│ DIRECCIÓN: …    │               │                            │
├───────────────────────────────────────────────────────────────┤
│ CÓDIGO │ DESCRIPCIÓN │ C. de COSTO │ BODEGA │ CANT │ UNID │ VALOR │
├───────────────────────────────────────────────────────────────┤
│ CÓDIGO LOTE │ DENOMINACIÓN │ FECHA VENCIMIENTO │ CANTIDAD      │
├───────────────────────────────────────────────────────────────┤
│ OBSERVACIONES:                                                    │
└───────────────────────────────────────────────────────────────┘
```

### Reglas de impresión

- Blanco y negro: el logo se imprime con `filter: grayscale(1)`.
- Sin colores, sin elementos decorativos, líneas finas y tipografía compacta.
- El encabezado de la tabla se **repite** si el comprobante pasa a una segunda
  media hoja (`display: table-header-group`).
- Las filas no se parten entre páginas (`break-inside: avoid`).
- Las columnas tienen ancho fijo (`table-layout: fixed`) y las descripciones
  largas no se cortan (`overflow-wrap: anywhere`).
- Cifras con formato uniforme: `150,00` y `1.250,75`.
- Fechas en formato `AAAA-MM-DD`, como en la plantilla de referencia.

> Si una entrada tiene tantos productos o lotes que no caben en una media
> hoja, el comprobante **no recorta nada**: continúa en la siguiente media
> hoja repitiendo el encabezado de la tabla.

---

## 7. Integridad de la operación

Al guardar, dentro de **una sola transacción**:

1. Se valida el documento, los productos, las bodegas y los lotes.
2. Se asigna el consecutivo (atómico) o se usa el número digitado.
3. Se guarda la cabecera (`entries`).
4. Se guarda el detalle (`entry_items`) con la línea completa.
5. Se guardan los lotes (`entry_item_lots`).
6. Se actualiza el inventario y se registra el movimiento
   (`inventory` + `inventory_movements`).
7. Se registra el soporte documental (`documents`) y la bitácora
   (`audit_logs`).

Si algo falla, se revierte todo: no queda una entrada a medias ni inventario
descuadrado.

---

## 8. Comprobantes de prueba

```bash
npm run test:e2e:entradas
```

Cubre los siete escenarios del procedimiento:

1. Entrada de producto propio (E3) con bodega 1.1, lote, vencimiento y valor.
2. Entrada de producto donado (E1) con los datos de la entidad autocompletados.
3. Los cuatro tipos de entrada con su título y código documental.
4. Varios productos y varios lotes en un mismo producto.
5. Validaciones: sin productos, cantidad cero, negativa, lotes inconsistentes,
   bodega inexistente, sin fecha.
6. Consecutivos: número repetido rechazado, inventario que cambia una sola
   vez, dos entradas simultáneas con números distintos.
7. Comprobante: el HTML contiene el título, el código documental, los datos
   del Banco, los datos de la entidad, las columnas de la tabla, los lotes y
   las observaciones.
