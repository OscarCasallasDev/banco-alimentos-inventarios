# Módulo de Importación desde Siigo Pyme

> Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
> Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. Los dos reportes de Siigo Pyme

Siigo Pyme genera dos reportes distintos y **el sistema los trata de forma
diferente**, porque no dicen lo mismo.

| | **Detallado** | **Resumen** |
|---|---|---|
| Título | `MOVIMIENTO DETALLADO DE BODEGA POR FECHA` | `RESUMEN DE MOVIMIENTO POR BODEGA` |
| Hoja | `Hoja1` (+ `FÓRMULAS`) | `Informe` |
| Encabezados | fila 7 (27 columnas) | fila 7 (15 columnas) |
| Filas | ~75.954 (65.832 de datos) | ~2.235 (2.209 de datos) |
| Periodicidad | cada carga | cada 1–2 horas |
| **Trae saldo inicial** | **Sí** (`CANT. ANTERIOR`) | **No** |
| **Permite calcular existencias** | **Sí** | **No** |
| Alimenta | existencias (`siigo_balances`), movimientos | bodegas, ubicaciones, productos, movimientos agregados |

### 1.1 Por qué el reporte resumen NO actualiza las existencias

El reporte resumen trae, por producto y bodega:

- `CANTIDAD ENTRADAS` (col. I) y `CANTIDAD-2 ENTRADAS` (col. J)
- `VALOR ENTRADAS` (col. K)
- `CANTIDAD SALIDAS` (col. L) y `CANTIDAD-2 SALIDAS` (col. M)
- `VALOR SALIDAS` (col. N)
- Una columna sin encabezado (col. O) que es **entradas − salidas**

La columna O es el **movimiento neto del periodo**, no el inventario
disponible. Está verificado: en las 2.209 filas de datos del archivo real,
`O = I − L` sin una sola discrepancia. **El archivo no trae saldo inicial ni
saldo final**, de modo que la diferencia NO es la existencia actual.

Por eso el sistema:

- guarda esas filas en `siigo_resumen_movements` como **MOVIMIENTOS**;
- **no** toca `siigo_balances` (las existencias);
- muestra un aviso explícito en la interfaz.

> **Información adicional que necesita el sistema para el resumen:** un
> reporte de existencias actuales por producto/bodega/ubicación (saldo
> inicial o final). El importador ya está preparado para recibirlo: basta
> con que el archivo traiga el saldo y que se marque el formato como
> `EXISTENCIAS`.

### 1.2 Cálculo del saldo en el reporte detallado

La hoja `FÓRMULAS` define la semántica:

| Columna | Definición de Siigo | Uso en el sistema |
|---|---|---|
| `CANT. ANTERIOR` | «Saldo anterior a la fecha del informe» | Saldo inicial del grupo |
| `ACUM CANTIDAD` | «Sumatoria de las entradas menos las salidas» | **Acumulado corrido**: NO se suma entre filas |
| `ENTRADAS 2` / `SALIDAS 2` / `SALDO 2` | «…cuando está parametrizada en el registro de control el manejo de la segunda unidad» | Se capturan; `SALDO 2` **no** se usa en cálculos (su semántica no es consistente) |

**Regla del saldo (por producto, bodega y ubicación):**

```
saldo = CANT. ANTERIOR  +  Σ (ENTRADAS − SALIDAS)
```

El último `ACUM CANTIDAD` del grupo se usa **solo como contraste**. Si no
coinciden, el grupo queda marcado `review_required` y se muestra la
diferencia: no se oculta nada.

En el archivo real del Banco: **5.528 de 5.529 grupos** coinciden y hay
**1 grupo en revisión**, causado por una fila corrupta en el origen (la 4024:
tiene un documento en la columna FECHA, la bodega `46244` —que no existe— y su
saldo acumulado no cuadra con sus movimientos). Esa fila se rechaza y el grupo
afectado queda visible para revisión.

### 1.3 Identificación de productos

Siigo codifica el producto como `LIN-GRUP-ELEMEN`, pero **los dos reportes lo
escriben distinto**:

| Reporte | Ejemplo |
|---|---|
| Detallado | `001-0001-000001` |
| Resumen | `0010001000001` |

Son el **mismo producto**. El importador normaliza al formato canónico
`LIN-GRUP-ELEMEN` (`src/lib/siigo/import/resumen-parser.ts →
normalizeProductCode`), de modo que el catálogo no queda duplicado.

El script `npm run repair:codigos` (o `tsx scripts/repair-codigos-producto.ts`)
fusiona los duplicados que hubiera creado una importación anterior a la
normalización: mueve los movimientos al producto canónico y **no borra
datos**.

`REFERENCIA` **no** es el código del producto: es la clasificación del ítem,
con ~60 variantes ortográficas de la misma categoría («CEREALES RAICES
TUBERCULOSPLATANOS Y DERIVADOS», «CEREALESRAICES TUBERCULOS PLATANOS Y
DERIVADOS», «CERELAES RAICES TUBERCULOS PLATANOS Y DERIVADOS»…). Se guarda
como atributo, nunca como clave.

---

## 2. Arquitectura de la importación

```
Excel de Siigo Pyme
        │
        ├─ agente local (opcional) ──► POST /api/siigo/importaciones
        │                              POST …/[id]/lotes      (por lotes, gzip)
        │                              POST …/[id]/finalizar
        │
        └─ carga manual ──────────►  POST /api/siigo/importaciones/archivo
                                       (URL firmada → Supabase Storage)
                                       POST …/[id]/procesar-archivo
                                       │
                                       ▼
                          Backend: valida → staging → saldos → concilia
                                       │
                                       ▼
                              siigo_balances (existencias)
                              siigo_movements (movimientos)
                              siigo_resumen_movements (resumen)
                              products / warehouses / siigo_locations
```

### 2.1 El lector propio (sin SheetJS)

Medido sobre el archivo real (8.08 MB, 75.954 filas):

| Librería | Tiempo | Memoria |
|---|---|---|
| SheetJS (`xlsx`) | **30.065 ms** | **900 MB** |
| Lector propio (`src/lib/siigo/import/xlsx-reader.ts`) | **1.830 ms** | **212 MB** |

12× más rápido y 4× menos memoria, porque no se construye un objeto de celda
por cada una de las 1.77 millones de celdas: se recorre el XML del ZIP con
`node:zlib` y se transforman las celdas directamente a los campos que el
importador necesita.

**El Excel nunca se procesa en el navegador.**

### 2.2 Idempotencia (5 capas)

| Capa | Mecanismo |
|---|---|
| Archivo | `file_sha256` + índice único sobre las corridas `COMPLETED` |
| Corrida | `status` + `pg_advisory_lock` (una importación a la vez) |
| Lote | `UNIQUE (run_id, batch_index)` |
| Fila | `UNIQUE (run_id, row_number)` |
| Movimiento | `UNIQUE (producto, bodega, ubicación, fecha, documento)` |

Reimportar el mismo archivo **no duplica nada**; reimportar un reporte
histórico más amplio actualiza en vez de sumar.

### 2.3 Rendimiento

La carga se hace con `INSERT … SELECT … FROM unnest(...)`: se envía **un
parámetro por columna** (un array) en vez de uno por celda. Medido:

| Operación | Antes | Después |
|---|---|---|
| Guardado del staging (65.831 filas) | ~120 s | ~70 s |
| Catálogo del resumen (1.344 productos) | ~440 s | **7 s** |

Además, las filas se insertan en bloques de 20.000 y las consultas de
catálogo van en un solo enunciado por bloque.

---

## 3. Existencias y reservas (no hay doble descuento)

Siigo Pyme es la fuente oficial de las existencias. La aplicación **nunca**
las modifica: solo las **reserva**.

```
EXISTENCIA INFORMADA  = siigo_balances.quantity         (solo la importación)
CANTIDAD COMPROMETIDA = Σ siigo_reservations (PENDING)
DISPONIBILIDAD        = EXISTENCIA INFORMADA − COMPROMETIDA
```

| Momento | Siigo informa | Comprometido | Disponible |
|---|---|---|---|
| Importación | 100 | 0 | 100 |
| Se genera la orden de 50 | 100 | 50 | **50** |
| Despacho la registra en Siigo | 100 | 50 | 50 |
| Nueva importación (Siigo ya bajó) | **50** | 0 | **50** |

La reserva se libera **cuando una importación demuestra el descuento** (la
diferencia entre el saldo anterior y el nuevo cubre la salida pendiente), no
cuando alguien afirma que ya se registró en Siigo. Así no hay doble descuento
ni ventana de gasto doble.

**Estados de la orden:** `DRAFT` → `GENERATED` → `DELIVERED` →
`CONFIRMED_SIIGO` → (opcional) `CANCELLED`.

---

## 4. Automatización (preparada, no simulada)

Siigo Pyme es local: la aplicación en la nube **no puede** leer las carpetas
del computador del Banco. La solución es el **agente local** (`agent/`):

1. Lee el `.xlsx` de la carpeta de intercambio.
2. Calcula el SHA-256 (si el backend ya lo tiene, no hace nada).
3. Envía las filas por lotes a un endpoint autenticado con clave de API.
4. Cierra la corrida y registra el resultado en el log local.

Se instala con la **Tarea Programada de Windows** (`agent/install.ps1`) para
ejecutarse **cada hora**. El agente **no** ejecuta ExcelSiigo ni escribe en
Siigo: solo lee el archivo que deja el procedimiento autorizado del Banco.

La **carga manual** funciona por completo y es el mecanismo de respaldo.

---

## 5. Comandos

```bash
npm run siigo:import -- "tests/fixtures/siigo-reporte-inventarios.xlsx"   # detallado
npm run siigo:import -- "tests/fixtures/siigo-reporte-resumido.xlsx"      # resumen
npm run siigo:import -- "archivo.xlsx" --force                            # reprocesar
npm run bench:import -- "tests/fixtures/siigo-reporte-inventarios.xlsx"   # rendimiento
npm run repair:codigos                                                     # fusionar duplicados
npm run agent:run                                                          # agente local
npm run agent:install                                                      # tarea programada
```

## 6. Pendientes de validación con el Banco

1. **Mapeo de las 7 bodegas de Siigo** (`PRINCIPAL`, `ALMACEN`, `Ola
   Invernal - Cordob`, `DONAC ORG ROA FLOR HU`, `CANASTO DE SEMILLA SAN`,
   `Campaña: Juntos por V`, `Bodega alterna`) con las bodegas de la aplicación.
   Los nombres llegan **truncados** en el reporte; se conservan tal cual.
2. **Reporte de existencias actuales**: el resumen no trae saldos. Se
   necesita un reporte con saldo inicial o final por producto/bodega/ubicación
   para actualizar las existencias cada 1–2 horas sin el reporte detallado.
3. **Significado de la segunda unidad** (`CANTIDAD-2 ENTRADAS` / `SALIDAS`).
4. **Nombres completos de las ubicaciones** (llegan como `GENERAL`,
   `MISCELANEA - T`, `ADQUIRIDOS`, `DODANOS`…).
5. **Catálogo oficial de parroquias y grupos de familia** para reemplazar los
   10 destinos de demostración.
