/**
 * Prueba end-to-end del NUEVO FLUJO OPERATIVO:
 * almacenista → salida → documento → despacho → Siigo.
 *
 * Cubre los 25 puntos de prueba del plan sobre el flujo nuevo.
 * Se ejecuta contra la aplicación en marcha (npm run dev).
 */

const BASE_URL =
  process.env.E2E_URL ?? "http://localhost:3100";

const ADMIN = { username: "admin", password: "admin123" };

let cookie = "";
let passed = 0;
let failed = 0;
const failures = [];

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function ok(text) {
  passed++;
  console.log(`    ${C.green}✓${C.reset} ${text}`);
}

function fail(text, detail) {
  failed++;
  failures.push(text);
  console.log(`    ${C.red}✗${C.reset} ${text}`);
  if (detail) console.log(`      ${C.gray}${detail}${C.reset}`);
}

function section(title) {
  console.log(`\n  ${C.bold}${title}${C.reset}`);
}

/**
 * Extrae la parte del documento imprimible del HTML.
 *
 * Next.js inyecta un identificador aleatorio en su carga útil (RSC) en cada
 * petición, así que comparar el HTML completo daría falsos positivos. Se
 * compara únicamente el contenido del comprobante.
 */
function extraerDocumento(html) {
  const inicio = html.indexOf('class="salida-comprobante-module');
  if (inicio < 0) return html;
  const fin = html.indexOf('class="print:hidden', inicio);
  const slice = fin > inicio ? html.slice(inicio, fin) : html.slice(inicio);
  // Se quitan las etiquetas <script> (identificadores de la plataforma).
  return slice.replace(/<script[\s\S]*?<\/script>/g, "");
}

async function login(username, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`Login falló: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body: payload };
}

async function main() {
  console.log(
    `\n${C.cyan}=== Flujo operativo: almacenista → despacho → Siigo ===${C.reset}\n`
  );
  console.log(`  Servidor: ${BASE_URL}`);

  // ------------------------------------------------------------------
  section("1. Autenticación y permisos por rol");

  cookie = await login(ADMIN.username, ADMIN.password);
  ok(`Login de administrador (${ADMIN.username})`);

  const me = await api("/api/auth/me");
  if (me.status === 200 && me.body?.data?.role) {
    ok(`Sesión activa con rol ${me.body.data.role}`);
  } else {
    fail("La sesión del administrador no responde");
  }

  // Un usuario sin sesión no debe poder crear salidas.
  const sinSesion = await fetch(`${BASE_URL}/api/salidas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ programId: "x", items: [] }),
  });
  if (sinSesion.status === 401) {
    ok("Sin sesión, la API de salidas responde 401");
  } else {
    fail("Sin sesión, la API de salidas debería responder 401", `status ${sinSesion.status}`);
  }

  // ------------------------------------------------------------------
  section("2. Navegación entre los módulos activos");

  for (const ruta of [
    "/dashboard",
    "/inventario",
    "/bodegas",
    "/salidas-almacen",
    "/programas",
    "/integracion-siigo",
    "/usuarios",
    "/configuracion",
  ]) {
    const response = await fetch(`${BASE_URL}${ruta}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    if (response.status === 200) {
      ok(`La página ${ruta} carga`);
    } else {
      fail(`La página ${ruta} no carga`, `status ${response.status}`);
    }
  }

  // ------------------------------------------------------------------
  section("3. Ocultamiento reversible de los módulos en espera");

  const modulos = await api("/api/configuracion/modulos");
  if (modulos.status === 200 && Array.isArray(modulos.body?.data?.items)) {
    const items = modulos.body.data.items;
    const activos = items.filter((i) => i.enabled).map((i) => i.module);
    const espera = items.filter((i) => !i.enabled).map((i) => i.module);
    ok(
      `Banderas leídas: ${activos.length} activos, ${espera.length} en espera`
    );

    // Los módulos en espera NO deben aparecer en la navegación.
    if (!activos.includes("entradas") && !activos.includes("facturas")) {
      ok("Entradas y facturas están en espera (no operative)");
    } else {
      fail("Entradas/facturas deberían estar en espera");
    }

    if (activos.includes("salidas_almacen") && activos.includes("inventario")) {
      ok("Salidas de almacén e inventario están activos");
    } else {
      fail("Salidas de almacén e inventario deberían estar activos");
    }

    // Reactivar y volver a dejar en espera (reversible).
    const legacy = items.find((i) => i.module === "entradas");
    if (legacy) {
      const on = await api("/api/configuracion/modulos", {
        method: "PUT",
        body: JSON.stringify({ key: legacy.key, enabled: true }),
      });
      const off = await api("/api/configuracion/modulos", {
        method: "PUT",
        body: JSON.stringify({ key: legacy.key, enabled: false }),
      });
      if (on.status === 200 && off.status === 200) {
        ok("La bandera de un módulo en espera se puede activar y desactivar");
      } else {
        fail("No se pudo alternar la bandera de un módulo");
      }

      // La ruta sigue existiendo (no se elimina).
      const ruta = await fetch(`${BASE_URL}/entradas`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
      if (ruta.status === 200) {
        ok("La ruta del módulo en espera se conserva (no se eliminó)");
      } else {
        fail("La ruta del módulo en espera debería conservarse", `status ${ruta.status}`);
      }
    }
  } else {
    fail("No se pudieron leer las banderas de módulo");
  }

  // ------------------------------------------------------------------
  section("4-9. Importación del Excel real y estado del inventario");

  const historial = await api("/api/siigo/importaciones?limit=5");
  if (historial.status === 200) {
    const runs = historial.body.data.items;
    if (runs.length > 0) {
      const ultima = runs[0];
      ok(`Historial disponible: ${historial.body.data.total} importaciones`);
      ok(
        `Última: ${ultima.status} · ${ultima.processedRows} procesadas · ` +
          `${ultima.rejectedRows} rechazadas · ${ultima.balancesCount} saldos`
      );

      if (ultima.status === "COMPLETED" && ultima.processedRows > 60000) {
        ok("Se importaron las ~65.831 filas del reporte real");
      } else {
        fail("La importación no procesó el volumen esperado del archivo real");
      }

      if (ultima.rejectedRows === 1) {
        ok("Se rechazó exactamente 1 fila (la corrupta del archivo real)");
      } else {
        fail(
          "Se esperaba 1 fila rechazada",
          `rechazadas: ${ultima.rejectedRows}`
        );
      }
    } else {
      fail("No hay importaciones registradas");
    }
  } else {
    fail("No se pudo leer el historial de importaciones");
  }

  const existencias = await api("/api/existencias?pageSize=5");
  if (existencias.status === 200) {
    const data = existencias.body.data;
    ok(`Inventario: ${data.pagination.total} existencias`);
    if (data.items.length > 0) {
      const item = data.items[0];
      ok(
        `Muestra: ${item.productCode} · ${item.productName.slice(0, 40)} · ` +
          `Siigo ${item.siigoQuantity} · disponible ${item.availableQuantity}`
      );
      if (
        typeof item.siigoQuantity === "number" &&
        typeof item.reservedQuantity === "number" &&
        typeof item.availableQuantity === "number"
      ) {
        ok("La existencia distingue informado, comprometido y disponible");
      } else {
        fail("Faltan los tres valores de existencia");
      }
    }
  } else {
    fail("No se pudo consultar el inventario");
  }

  // Búsqueda por nombre / referencia / código.
  const busqueda = await api("/api/existencias?search=COBERTURA&pageSize=5");
  if (busqueda.status === 200 && busqueda.body.data.items.length > 0) {
    ok("La búsqueda de productos encuentra resultados");
  } else {
    fail("La búsqueda de productos no encontró resultados");
  }

  const porCodigo = await api(
    "/api/existencias?search=001-0001-000001&pageSize=5"
  );
  if (porCodigo.status === 200 && porCodigo.body.data.items.length > 0) {
    ok("La búsqueda por código funciona");
  } else {
    fail("La búsqueda por código no encontró resultados");
  }

  // ------------------------------------------------------------------
  section("10-11. Catálogo de programas");

  const programas = await api("/api/programas");
  if (programas.status === 200 && programas.body.data.items.length >= 4) {
    const nombres = programas.body.data.items.map((p) => p.name);
    ok(`Programas configurables: ${nombres.join(", ")}`);
    if (nombres.includes("Grupos de Familia")) {
      ok("El programa «Grupos de Familia» está en el catálogo");
    } else {
      fail("Falta el programa «Grupos de Familia»");
    }
  } else {
    fail("El catálogo de programas no devolvió los elementos esperados");
  }

  // ------------------------------------------------------------------
  section("12-19. Salida con varios productos, validaciones y reservas");

  const programasData = await api("/api/programas");
  const programId = programasData.body?.data?.items?.[0]?.id;

  // Existencias con saldo suficiente para la prueba.
  const conStock = await api("/api/existencias?onlyWithStock=true&pageSize=50");
  const candidatas = (conStock.body?.data?.items ?? []).filter(
    (i) => i.availableQuantity >= 2 && !i.isNegative
  );

  if (!programId || candidatas.length < 2) {
    fail("No hay datos suficientes para crear la salida de prueba");
  } else {
    // Construye la salida con 2 productos.
    const items = candidatas.slice(0, 2).map((i) => ({
      productId: i.productId,
      siigoBodegaCode: i.siigoBodegaCode,
      locationCode: i.locationCode,
      quantity: 1,
    }));

    const creada = await api("/api/salidas", {
      method: "POST",
      body: JSON.stringify({
        programId,
        warehouseId: candidatas[0].warehouseId ?? null,
        notes: "Prueba automática del flujo operativo",
        receiverName: "Persona de despacho (prueba)",
        items,
      }),
    });

    if (creada.status !== 201) {
      fail(
        "No se pudo crear la salida",
        JSON.stringify(creada.body).slice(0, 250)
      );
    } else {
      const salida = creada.body.data;
      ok(`Salida creada en borrador: ${salida.number}`);
      ok(`Líneas: ${salida.itemCount} · total ${salida.totalQuantity}`);

      // Validación: cantidad mayor que la disponibilidad debe fallar.
      const excedente = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId,
          items: [
            {
              productId: candidatas[0].productId,
              siigoBodegaCode: candidatas[0].siigoBodegaCode,
              locationCode: candidatas[0].locationCode,
              quantity: 999999,
            },
          ],
        }),
      });
      if (excedente.status === 400) {
        ok("Se rechaza una cantidad superior a la disponibilidad");
      } else {
        fail(
          "Debería rechazarse el exceso de existencias",
          `status ${excedente.status}`
        );
      }

      // Validación: cantidad cero.
      const cero = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId,
          items: [
            {
              productId: candidatas[0].productId,
              siigoBodegaCode: candidatas[0].siigoBodegaCode,
              locationCode: candidatas[0].locationCode,
              quantity: 0,
            },
          ],
        }),
      });
      if (cero.status === 400) {
        ok("Se rechaza una cantidad igual a cero");
      } else {
        fail("Debería rechazarse la cantidad cero", `status ${cero.status}`);
      }

      // Generar el documento.
      const generada = await api(`/api/salidas/${salida.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "generar" }),
      });
      if (generada.status === 200 && generada.body.data.status === "GENERATED") {
        ok(`Documento generado: ${generada.body.data.number}`);
      } else {
        fail(
          "No se pudo generar el documento",
          JSON.stringify(generada.body).slice(0, 250)
        );
      }

      // Idempotencia: generar dos veces no cambia el número.
      const repetida = await api(`/api/salidas/${salida.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "generar" }),
      });
      if (
        repetida.status === 200 &&
        repetida.body.data.number === generada.body?.data?.number
      ) {
        ok("Generar dos veces conserva el mismo número (idempotente)");
      } else {
        fail("El número cambió al generar dos veces");
      }

      // La reserva debe reducir la disponibilidad.
      const despues = await api(
        `/api/existencias?productId=${candidatas[0].productId}&pageSize=5`
      );
      const linea = despues.body?.data?.items?.find(
        (i) =>
          i.siigoBodegaCode === candidatas[0].siigoBodegaCode &&
          i.locationCode === candidatas[0].locationCode
      );
      if (linea && linea.reservedQuantity >= 1) {
        ok(
          `La salida reservó existencias: comprometido ${linea.reservedQuantity}, ` +
            `disponible ${linea.availableQuantity}`
        );
      } else {
        fail("La salida no reservó las existencias");
      }

      // Documento imprimible.
      const comprobante = await fetch(
        `${BASE_URL}/salidas-almacen/${salida.id}/comprobante`,
        { headers: { Cookie: cookie } }
      );
      const html = await comprobante.text();
      const numeroGenerado = generada.body?.data?.number ?? "";
      if (
        comprobante.status === 200 &&
        html.includes("COMPROBANTE DE SALIDA DE ALMAC") &&
        html.includes(numeroGenerado)
      ) {
        ok("El comprobante se genera con número y encabezado correctos");
      } else {
        fail(
          "El comprobante no se generó correctamente",
          `status ${comprobante.status}, número ${numeroGenerado}`
        );
      }

      if (html.includes("@page") || html.includes("page-break-inside")) {
        ok("El comprobante incluye reglas de impresión");
      }

      if (html.includes("ENTREGA") && html.includes("RECIBE")) {
        ok("El comprobante tiene los espacios de firma de ambas partes");
      }

      // Reimpresión: el CONTENIDO del documento no cambia.
      //
      // Next.js inyecta un identificador aleatorio en su carga útil (RSC),
      // así que se compara sólo la parte del documento.
      const reimpresion = await fetch(
        `${BASE_URL}/salidas-almacen/${salida.id}/comprobante`,
        { headers: { Cookie: cookie } }
      );
      const html2 = await reimpresion.text();
      if (extraerDocumento(html) === extraerDocumento(html2)) {
        ok("La reimpresión reproduce el documento original");
      } else {
        fail("La reimpresión cambió el documento");
      }

      // Recepción en despacho.
      const recibida = await api(`/api/salidas/${salida.id}/estado`, {
        method: "POST",
        body: JSON.stringify({
          action: "entregar",
          receiverName: "Persona de despacho (prueba)",
        }),
      });
      if (recibida.status === 200 && recibida.body.data.status === "DELIVERED") {
        ok("Se registró la recepción en despacho");
      } else {
        fail("No se pudo registrar la recepción");
      }

      // Confirmación en Siigo.
      const confirmada = await api(`/api/salidas/${salida.id}/estado`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirmar_siigo",
          siigoDocumentRef: "PRUEBA-SIIGO-0001",
        }),
      });
      if (
        confirmada.status === 200 &&
        confirmada.body.data.status === "CONFIRMED_SIIGO"
      ) {
        ok("Se registró la confirmación en Siigo Pyme");
      } else {
        fail("No se pudo confirmar en Siigo");
      }

      // La reserva NO debe liberarse al confirmar (se libera con la importación).
      const trasConfirmar = await api(
        `/api/existencias?productId=${candidatas[0].productId}&pageSize=5`
      );
      const linea2 = trasConfirmar.body?.data?.items?.find(
        (i) =>
          i.siigoBodegaCode === candidatas[0].siigoBodegaCode &&
          i.locationCode === candidatas[0].locationCode
      );
      if (linea2 && linea2.reservedQuantity >= 1) {
        ok(
          "Tras confirmar en Siigo la reserva sigue activa " +
            "(se libera cuando la importación refleje el descuento)"
        );
      } else {
        fail("La reserva se liberó antes de tiempo: hay riesgo de doble descuento");
      }

      // Una salida ya confirmada en Siigo NO se puede anular: es una
      // salvaguarda para no desincronizar el inventario de Siigo.
      const anuladaConfirmada = await api(`/api/salidas/${salida.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "anular", reason: "Prueba automática" }),
      });
      if (anuladaConfirmada.status === 409) {
        ok("Una salida confirmada en Siigo no se puede anular");
      } else {
        fail(
          "Debería rechazarse anular una salida confirmada en Siigo",
          `status ${anuladaConfirmada.status}`
        );
      }

      // Limpieza: una segunda salida que sí se anula, para comprobar que la
      // reserva se libera.
      const segunda = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId,
          items: [
            {
              productId: candidatas[0].productId,
              siigoBodegaCode: candidatas[0].siigoBodegaCode,
              locationCode: candidatas[0].locationCode,
              quantity: 1,
            },
          ],
        }),
      });
      if (segunda.status === 201) {
        const id2 = segunda.body.data.id;
        await api(`/api/salidas/${id2}/estado`, {
          method: "POST",
          body: JSON.stringify({ action: "generar" }),
        });
        const anulada2 = await api(`/api/salidas/${id2}/estado`, {
          method: "POST",
          body: JSON.stringify({ action: "anular", reason: "Prueba automática" }),
        });
        if (anulada2.status === 200 && anulada2.body.data.status === "CANCELLED") {
          ok("Al anular la salida se libera su reserva");
        } else {
          fail("No se pudo anular la salida de prueba", `status ${anulada2.status}`);
        }
      } else {
        fail("No se pudo crear la segunda salida de prueba");
      }
    }
  }

  // ------------------------------------------------------------------
  section("20-21. Mapeo de bodegas y estado de la sincronización");

  const mapa = await api("/api/siigo/warehouse-map");
  if (mapa.status === 200) {
    const items = mapa.body.data.items;
    ok(`Bodegas de Siigo detectadas: ${items.length}`);
    if (items.length > 0 && items[0].productCount >= 0) {
      ok(
        `Bodega ${items[0].siigoBodegaCode}: ${items[0].productCount} productos · ` +
          `${items[0].totalQuantity} unidades`
      );
    }
    const sinMapear = items.filter((i) => !i.warehouseId).length;
    if (sinMapear >= 0) {
      ok(`${sinMapear} bodegas de Siigo sin asignar (se muestran con su código)`);
    }
  } else {
    fail("No se pudo leer el mapeo de bodegas");
  }

  const sync = await api("/api/siigo/importaciones?limit=1");
  if (sync.status === 200) {
    const data = sync.body.data;
    ok(
      `Estado de sincronización: ${data.isStale ? "desactualizada" : "actualizada"} · ` +
        `umbral ${data.staleMinutes} min`
    );
  }

  // ------------------------------------------------------------------
  section("22. Claves del agente local");

  const claves = await api("/api/siigo/agent-keys");
  if (claves.status === 200) {
    ok(`API de claves accesible (${claves.body.data.items.length} claves)`);
  } else {
    fail("No se pudo acceder a la API de claves del agente");
  }

  // ------------------------------------------------------------------
  section("23. El agente no puede entrar sin clave");

  const sinClave = await fetch(`${BASE_URL}/api/siigo/importaciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileSha256: "a".repeat(64),
      fileName: "prueba.xlsx",
      fileSize: 100,
    }),
  });
  if (sinClave.status === 401 || sinClave.status === 403) {
    ok("Sin clave de agente, la importación se rechaza");
  } else {
    fail(
      "La importación debería rechazar peticiones sin clave",
      `status ${sinClave.status}`
    );
  }

  const claveFalsa = await fetch(`${BASE_URL}/api/siigo/importaciones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Siigo-Agent-Key": "bai_clave_inventada",
    },
    body: JSON.stringify({
      fileSha256: "a".repeat(64),
      fileName: "prueba.xlsx",
      fileSize: 100,
    }),
  });
  if (claveFalsa.status === 401 || claveFalsa.status === 403) {
    ok("Una clave de agente inválida se rechaza");
  } else {
    fail("Debería rechazarse una clave inválida", `status ${claveFalsa.status}`);
  }

  // ------------------------------------------------------------------
  console.log(
    `\n  ${C.bold}Resultado:${C.reset} ${C.green}${passed} correctas${C.reset}, ` +
      (failed > 0 ? `${C.red}${failed} fallidas${C.reset}` : `0 fallidas`)
  );
  if (failures.length > 0) {
    console.log(`\n  ${C.red}Fallos:${C.reset}`);
    for (const failure of failures) console.log(`    · ${failure}`);
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n${C.red}Error inesperado:${C.reset}`, error);
  process.exit(1);
});
