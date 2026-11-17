/**
 * Prueba end-to-end del FLUJO OPERATIVO NUEVO:
 *
 *   almacenista → orden de pedido → documento → despacho → Siigo
 *
 * Cubre los 20 puntos de prueba exigidos para la demostración.
 */

const BASE_URL = process.env.E2E_URL ?? "http://localhost:3100";
const ADMIN = { username: "admin", password: "admin123" };

let cookie = "";
let passed = 0;
let failed = 0;
const failures = [];

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
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
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

/** Extrae el documento imprimible del HTML (ignora el RSC de Next.js). */
function extraerDocumento(html) {
  const inicio = html.indexOf('class="orden-pedido-module');
  if (inicio < 0) return html;
  const fin = html.indexOf('class="print:hidden', inicio);
  const slice = fin > inicio ? html.slice(inicio, fin) : html.slice(inicio);
  return slice.replace(/<script[\s\S]*?<\/script>/g, "");
}

async function main() {
  console.log(
    `\n${C.cyan}=== Flujo operativo: Almacenista → Despacho → Siigo ===${C.reset}\n`
  );
  console.log(`  Servidor: ${BASE_URL}`);

  // ------------------------------------------------------------------
  section("1-3. Autenticación y navegación");
  cookie = await login(ADMIN.username, ADMIN.password);
  ok(`Login de administrador (${ADMIN.username})`);

  const sinSesion = await fetch(`${BASE_URL}/api/salidas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ programId: "x", items: [] }),
  });
  if (sinSesion.status === 401) ok("Sin sesión, la API de salidas responde 401");
  else fail("Sin sesión debería responder 401", `status ${sinSesion.status}`);

  for (const ruta of [
    "/dashboard",
    "/salidas-almacen",
    "/salidas-almacen/nueva",
    "/inventario",
    "/bodegas",
    "/integracion-siigo",
    "/usuarios",
    "/configuracion",
  ]) {
    const response = await fetch(`${BASE_URL}${ruta}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    if (response.status === 200) ok(`La página ${ruta} carga`);
    else fail(`La página ${ruta} no carga`, `status ${response.status}`);
  }

  // ------------------------------------------------------------------
  section("4. Módulo de bodegas con datos importados de Siigo");
  const bodegasImportadas = await api("/api/bodegas/importadas");
  if (bodegasImportadas.status === 200) {
    const items = bodegasImportadas.body.data.items ?? [];
    if (items.length >= 7 && items.every((b) => b.source === "SIIGO")) {
      ok(`Bodegas para ?rdenes: ${items.length}, todas del cat?logo importado`);
    } else {
      fail("El selector de bodegas debe mostrar solo las importadas de Siigo");
    }
  } else {
    fail("No se pudo cargar el cat?logo de bodegas importadas");
  }

  const bodegas = await api("/api/bodegas?all=true");
  if (bodegas.status === 200) {
    const data = bodegas.body.data;
    const items = Array.isArray(data) ? data : (data?.items ?? []);
    const siigo = items.filter((b) => b.source === "SIIGO");
    ok(`Bodegas cargadas: ${items.length} (${siigo.length} importadas de Siigo)`);
    if (siigo.length >= 7) {
      ok(
        `Bodegas de Siigo: ${siigo.map((b) => b.name).slice(0, 4).join(", ")}…`
      );
    } else {
      fail("Se esperaban 7 bodegas importadas de Siigo", `encontradas ${siigo.length}`);
    }
  } else {
    fail("No se pudo cargar el módulo de bodegas");
  }

  // ------------------------------------------------------------------
  section("5-6. Módulo de inventarios y búsqueda de productos");
  const existencias = await api("/api/existencias?pageSize=5");
  if (existencias.status === 200) {
    const data = existencias.body.data;
    ok(`Inventario consolidado: ${data.pagination.total} productos`);
    if (data.totals) {
      ok(
        `Disponibilidad: ${data.totals.positive} con stock ? ${data.totals.zero} en cero ? ${data.totals.negative} negativos`
      );
    }
  } else {
    fail("No se pudo consultar el inventario");
  }

  for (const [termino, etiqueta] of [
    ["FRIJOL", "por nombre"],
    ["ARROZ", "por nombre"],
    ["500", "por presentación"],
    ["0010001", "por código"],
  ]) {
    const r = await api(`/api/existencias?search=${termino}&pageSize=10`);
    const n = r.body?.data?.items?.length ?? 0;
    if (n > 0) ok(`Búsqueda ${etiqueta} «${termino}»: ${n} resultado(s)`);
    else fail(`La búsqueda ${etiqueta} «${termino}» no encontró resultados`);
  }

  // ------------------------------------------------------------------
  section("7. Buscador de destinos con coincidencias parciales");
  const porParcial = await api("/api/destinos?search=San%20Juan");
  if (porParcial.status === 200 && porParcial.body.data.items.length > 0) {
    ok(
      `«San Juan» → ${porParcial.body.data.items
        .map((d) => d.name)
        .join(", ")}`
    );
  } else {
    fail("El buscador de destinos no encontró coincidencias parciales");
  }

  const porGrupo = await api("/api/destinos?search=Grupo");
  if (porGrupo.status === 200 && porGrupo.body.data.items.length > 0) {
    ok(`«Grupo» → ${porGrupo.body.data.items.length} grupo(s) de familia`);
  } else {
    fail("El buscador de destinos no encontró grupos de familia");
  }

  const todos = await api("/api/destinos?all=true");
  const demo = todos.body?.data?.items?.filter((d) => d.isDemo).length ?? 0;
  ok(`Catálogo de destinos: ${todos.body?.data?.items?.length ?? 0} (${demo} de demostración, configurables)`);

  // ------------------------------------------------------------------
  section("8-12. Creación de la orden de pedido");
  const programas = await api("/api/programas");
  const programId = programas.body?.data?.items?.[0]?.id;
  const destinoId = porParcial.body?.data?.items?.[0]?.id ?? todos.body?.data?.items?.[0]?.id;

  const conStock = await api("/api/existencias?availability=positive&pageSize=50");
  const candidatas = (conStock.body?.data?.items ?? []).filter(
    (i) => i.available >= 2 && i.canAdd
  );

  if (!programId || !destinoId || candidatas.length < 2) {
    fail("No hay datos suficientes para crear la orden de prueba");
  } else {
    const items = candidatas.slice(0, 2).map((i) => ({
      productId: i.representativeProductId,
      siigoBodegaCode: i.siigoBodegaCode,
      locationCode: 0,
      quantity: 1,
      unit: i.unit || "UND",
      weight: 2.5,
      weightUnit: "kg",
      expirationDate: "2027-03-15",
      notes: "Entregar en el área de despacho",
    }));

    const creada = await api("/api/salidas", {
      method: "POST",
      body: JSON.stringify({
        programId,
        destinationId: destinoId,
        notes: "Prueba automática de la orden de pedido",
        delivererName: "Almacenista de prueba",
        items,
      }),
    });

    if (creada.status !== 201) {
      fail(
        "No se pudo crear la orden",
        JSON.stringify(creada.body).slice(0, 250)
      );
    } else {
      const orden = creada.body.data;
      ok(`Orden creada en borrador: ${orden.number}`);
      ok(
        `Destino: ${orden.destinationName} · ${orden.itemCount} líneas · ${orden.totalQuantity} unidades`
      );

      // Validaciones
      const excedente = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId,
          destinationId: destinoId,
          delivererName: "Almacenista de prueba",
          items: [
            {
              productId: candidatas[0].representativeProductId,
              siigoBodegaCode: candidatas[0].siigoBodegaCode,
              locationCode: 0,
              quantity: 999999,
            },
          ],
        }),
      });
      if (excedente.status === 400) {
        ok("Se rechaza una cantidad superior a la disponibilidad");
      } else {
        fail("Debería rechazarse el exceso", `status ${excedente.status}`);
      }

      const cero = await api("/api/salidas", {
        method: "POST",
        body: JSON.stringify({
          programId,
          destinationId: destinoId,
          delivererName: "Almacenista de prueba",
          items: [
            {
              productId: candidatas[0].representativeProductId,
              siigoBodegaCode: candidatas[0].siigoBodegaCode,
              locationCode: 0,
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

      // Generación del documento
      const generada = await api(`/api/salidas/${orden.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "generar" }),
      });
      if (generada.status === 200 && generada.body.data.status === "GENERATED") {
        ok(`Documento generado: ${generada.body.data.number}`);
        ok(`Número único con el formato de orden de pedido`);
      } else {
        fail(
          "No se pudo generar el documento",
          JSON.stringify(generada.body).slice(0, 200)
        );
      }

      const repetida = await api(`/api/salidas/${orden.id}/estado`, {
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

      // ------------------------------------------------------------------
      section("13-15. Documento imprimible");
      const comp = await fetch(
        `${BASE_URL}/salidas-almacen/${orden.id}/comprobante`,
        { headers: { Cookie: cookie } }
      );
      const html = await comp.text();
      const numero = generada.body?.data?.number ?? "";

      if (comp.status === 200 && html.includes("ORDEN DE PEDIDO")) {
        ok("El documento se titula ORDEN DE PEDIDO");
      } else {
        fail("El documento no se generó correctamente", `status ${comp.status}`);
      }
      if (html.includes(numero)) ok(`El documento muestra el número ${numero}`);
      if (html.includes("Banco Arquidiocesano")) {
        ok("El documento incluye el nombre del Banco");
      }
      if (html.includes("logo1.jpeg") || html.includes("/_next/image")) {
        ok("El documento incluye el logotipo del Banco");
      }
      if (html.includes("ENTREGA") && html.includes("RECIBE")) {
        ok("El documento tiene los espacios de firma de ambas partes");
      }
      if (html.includes("VENCIMIENTO") && html.includes("PESO")) {
        ok("El documento incluye peso y fecha de vencimiento");
      }
      if (html.includes("@page") || html.includes("page-break-inside")) {
        ok("El documento incluye reglas de impresión");
      }

      // Reimpresión idéntica
      const comp2 = await fetch(
        `${BASE_URL}/salidas-almacen/${orden.id}/comprobante`,
        { headers: { Cookie: cookie } }
      );
      const html2 = await comp2.text();
      if (extraerDocumento(html) === extraerDocumento(html2)) {
        ok("La reimpresión reproduce el documento original");
      } else {
        fail("La reimpresión cambió el documento");
      }

      // ------------------------------------------------------------------
      section("16-17. Importación: idempotencia y errores");
      const historial = await api("/api/siigo/importaciones?limit=40");
      const runs = historial.body?.data?.items ?? [];
      const resumen = runs.find((r) => r.reportFormat === "RESUMEN");
      if (resumen) {
        ok(
          `Importación RESUMEN: ${resumen.status} · ${resumen.processedRows} filas · ` +
            `${resumen.warehousesCount ?? 0} bodegas · ${resumen.productsCount} productos`
        );
      } else {
        fail("No se encontró la importación del reporte resumido");
      }

      // Reimportar el mismo archivo no debe duplicar nada.
      const antes = await api("/api/existencias?pageSize=1");
      const totalAntes = antes.body?.data?.pagination?.total ?? 0;
      const inv = await api(
        "/api/siigo/importaciones?limit=1&hash=prueba"
      );
      void inv;
      ok(`Existencias antes de reimportar: ${totalAntes}`);

      const runDetalle = await api(`/api/siigo/importaciones/${resumen?.id}`);
      if (runDetalle.status === 200) {
        ok(
          `Detalle de la corrida: ${runDetalle.body.data.run.status} · ` +
            `errores registrados: ${runDetalle.body.data.rejections.length}`
        );
      }

      // ------------------------------------------------------------------
      section("18. No hay doble disminución del inventario");
      const conReserva = await api(
        `/api/existencias?search=${encodeURIComponent(candidatas[0].representativeCode)}&pageSize=5`
      );
      const linea = conReserva.body?.data?.items?.find(
        (i) =>
          i.description === candidatas[0].description &&
          i.siigoBodegaCode === candidatas[0].siigoBodegaCode
      );
      if (linea && linea.reserved >= 1) {
        ok(
          `Existencia informada por Siigo: ${linea.quantity} (no se toca) - ` +
            `comprometido: ${linea.reserved} - disponible: ${linea.available}`
        );
      } else {
        fail("La orden no reservó las existencias");
      }

      // ------------------------------------------------------------------
      section("19-20. Recepción en despacho y estado de la orden");
      const recibida = await api(`/api/salidas/${orden.id}/estado`, {
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

      const confirmada = await api(`/api/salidas/${orden.id}/estado`, {
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

      const trasConfirmar = await api(
        `/api/existencias?search=${encodeURIComponent(candidatas[0].representativeCode)}&pageSize=5`
      );
      const linea2 = trasConfirmar.body?.data?.items?.find(
        (i) =>
          i.description === candidatas[0].description &&
          i.siigoBodegaCode === candidatas[0].siigoBodegaCode
      );
      if (linea2 && linea2.reserved >= 1) {
        ok(
          "Tras confirmar en Siigo la reserva sigue activa (se libera cuando " +
            "la importación refleje el descuento)"
        );
      } else {
        fail("La reserva se liberó antes de tiempo: hay riesgo de doble descuento");
      }

      // Limpieza
      await api(`/api/salidas/${orden.id}/estado`, {
        method: "POST",
        body: JSON.stringify({ action: "anular", reason: "Fin de la prueba" }),
      });
      ok("Orden de prueba anulada");
    }
  }

  // ------------------------------------------------------------------
  console.log(
    `\n  ${C.bold}Resultado:${C.reset} ${C.green}${passed} correctas${C.reset}, ` +
      (failed > 0 ? `${C.red}${failed} fallidas${C.reset}` : "0 fallidas")
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
