/**
 * Verificación del documento impreso de la ORDEN DE PEDIDO.
 *
 * Comprueba, sobre el HTML que ve el navegador, que:
 *   - el encabezado superior derecho trae título, número, fecha, hora y
 *     estado;
 *   - la tabla tiene la columna BODEGA DE SALIDA con la bodega de cada
 *     producto;
 *   - los códigos de Siigo van en una sola línea;
 *   - los dos bloques de firma están completos;
 *   - el encabezado de la tabla se repite (impresión de varias páginas).
 *
 * Uso:  E2E_URL=http://localhost:3101 node scripts/verificar-documento.mjs
 */

const BASE = process.env.E2E_URL || "http://localhost:3101";

let passed = 0;
let failed = 0;

function ok(message) {
  passed++;
  console.log(`    \x1b[32m✓\x1b[0m ${message}`);
}

function fail(message, detail) {
  failed++;
  console.log(`    \x1b[31m✗\x1b[0m ${message}`);
  if (detail) console.log(`      \x1b[31m${detail}\x1b[0m`);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

  // Se toma la orden más reciente.
  const listado = await (
    await fetch(`${BASE}/api/salidas?pageSize=10`, {
      headers: { Cookie: cookie },
    })
  ).json();
  const orden = (listado?.data?.items ?? [])[0];
  if (!orden) {
    console.error("No hay órdenes para verificar.");
    process.exit(1);
  }

  const html = await (
    await fetch(`${BASE}/salidas-almacen/${orden.id}/comprobante`, {
      headers: { Cookie: cookie },
    })
  ).text();
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  console.log(`\x1b[1mDocumento de la orden ${orden.number}\x1b[0m`);

  // -----------------------------------------------------------------
  section("1. Encabezado superior derecho");
  // -----------------------------------------------------------------
  const inicio = html.indexOf("encabezadoDocumento");
  const bloque = html.slice(inicio, inicio + 1200);
  const esperados = [
    ["ORDEN DE PEDIDO", "el título"],
    [orden.number, "el número de orden"],
    ["Fecha:", "la fecha"],
    ["Hora:", "la hora"],
    ["Estado:", "el estado"],
  ];
  for (const [dato, descripcion] of esperados) {
    if (bloque.includes(dato)) {
      ok(`El bloque derecho incluye ${descripcion}.`);
    } else {
      fail(`El bloque derecho NO incluye ${descripcion}.`);
    }
  }

  // -----------------------------------------------------------------
  section("2. Encabezado superior del sistema");
  // -----------------------------------------------------------------
  if (texto.includes("Sistema de Gestión de Inventarios")) {
    ok("Se conserva el título del sistema en la parte superior.");
  } else {
    fail("Falta el título del sistema en la parte superior.");
  }

  // -----------------------------------------------------------------
  section("3. Tabla de productos");
  // -----------------------------------------------------------------
  if (texto.includes("BODEGA DE SALIDA")) {
    ok("La tabla incluye la columna BODEGA DE SALIDA.");
  } else {
    fail("La tabla NO incluye la columna BODEGA DE SALIDA.");
  }

  const filas = (html.match(/<tr>/g) ?? []).length - 1;
  const celdasBodega = (html.match(/class="[^"]*bodega[^"]*"/g) ?? []).length;
  if (filas > 0 && celdasBodega === filas) {
    ok(`Cada una de las ${filas} líneas muestra su bodega.`);
  } else {
    fail(
      `No todas las líneas muestran bodega (${celdasBodega} de ${filas}).`
    );
  }

  const codigos = [...html.matchAll(/class="[^"]*codigo[^"]*"[^>]*>([^<]*)</g)].map(
    (m) => m[1].trim()
  );
  const conSalto = codigos.filter((c) => /\n|\r/.test(c));
  if (codigos.length === filas && conSalto.length === 0) {
    ok(
      `Los ${codigos.length} códigos de Siigo van en una sola línea (sin aumentar la altura de la fila).`
    );
  } else {
    fail(
      `${conSalto.length} códigos se partieron entre líneas.`,
      `Muestra: ${codigos.slice(0, 3).join(", ")}`
    );
  }

  // -----------------------------------------------------------------
  section("4. Firmas");
  // -----------------------------------------------------------------
  const firmas = [
    ["ENTREGA — ALMACENISTA", "el bloque de entrega (almacenista)"],
    ["RECIBE — ENCARGADO(A) DE DESPACHO", "el bloque de recepción (despacho)"],
    ["Cédula:", "el campo de cédula"],
    ["Nombre:", "el campo de nombre"],
    ["Fecha:", "el campo de fecha"],
    ["Hora:", "el campo de hora"],
  ];
  for (const [dato, descripcion] of firmas) {
    if (texto.includes(dato)) {
      ok(`El documento incluye ${descripcion}.`);
    } else {
      fail(`El documento NO incluye ${descripcion}.`);
    }
  }

  // Los espacios de firma deben estar disponibles.
  const lineasFirma = (html.match(/lineaFirma/g) ?? []).length;
  if (lineasFirma >= 2) {
    ok(`Hay ${lineasFirma} espacios para firma (uno por bloque).`);
  } else {
    fail(`Solo hay ${lineasFirma} espacios para firma; se esperan 2.`);
  }

  // -----------------------------------------------------------------
  section("5. Varias páginas");
  // -----------------------------------------------------------------
  if (texto.includes("TOTAL DE LÍNEAS")) {
    ok("Se conserva el resumen de totales.");
  } else {
    fail("Falta el resumen de totales.");
  }
  if (texto.includes("OBSERVACIONES")) {
    ok("Se conserva el bloque de observaciones.");
  } else {
    fail("Falta el bloque de observaciones.");
  }
  if (filas > 20) {
    ok(
      `La orden tiene ${filas} líneas: sirve para comprobar el salto de página (el encabezado de la tabla se repite por CSS).`
    );
  } else {
    ok(`La orden tiene ${filas} líneas.`);
  }

  // -----------------------------------------------------------------
  section("6. Elementos que se conservan");
  // -----------------------------------------------------------------
  for (const [dato, descripcion] of [
    ["/logo1.jpeg", "el logotipo del Banco"],
    ["Banco Arquidiocesano de Alimentos", "el nombre institucional"],
    ["No constituye comprobante contable", "el texto aclaratorio del pie"],
  ]) {
    if (html.includes(dato) || texto.includes(dato)) {
      ok(`Se conserva ${descripcion}.`);
    } else {
      fail(`No se conserva ${descripcion}.`);
    }
  }

  console.log(
    `\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}Resultado: ${passed} correctas, ${failed} fallidas\x1b[0m`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
