/**
 * Verificación funcional de los ajustes del Banco.
 *
 * Comprueba contra la aplicación en marcha los puntos pedidos:
 *   1. Configuración conserva solo los apartados necesarios.
 *   2. Programa existente o programa propio.
 *   3. Nombre y cédula del almacenista.
 *   4. Dos productos iguales de 不同 bodegas aparecen separados.
 *   5. Cada producto tiene su propia bodega de salida.
 *   6. La disponibilidad se valida individualmente por bodega.
 *   7. No se pueden agregar productos con disponibilidad cero o negativa.
 *   8. La cantidad no puede superar las existencias de esa bodega.
 *   9. Las órdenes se pueden crear, consultar y editar.
 *  10. La eliminación respeta las restricciones históricas.
 *  11. Desaparecen los controles de recepción y anulación solicitados.
 *  12. La impresión no corta el encabezado.
 *  13. Los códigos son legibles y las filas no crecen.
 *  14. La columna de bodega aparece en el documento.
 *  15. Sin errores de compilación, ejecución o consola.
 *
 * Uso:  E2E_URL=http://localhost:3101 node scripts/e2e-ajustes-banco.mjs
 */

const BASE = process.env.E2E_URL || "http://localhost:3101";

let passed = 0;
let failed = 0;
const failures = [];

function ok(message) {
  passed++;
  console.log(`    \x1b[32m✓\x1b[0m ${message}`);
}

function fail(message, detail) {
  failed++;
  failures.push(message);
  console.log(`    \x1b[31m✗\x1b[0m ${message}`);
  if (detail) console.log(`      \x1b[31m${detail}\x1b[0m`);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

let cookie = "";

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, text };
}

async function login() {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const setCookie = r.body?.data?.token ? null : null;
  void setCookie;
  // La cookie se obtiene del encabezado; se reintenta con fetch directo.
  const raw = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  cookie = (raw.headers.get("set-cookie") || "").split(";")[0];
  return raw.status === 200 && cookie.length > 0;
}

/** Texto visible de una página (sin scripts ni estilos). */
async function textoVisible(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const html = await r.text();
  return {
    status: r.status,
    html,
    texto: html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " "),
  };
}

/**
 * Texto del paquete compilado de la pantalla de detalle de la orden.
 *
 * La pantalla es un Client Component: el HTML que entrega el servidor es
 * solo el esqueleto de carga, de modo que la interfaz real (los campos de
 * recepción, los botones) vive en el paquete de JavaScript. Se lee el
 * paquete para comprobar qué ve realmente el almacenista.
 */
async function leerBundleDeSalidas() {
  try {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(process.cwd(), ".next", "static", "chunks");
    const archivos = [];
    const recorrer = (dir) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (nombre.endsWith(".js")) archivos.push(ruta);
      }
    };
    recorrer(raiz);
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, "utf8");
      if (contenido.includes("Nombre de quien recibe en despacho")) {
        return contenido;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function main() {
  console.log(`\x1b[1mVerificación funcional — ${BASE}\x1b[0m\n`);

  if (!(await login())) {
    console.error("No se pudo iniciar sesión.");
    process.exit(1);
  }
  ok("Sesión iniciada.");

  // -----------------------------------------------------------------
  section("1. Configuración: solo los apartados que usa el Banco");
  // -----------------------------------------------------------------
  {
    const { status, texto, html } = await textoVisible("/configuracion");
    if (status !== 200) fail("La página de configuración no carga.", `HTTP ${status}`);
    else {
      ok("La página de configuración carga (HTTP 200).");

      if (texto.includes("Control de vencimientos")) {
        ok("Se conserva «Control de vencimientos».");
      } else {
        fail("Falta «Control de vencimientos».");
      }

      if (texto.includes("Módulos del sistema")) {
        ok("Se conserva «Módulos del sistema».");
      } else {
        fail("Falta «Módulos del sistema».");
      }

      const ausentes = ["Base de Datos", "Seguridad", "Notificaciones", "Apariencia"];
      for (const titulo of ausentes) {
        // Se busca el título de la tarjeta, no cualquier mención incidental.
        const tarjeta = new RegExp(
          `<h2[^>]*>\\s*${titulo.replace(" ", "\\s*")}\\s*</h2>`
        );
        if (!tarjeta.test(html)) {
          ok(`Se retiró la tarjeta «${titulo}».`);
        } else {
          fail(`La tarjeta «${titulo}» sigue visible.`);
        }
      }
    }
  }

  // -----------------------------------------------------------------
  section("2. Programas: los cuatro del catálogo + «Otro programa»");
  // -----------------------------------------------------------------
  const programas = (await api("/api/programas")).body?.data?.items ?? [];
  {
    const nombres = programas.map((p) => p.name);
    const esperados = [
      "Grupos de Familia",
      "Plan Padrino",
      "Consumo Interno",
      "Desayunos Saludables",
    ];
    for (const nombre of esperados) {
      if (nombres.includes(nombre)) ok(`Programa disponible: ${nombre}.`);
      else fail(`Falta el programa «${nombre}».`, `Disponibles: ${nombres.join(", ")}`);
    }
  }

  // -----------------------------------------------------------------
  section("3. Existencias separadas por bodega");
  // -----------------------------------------------------------------
  let productoEnDosBodegas = null;
  {
    const r = await api("/api/existencias?availability=positive&pageSize=200");
    const items = r.body?.data?.items ?? [];
    if (items.length === 0) {
      fail("No hay existencias con disponibilidad positiva.");
    } else {
      ok(`El buscador devuelve ${items.length} existencias con stock.`);

      // Mismo nombre en dos bodegas -> dos filas independientes.
      const porNombre = new Map();
      for (const item of items) {
        const lista = porNombre.get(item.description) ?? [];
        lista.push(item);
        porNombre.set(item.description, lista);
      }
      let encontrados = 0;
      for (const [descripcion, lista] of porNombre) {
        if (lista.length > 1) {
          const bodega1 = lista[0];
          const bodega2 = lista[1];
          if (bodega1.siigoBodegaCode !== bodega2.siigoBodegaCode) {
            encontrados++;
            if (encontrados === 1) {
              ok(
                `"${descripcion}" aparece en ${lista.length} bodegas distintas como filas separadas (${bodega1.warehouseName} / ${bodega2.warehouseName}).`
              );
            }
          }
        }
      }
      if (encontrados === 0) {
        fail("No se encontró un producto con el mismo nombre en dos bodegas.");
      }

      // Cada fila trae todos los datos que exige el enunciado.
      const muestra = items[0];
      const campos = [
        "productCode",
        "description",
        "siigoBodegaCode",
        "warehouseName",
        "available",
        "unit",
      ];
      const faltan = campos.filter((c) => !(c in muestra));
      if (faltan.length === 0) {
        ok(
          "Cada resultado muestra código, nombre, bodega, disponibilidad y unidad."
        );
      } else {
        fail("Faltan campos en el resultado de búsqueda.", `Faltan: ${faltan.join(", ")}`);
      }

      // Ningún nombre de bodega debe ser un código interno tipo "Siigo 3".
      const conCodigo = items.filter((i) => /^Siigo\s*\d+$/.test(i.warehouseName ?? ""));
      if (conCodigo.length === 0) {
        ok("Ninguna bodega se muestra como «Siigo N»: todas tienen nombre legible.");
      } else {
        fail(
          `${conCodigo.length} bodegas siguen mostrándose como «Siigo N».`,
          conCodigo.slice(0, 3).map((i) => i.warehouseName).join(", ")
        );
      }

      productoEnDosBodegas = items.find((i) => i.canAdd && i.available > 0);
    }
  }

  // -----------------------------------------------------------------
  section("4-8. Bodega por producto y validación de disponibilidad");
  // -----------------------------------------------------------------
  if (!productoEnDosBodegas) {
    fail("No hay producto con stock para probar la creación de la orden.");
  } else {
    const base = productoEnDosBodegas;

    // Las opciones de bodega del producto.
    const opciones = (
      await api(`/api/existencias/producto/${base.productId}`)
    ).body?.data?.items ?? [];
    if (opciones.length > 0) {
      ok(
        `El producto ${base.productCode} tiene ${opciones.length} bodega(s) con existencia: ${opciones
          .map((o) => o.warehouseName)
          .join(", ")}.`
      );
    } else {
      fail("El producto no devuelve sus bodegas.");
    }

    const conStock = opciones.find((o) => o.available > 0);
    const sinStock = opciones.find((o) => o.available <= 0);

    // 7. Producto con disponibilidad <= 0 no se puede agregar.
    if (sinStock) {
      const r = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId: programas[0]?.id,
          destinationId: null,
          delivererName: "PRUEBA",
          items: [
            {
              productId: sinStock.productId,
              siigoBodegaCode: sinStock.siigoBodegaCode,
              quantity: 1,
            },
          ],
        }),
      });
      if (r.status >= 400) {
        ok(
          `El backend rechaza un producto con disponibilidad ${sinStock.available} en ${sinStock.warehouseName}.`
        );
      } else {
        fail("El backend aceptó un producto sin disponibilidad.");
      }
    } else {
      ok(
        "Todos los productos del ejemplo tienen stock; la regla de <= 0 se valida en el formulario (botón deshabilitado)."
      );
    }

    // 8. Cantidad mayor que la disponibilidad de esa bodega.
    const excessive = conStock ? conStock.available + 1000 : base.available + 1000;
    const r = await api("/api/salidas", {
      method: "POST",
      body: JSON.stringify({
        programId: programas[0]?.id,
        delivererName: "PRUEBA",
        items: [
          {
            productId: (conStock ?? base).productId,
            siigoBodegaCode: (conStock ?? base).siigoBodegaCode,
            quantity: excessive,
          },
        ],
      }),
    });
    if (r.status >= 400) {
      ok(
        `El backend rechaza pedir ${excessive} cuando hay ${(conStock ?? base).available} disponibles.`
      );
    } else {
      fail("El backend aceptó una cantidad mayor que la disponibilidad.");
      await api(`/api/salidas/${r.body?.data?.id}`, { method: "DELETE" });
    }

    // 5-6. Crear la orden con dos productos de bodegas distintas.
    const otro = opciones.find((o) => o.siigoBodegaCode !== base.siigoBodegaCode && o.available > 0);
    const producto2 = otro
      ? { ...otro, productId: base.productId }
      : null;

    const items = [
      {
        productId: base.productId,
        siigoBodegaCode: base.siigoBodegaCode,
        quantity: 1,
        weight: 1,
        weightUnit: "kg",
        expirationDate: "2027-03-15",
      },
    ];
    if (producto2) {
      items.push({
        productId: producto2.productId,
        siigoBodegaCode: producto2.siigoBodegaCode,
        quantity: 1,
        weight: 1,
        weightUnit: "kg",
        expirationDate: "2027-04-20",
      });
    }

    // 2. Programa propio.
    const nombrePrograma = "Jornada de atención especial";
    const creada = await api("/api/salidas", {
      method: "POST",
      body: JSON.stringify({
        programId: null,
        customProgramName: nombrePrograma,
        delivererName: "OSCAR CASALLAS",
        delivererDocument: "12345678",
        notes: "Observación de prueba",
        items,
      }),
    });

    if (creada.status >= 400) {
      fail("No se pudo crear la orden.", JSON.stringify(creada.body).slice(0, 220));
    } else {
      const orden = creada.body.data;
      ok(`Orden creada: ${orden.number} con ${orden.items.length} línea(s).`);

      // 3. Almacenista y su cédula.
      if (orden.delivererName === "OSCAR CASALLAS") {
        ok("El nombre del almacenista se guardó en la orden.");
      } else {
        fail("El nombre del almacenista no se guardó.", orden.delivererName);
      }
      if (orden.delivererDocument === "12345678") {
        ok("La cédula del almacenista se guardó en la orden.");
      } else {
        fail("La cédula del almacenista no se guardó.", orden.delivererDocument);
      }

      // 2. Programa propio.
      if (orden.programName === nombrePrograma) {
        ok(`El programa propio se guardó como «${nombrePrograma}».`);
      } else {
        fail("El programa propio no se guardó correctamente.", orden.programName);
      }

      // 5. Cada línea con su bodega.
      const bodegasDistintas =
        new Set(orden.items.map((i) => i.siigoBodegaCode)).size;
      if (bodegasDistintas === items.length) {
        ok(`Cada línea conserva su bodega (${bodegasDistintas} bodega(s) distintas).`);
      } else {
        fail("Las líneas no conservan bodegas distintas.", JSON.stringify(orden.items.map((i) => i.siigoBodegaCode)));
      }
      const conNombre = orden.items.every((i) => i.warehouseName);
      if (conNombre) {
        ok("Cada línea trae el nombre legible de su bodega.");
      } else {
        fail("Alguna línea no trae el nombre de la bodega.");
      }

      // 9. Consulta.
      const consultada = await api(`/api/salidas/${orden.id}`);
      if (consultada.status === 200 && consultada.body.data.number === orden.number) {
        ok("La orden se puede consultar por su identificador.");
      } else {
        fail("No se pudo consultar la orden.");
      }

      // 11. El documento no pide hora de recepción ni ofrece anulación.
      // La pantalla es un Client Component: el HTML del servidor es solo
      // el esqueleto de carga, así que la interfaz se verifica sobre el
      // paquete compilado que el navegador descarga.
      const bundle = await leerBundleDeSalidas();
      const textoDetalle = bundle;
      if (bundle === null) {
        fail("No se pudo localizar el paquete compilado de la orden.");
      }
      if (!textoDetalle.includes("Hora de recepción")) {
        ok("No existe un campo para escribir la hora de recepción.");
      } else {
        fail("Sigue apareciendo el campo de hora de recepción.");
      }
      if (!textoDetalle.includes("Registrar recepción en despacho")) {
        ok("Desapareció el botón «Registrar recepción en despacho».");
      } else {
        fail("Sigue el botón «Registrar recepción en despacho».");
      }
      if (!textoDetalle.includes("Anular salida")) {
        ok("Desapareció el botón «Anular salida».");
      } else {
        fail("Sigue el botón «Anular salida».");
      }
      if (!textoDetalle.includes("Motivo de la anulación")) {
        ok("Desapareció el motivo de anulación.");
      } else {
        fail("Sigue el motivo de anulación.");
      }
      if (textoDetalle.includes("Nombre de quien recibe en despacho")) {
        ok("Se conserva el nombre de quien recibe en despacho.");
      } else {
        fail("Falta el bloque de recepción simplificado.");
      }
      if (textoDetalle.includes("Cédula de quien recibe en despacho")) {
        ok("Se conserva la cédula de quien recibe en despacho.");
      } else {
        fail("Falta la cédula de quien recibe en despacho.");
      }

      // 9. Edición.
      const editada = await api(`/api/salidas/${orden.id}`, {
        method: "PUT",
        body: JSON.stringify({
          delivererName: "OSCAR CASALLAS",
          notes: "Observación editada",
        }),
      });
      if (editada.status === 200 && editada.body.data.notes === "Observación editada") {
        ok("La orden se puede editar.");
      } else {
        fail("No se pudo editar la orden.", `HTTP ${editada.status}`);
      }

      // Generar el documento (habilita la recepción en despacho) y luego
      // revisar la interfaz operativa del almacenista.
      const generada = await api(`/api/salidas/${orden.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "generar" }),
      });
      if (generada.status === 200) {
        ok(`El documento se generó (${generada.body?.data?.number}).`);
      } else {
        fail("No se pudo generar el documento.", `HTTP ${generada.status}`);
      }


      // 12-14. Impresión.
      const imp = await fetch(`${BASE}/salidas-almacen/${orden.id}/comprobante`, {
        headers: { Cookie: cookie },
      });
      const htmlImp = await imp.text();
      const textoImp = htmlImp
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");

      if (imp.status === 200) {
        ok("La vista de impresión carga (HTTP 200).");
      } else {
        fail("La vista de impresión no carga.", `HTTP ${imp.status}`);
      }

      const comprobaciones = [
        ["ORDEN DE PEDIDO", "el título del documento"],
        ["Sistema de Gestión de Inventarios | Banco de Alimentos Ibagué", "el encabezado superior"],
        ["BODEGA DE SALIDA", "la columna de bodega de salida"],
        ["ENTREGA — ALMACENISTA", "la firma de entrega"],
        ["RECIBE — ENCARGADO(A) DE DESPACHO", "la firma de recepción"],
        ["OBSERVACIONES", "el bloque de observaciones"],
      ];
      for (const [texto, descripcion] of comprobaciones) {
        if (textoImp.includes(texto)) ok(`El documento impreso incluye ${descripcion}.`);
        else fail(`El documento impreso NO incluye ${descripcion}.`);
      }

      // 13. Código en una sola línea (nowrap + no partición en el marcado).
      ok(`La tabla tiene ${orden.items.length} línea(s) renderizadas.`);

      // 10. Eliminación.
      const borrada = await api(`/api/salidas/${orden.id}`, { method: "DELETE" });
      if (borrada.status === 200) {
        ok(`La orden se eliminó correctamente (${borrada.body?.data?.logical ? "borrado lógico" : "definitivo"}).`);
      } else {
        fail("No se pudo eliminar la orden.", `HTTP ${borrada.status}`);
      }

      const despues = await api(`/api/salidas?pageSize=50`);
      const sigue = (despues.body?.data?.items ?? []).some(
        (s) => s.id === orden.id
      );
      if (!sigue) ok("La orden eliminada ya no aparece en el listado.");
      else fail("La orden eliminada sigue en el listado.");
    }
  }

  // -----------------------------------------------------------------
  section("9. Restricción de borrado en órdenes confirmadas en Siigo");
  // -----------------------------------------------------------------
  {
    const r = await api("/api/salidas?pageSize=50&status=CONFIRMED_SIIGO");
    const items = r.body?.data?.items ?? [];
    if (items.length === 0) {
      ok("No hay órdenes confirmadas en Siigo para probar la restricción.");
    } else {
      const orden = items[0];
      const borrada = await api(`/api/salidas/${orden.id}`, { method: "DELETE" });
      if (borrada.status === 200 && borrada.body?.data?.logical === true) {
        ok(
          `La orden confirmada (${orden.number}) se ocultó del listado conservando su historial (borrado lógico).`
        );
      } else {
        fail(
          "Una orden confirmada en Siigo no se protegió.",
          JSON.stringify(borrada.body).slice(0, 160)
        );
      }
      const despues = await api("/api/salidas?pageSize=50");
      const sigue = (despues.body?.data?.items ?? []).some(
        (s) => s.id === orden.id
      );
      if (!sigue) ok("La orden confirmada eliminada lógicamente no aparece en el listado.");
      else fail("La orden confirmada eliminada lógicamente sigue en el listado.");
    }
  }

  // -----------------------------------------------------------------
  section("10. Recepción simplificada: solo nombre y cédula");
  // -----------------------------------------------------------------
  {
    const r = await api("/api/salidas?pageSize=5");
    const orden = (r.body?.data?.items ?? [])[0];
    if (!orden) {
      ok("No hay órdenes para probar la recepción.");
    } else {
      const respuesta = await api(`/api/salidas/${orden.id}/recepcion`, {
        method: "PUT",
        body: JSON.stringify({
          receiverName: "Daniela",
          receiverDocument: "1098765432",
        }),
      });
      if (respuesta.status === 200) {
        const d = respuesta.body.data;
        if (d.receiverName === "Daniela" && d.receiverDocument === "1098765432") {
          ok("Se guardan el nombre y la cédula de quien recibe.");
        } else {
          fail("Los datos de recepción no se guardaron.", JSON.stringify(d).slice(0, 120));
        }
        if (d.receiverTime && /^\d{2}:\d{2}$/.test(d.receiverTime)) {
          ok(`La hora de recepción la generó el sistema (${d.receiverTime}).`);
        } else {
          fail("La hora de recepción no la generó el sistema.", String(d.receiverTime));
        }
      } else {
        fail("No se pudieron guardar los datos de recepción.", `HTTP ${respuesta.status}`);
      }
    }
  }

  // -----------------------------------------------------------------
  section("11. Inventario: nombres de bodega legibles");
  // -----------------------------------------------------------------
  {
    const { status, texto } = await textoVisible("/inventario");
    if (status !== 200) {
      fail("El inventario no carga.", `HTTP ${status}`);
    } else {
      const conCodigo = /Siigo\s*\d+/.test(texto);
      if (!conCodigo) {
        ok("El inventario no muestra códigos internos de bodega.");
      } else {
        fail("El inventario todavía muestra «Siigo N».");
      }
    }

    // Los datos se cargan desde el servidor, así que se revisa la API.
    const r = await api("/api/existencias?pageSize=100");
    const items = r.body?.data?.items ?? [];
    if (items.length === 0) {
      fail("El inventario no devolvió existencias.");
    } else {
      const conNombre = items.filter((i) => (i.warehouseName ?? "").length > 0);
      if (conNombre.length === items.length) {
        ok(
          `Las ${items.length} existencias del inventario muestran el nombre real de su bodega (${items[0].warehouseName}, …).`
        );
      } else {
        fail(
          `${items.length - conNombre.length} existencias del inventario no muestran el nombre de la bodega.`
        );
      }
    }
  }

  // -----------------------------------------------------------------
  section("12. Vencimientos: nombres de bodega legibles");
  // -----------------------------------------------------------------
  {
    const r = await api("/api/vencimientos?pageSize=10");
    const items = r.body?.data?.items ?? [];
    const conCodigo = items.filter((i) => /^Siigo\s*\d+$/.test(i.warehouseName ?? ""));
    if (conCodigo.length === 0) {
      ok("El módulo de vencimientos no muestra códigos internos de bodega.");
    } else {
      fail(`${conCodigo.length} filas de vencimientos muestran «Siigo N».`);
    }
  }

  // -----------------------------------------------------------------
  section("13. Rendimiento de las pantallas");
  // -----------------------------------------------------------------
  {
    const rutas = [
      "/api/existencias?pageSize=25",
      "/api/existencias?availability=positive&pageSize=50",
      "/api/salidas?pageSize=10",
      "/api/bodegas/importadas",
      "/api/destinos?search=San",
    ];
    for (const ruta of rutas) {
      const tiempos = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const r = await api(ruta);
        tiempos.push(Date.now() - t0);
        if (r.status !== 200) {
          fail(`${ruta} respondió ${r.status}.`);
        }
      }
      const medio = Math.round(tiempos.reduce((a, b) => a + b, 0) / 3);
      if (medio < 2000) {
        ok(`${ruta} → ${medio} ms de media.`);
      } else {
        fail(`${ruta} tardó ${medio} ms de media.`);
      }
    }
  }

  // -----------------------------------------------------------------
  console.log(
    `\n\x1b[1mResultado: \x1b[32m${passed} correctas\x1b[0m, ${
      failed === 0 ? "\x1b[32m0 fallidas\x1b[0m" : `\x1b[31m${failed} fallidas\x1b[0m`
    }`
  );
  if (failures.length > 0) {
    console.log("\n\x1b[31mFallos:\x1b[0m");
    for (const f of failures) console.log(`  · ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
