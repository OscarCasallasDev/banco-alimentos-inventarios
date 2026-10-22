# Guía de prueba en el navegador

**Sistema de Gestión, Trazabilidad y Conciliación de Inventarios**
**Banco Arquidiocesano de Alimentos de Ibagué**

> Checklist para revisar el sistema completo en el navegador, módulo por
> módulo, y comprobar que cada uno funciona y guarda la información.

---

## 0. Antes de empezar

### 0.1 Desactiva la extensión que rompe la página (importante)

Si al abrir la aplicación ves este error en la consola:

```
A tree hydrated but some attributes of the server rendered HTML didn't match
the client properties.
- cz-shortcut-listen="true"
```

**No es un error del sistema.** Es la extensión del navegador **cz-shortcut**
(atajos de teclado / "deshacer" rápido). Inyecta ese atributo en el `<body>`
antes de que React cargue, y por eso React se queja.

Cómo resolverlo:

1. Abre `chrome://extensions` (o `edge://extensions`).
2. Busca **cz-shortcut** (o "Command+Z") y ponlo en **desactivado**, o
  (Configuración → "Permitir en estos sitios" → quita `localhost`).
3. Recarga la página con `Ctrl + Shift + R`.

> La aplicación ya incluye `suppressHydrationWarning` en el `<body>` para que
> este tipo de inyección no bloquee el renderizado. Aun así, desactivar la
> extensión es lo más limpio para la demostración.

### 0.2 Levanta la aplicación

```bash
npm run dev
```

Abre **http://localhost:3000**.

| Dato | Valor |
|---|---|
| Usuario | `admin` |
| Contraseña | `admin123` |
| Rol | SUPERADMIN |

### 0.3 Verificación automática (opcional pero recomendado)

```bash
npm run check:modulos
```

Verifica los 14 módulos de forma automática y te imprime qué debes ver en
cada pantalla. Si sale `51/51`, la aplicación está bien y lo que ves es solo
la interfaz.

---

## 1. Inicio de sesión

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1.1 | Abre `http://localhost:3000` | Te redirige a `/login` |
| 1.2 | Escribe `admin` / `admin123` y pulsa **Ingresar** | Entras al **Dashboard** en 1–2 s |
| 1.3 | Mira la esquina superior derecha | Aparece **Admin Sistema** y el rol **SUPERADMIN** |
| 1.4 | Pulsa **Cerrar Sesión** | Vuelves a `/login` |
| 1.5 | Entra de nuevo | El dashboard se abre directo (ya no pide login) |

> Si al entrar ya tienes sesión activa, la app te salta al dashboard sola.

---

## 2. Dashboard — `/dashboard`

| Qué mirar | Resultado esperado |
|---|---|
| Tarjetas de arriba | **Total Productos**, **Total Unidades**, **Entradas/Salidas Recientes**, **Stock Bajo**, **Auditorías Pendientes**, **Bodegas**, **Usuarios** — con números > 0 |
| Banner superior | Logo del Banco, título del sistema |
| Módulos del Sistema | 12 tarjetas: Entradas, Salidas, Pedidos, Facturas, Recibos, Auditoría, Inventario, Productos, Bodegas, Reportes, Usuarios, Integración Siigo |
| Entradas Recientes | Lista las últimas entradas con número, formato y fecha |
| Salidas Recientes | Lista los últimos despachos |
| Productos con Stock Bajo | Tabla con los productos bajo el mínimo (existencia y mínimo) |

**Prueba**: haz clic en cada tarjeta de módulo → debe llevarte a su página.

---

## 3. Productos — `/productos`

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con código, nombre, categoría, stock mínimo y estado |
| **Nuevo Producto** → código `PRUEBA-01`, nombre `Producto de prueba`, peso `0.5`, unidad `kg`, categoría `Granos`, stock mínimo `10` | Se guarda y aparece en la tabla con **categoría** y **stock mínimo** visibles |
| Intenta crear otro con el **mismo código** | Error: *"El código del producto ya existe"* |
| Escribe un código con espacios o minúsculas y guárdalo | El código se normaliza a mayúsculas |
| **Editar** el producto | Los datos se cargan y el cambio se guarda (antes fallaba) |
| **Eliminar** (ícono de papelera) | Pide confirmación, lo **desactiva** (no lo borra) y avisa que conserva el historial |

---

## 4. Bodegas — `/bodegas`

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con código, nombre, tipo y estado |
| **Nueva Bodega** → código `V.99`, nombre `Bodega de prueba`, tipo `PROPIA` | Se guarda y aparece en la tabla |
| **Editar** | Los cambios se guardan |
| **Eliminar** | La bodega se desactiva, no se borra |

---

## 5. Inventario — `/inventario`

| Qué mirar | Resultado esperado |
|---|---|
| Tabla | Producto, código, bodega, cantidad y fecha del último movimiento |
| Buscador | Filtra por producto, código o bodega (en vivo) |
| Contador de stock bajo | Muestra las existencias por debajo del umbral |

> **Clave**: el inventario **no se edita a mano**. Cambia cuando creas una
> entrada o un despacho. Verifícalo en el paso 7.

---

## 6. Entradas — `/entradas`

> Detalle completo del procedimiento y del comprobante en
> **[MODULO_ENTRADAS.md](./MODULO_ENTRADAS.md)**.

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con número, tipo, fecha, entidad, estado y botón **Imprimir** |
| **Nueva Entrada** → tipo **E3** | Aparece el título *NOTA ENTRADA PRODUCCIÓN OTROS* y el código `E-003` |
| Busca la entidad (NIT, nombre o sucursal) | Se completan solos el **NIT** y la **razón social** (en mayúsculas) |
| Registra la fecha y la orden de compra | Quedan como campos independientes |
| **Agregar producto** → busca por ref, nombre o categoría | Se completan código, descripción y unidad |
| Elige la bodega | Desplegable con las bodegas activas; para E3 se propone **1.1** y para E1 **1.2** |
| Registra cantidad, unidad, ubicación y valor | El valor admite 0; la cantidad admite decimales |
| **Lotes** → *Agregar lote* | Código, «Lotes Inicial», fecha de vencimiento y cantidad por lote |
| Guarda con lotes que no cuadran | Error: «los lotes suman X y la cantidad es Y» |
| Guarda con un producto sin código | Error indicando la línea a corregir |
| **Guardar** | Se genera el número `E-003-n` y se pregunta si se imprime |
| **Imprimir** | Abre el comprobante con el diseño de la plantilla |
| Vuelve a **Inventario** | La existencia del producto cambió exactamente con la cantidad registrada |

### Comprobante impreso

| Qué mirar | Resultado esperado |
|---|---|
| Encabezado | Logo (escala de grises) · nombre y datos del Banco · título y `E - 003 - n` |
| Entidad | SEÑORES, NIT, DIRECCIÓN, TELÉFONO, CIUDAD, FECHA DOCUMENTO, ORDEN DE COMPRA |
| Tabla | CÓDIGO, DESCRIPCIÓN, C. de COSTO, BODEGA, CANTIDAD, UNIDAD, VALOR |
| Lotes | Código, denominación, `F.V.: AAAA-MM-DD` y cantidad |
| Observaciones | Etiqueta `OBSERVACIONES:` con el espacio de escritura |
| Tamaño | Media hoja carta (21,59 × 13,97 cm), en blanco y negro |

---

## 7. Flujo de salida: Pedido → Factura → Recibo → Despacho

Este es el flujo central del sistema. Hazlo en orden:

| Paso | Módulo | Qué hacer | Resultado esperado |
|---|---|---|---|
| 7.1 | **Pedidos** | Nueva: destino `Comunidad de prueba`, 1 ítem (producto + bodega + cantidad) | Se crea `PED-2026-XXXX`, estado **Aprobado** |
| 7.2 | **Facturas** | Nueva: formato `SF1`, selecciona el pedido | Se crea `FAC-2026-XXXX` y el pedido queda **Facturado** |
| 7.3 | **Recibos** | Nueva: formato `R1`, selecciona la factura | Se crea `REC-2026-XXXX` |
| 7.4 | **Salidas** | Nuevo: selecciona el recibo | Se crea `DES-2026-XXXX`, estado **Despachado** |
| 7.5 | **Inventario** | Revisa el producto | La existencia **bajó** en la cantidad despachada |
| 7.6 | **Pedidos** | Revisa el pedido | Ahora está en estado **Despachado** |

### Reglas que puedes comprobar a propósito

| Prueba | Resultado esperado |
|---|---|
| Crea un pedido de **5000** unidades con solo 100 disponibles, y despáchalo | Error: *"Stock insuficiente…"* y el inventario **no cambia** |
| Intenta crear un **segundo despacho** del mismo recibo | Error: el recibo ya tiene un despacho |
| Crea un pedido **sin ítems** | Error: *"Debe tener al menos un item"* |
| Crea una entrada con cantidad **0** o **negativa** | Error de validación |

---

## 8. Auditoría — `/auditoria`

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con fecha, **bodega**, responsable y estado |
| **Nueva Auditoría**: bodega, responsable, 1 ítem con cantidad física | Se guarda como **Completada** |
| Ve a **Inventario** | La existencia del producto cambió a la cantidad física que contaste |
| Revisa la auditoría | La **diferencia** = físico − sistema, calculada por el sistema |

> La existencia del sistema la toma el servidor de la base de datos, no lo que
> escribas en el formulario. Si anotas 100 y en el sistema hay 90, la
> diferencia es **+10** y el inventario queda en 100.

---

## 9. Reportes — `/reportes`

| Sección | Resultado esperado |
|---|---|
| Inventario por Bodega | Una fila por bodega con nº de productos y unidades |
| Productos con Stock Bajo | Solo los que están por debajo del mínimo |
| Entradas Recientes | Las últimas entradas con su formato y estado |
| Diferencias de Auditoría | Los productos con diferencia entre sistema y físico |

---

## 10. Usuarios — `/usuarios`

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con usuario, nombre completo, rol, estado y último ingreso |
| **Nuevo Usuario** (incluye correo) | Se crea y aparece con su nombre y rol |
| Intenta crear uno con el **mismo usuario o correo** | Error: ya está en uso |
| **Editar** (cambia el rol) | Se guarda correctamente |
| **Eliminar** | Se desactiva, no se borra; no puedes desactivar tu propio usuario |

---

## 11. Integración Siigo — `/integracion-siigo`

| Qué hacer | Resultado esperado |
|---|---|
| Abre el módulo | Tabla con los 10 formatos (E1, E3, N3, N5, SF1, F2, R1–R4) y su estado |
| **Exportar** en cualquier formato | Se descarga un `.xlsx` con dos hojas: *Encabezado* e *Items* |
| Abre el archivo | Contiene los datos **reales** de tu sistema (productos, bodegas, cantidades) |

> Estado **Demo**: la estructura funciona y trae datos reales, pero la
> plantilla oficial de ExcelSiigo está pendiente de validación con el Banco.

---

## 12. Configuración — `/configuracion`

| Qué mirar | Resultado esperado |
|---|---|
| Base de Datos | Host de conexión, estado **Conectado**, latencia en ms y nº de productos |
| Seguridad | Hash de contraseñas, tipo de sesión y forma de acceso a datos |
| Notificaciones / Apariencia | Ajustes del sistema |

Si el estado dice **Sin conexión**, ejecuta `npm run db:check`.

---

## 13. Cierre de sesión

| Qué hacer | Resultado esperado |
|---|---|
| **Cerrar Sesión** (avatar arriba a la derecha o el ícono del menú lateral) | Vuelves a `/login` |
| Escribe `http://localhost:3000/dashboard` en la barra | Te redirige a `/login` |

---

## Checklist final

| # | Módulo | ✓ |
|---|---|---|
| 1 | Inicio de sesión y cierre de sesión | ☐ |
| 2 | Dashboard con indicadores | ☐ |
| 3 | Productos (crear, editar, duplicado, desactivar) | ☐ |
| 4 | Bodegas (crear, editar, desactivar) | ☐ |
| 5 | Inventario (listado y buscador) | ☐ |
| 6 | Entradas (tipo, entidad, lotes, valor) + comprobante impreso | ☐ |
| 7 | Pedido → Factura → Recibo → Despacho (baja el stock) | ☐ |
| 8 | Reglas: stock insuficiente y un solo despacho por recibo | ☐ |
| 9 | Auditoría (conciliación y ajuste de stock) | ☐ |
| 10 | Reportes (4 secciones) | ☐ |
| 11 | Usuarios (crear, editar, desactivar) | ☐ |
| 12 | Integración Siigo (exportar Excel) | ☐ |
| 13 | Configuración (estado de la conexión) | ☐ |

---

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| "A tree hydrated but some attributes…" | Extensión cz-shortcut | Desactívala para `localhost` y recarga con `Ctrl+Shift+R` |
| "No se pudo conectar con el servidor" | Base de datos caída o sin credenciales | `npm run db:check` y revisa `.env.local` |
| "getaddrinfo ENOTFOUND db.…supabase.co" | El DNS del host directo falló | La app reintenta sola con el pooler. Si persiste: `npm run db:check` |
| "Sin conexión con la base de datos" (pantalla con botón *Reintentar*) | Ninguna de las conexiones respondió | `npm run db:check` y revisa tu internet |
| "Runtime Error / Server" con `Failed query` | Fallo de red en una consulta | `npm run db:check`; la app ya reintenta con la conexión de respaldo |
| Pantalla en blanco tras el login | Extensión rompiendo la hidratación | Desactívala (ver 0.1) |
| "Credenciales inválidas" | La semilla no está cargada | `npm run db:setup` |
| Faltan tablas | Migraciones sin aplicar | `npm run db:setup` |
| Datos de prueba mezclados con los tuyos | Corridas de verificación | `npm run db:setup:reset` (deja solo la semilla demo) |

---

## Verificación automática equivalente

Si prefieres no revisar a mano, estos comandos comprueban lo mismo:

```bash
npm run check:modulos   # los 14 módulos: página + datos (51 comprobaciones)
npm run test:e2e        # el flujo completo con 60 pruebas
npm run verify          # conexión + esquema + datos escritos en Supabase
npm run check:ui        # render de las 14 páginas
```
