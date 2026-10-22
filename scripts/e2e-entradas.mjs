/**
 * Prueba end-to-end del módulo de Entradas
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Cubre los escenarios del procedimiento de Siigo Pyme:
 *   1. Entrada de producto propio (E3).
 *   2. Entrada de producto donado (E1) con datos de la entidad.
 *   3. Los cuatro tipos de entrada con su título y código documental.
 *   4. Varios productos y varios lotes en un mismo producto.
 *   5. Validaciones (sin productos, cantidades inválidas, lotes inconsistentes).
 *   6. Consecutivos únicos y ausencia de movimientos duplicados.
 *   7. Comprobante impreso.
 *
 * Uso:  node scripts/e2e-entradas.mjs [url]
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const args = process.argv.slice(2);
const urlArg = args.find((arg) => arg.startsWith("--url="))?.replace("--url=", "");
const BASE_URL = (urlArg ?? "http://localhost:3000").replace(/\/$/, "");

const ADMIN = { username: "admin", password: "admin123" };

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

let cookie = "";
let passed = 0;
let failed = 0;
const failures = [];

function ok(message) {
  passed += 1;
  console.log(`    ${C.green}✓${C.reset} ${message}`);
}

function fail(message, detail) {
  failed += 1;
  failures.push(message);
  console.log(`    ${C.red}✗${C.reset} ${message}${detail ? ` ${C.gray}${detail}${C.reset}` : ""}`);
}

function assert(condition, message, detail) {
  if (condition) ok(message);
  else fail(message, detail);
}

function section(title) {
  console.log(`\n${C.bold}${title}${C.reset}`);
}

async function api(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  return { status: response.status, ok: response.ok, data, response };
}

async function ensureServer() {
  try {
    const response = await fetch(`${BASE_URL}/login`);
    if (response.ok) return null;
  } catch {
    /* no está levantado */
  }

  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  const server = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--port", "3000"],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development" } }
  );

  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk.toString()));
  server.stderr.on("data", (chunk) => (output += chunk.toString()));

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`El servidor terminó:\n${output.slice(-1500)}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) return server;
    } catch {
      /* aún no levanta */
    }
    await sleep(1500);
  }

  server.kill();
  throw new Error(`El servidor no respondió a tiempo.\n${output.slice(-1500)}`);
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}${C.bold}  PRUEBA END-TO-END · MÓDULO DE ENTRADAS${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${BASE_URL}${C.reset}`);
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);

  const server = await ensureServer();

  try {
    /* ---------------- Preparación ---------------- */
    section("0. Preparación");

    const login = await api("/api/auth/login", { method: "POST", body: ADMIN });
    assert(login.ok, "Sesión iniciada");
    if (!login.ok) return;

    const products = await api("/api/productos");
    const warehouses = await api("/api/bodegas");
    const thirdParties = await api("/api/terceros");
    const units = await api("/api/unidades");

    const producto = products.data?.data?.[0];
    const bodegaPropia = warehouses.data?.data?.find((w) => w.code === "1.1");
    const bodegaDonados = warehouses.data?.data?.find((w) => w.code === "1.2");
    const tercero = thirdParties.data?.data?.[0];

    assert(!!producto, "Catálogo de productos disponible");
    assert(!!bodegaPropia, "Bodega 1.1 (propios) disponible");
    assert(!!bodegaDonados, "Bodega 1.2 (donados) disponible");
    assert(!!tercero, "Terceros disponibles");
    assert(
      (units.data?.data?.length ?? 0) > 0,
      "Catálogo de unidades disponible",
      `${units.data?.data?.length} unidades`
    );

    const today = new Date().toISOString().slice(0, 10);

    /* ---------------- Caso 1: producto propio (E3) ---------------- */
    section("Caso 1. Entrada de producto propio (E3)");

    // Existencia previa del producto en la bodega de propios.
    const inventarioAntes = await api("/api/inventario");
    const stockAntesPropia = inventarioAntes.data?.data?.find(
      (i) => i.productId === producto.id && i.warehouseId === bodegaPropia.id
    )?.quantity;

    const entradaPropia = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E3",
        date: today,
        origin: "BANCO ARQUIDIOCESANO DE ALIMENTOS",
        purchaseOrder: "OC-2026-0001",
        sellerNumber: 1,
        items: [
          {
            productId: producto.id,
            warehouseId: bodegaPropia.id,
            quantity: 150,
            unit: producto.unit,
            description: `CD 6020 ${producto.name} X 250 GR PR`,
            location: "2",
            value: 0,
            debitCredit: 0,
            lots: [
              {
                code: "9999999999",
                description: "Lotes Inicial",
                expirationDate: "2026-09-05",
                quantity: 150,
              },
            ],
          },
        ],
      },
    });

    assert(entradaPropia.ok, "Crea la entrada E3", JSON.stringify(entradaPropia.data?.error));
    const idPropia = entradaPropia.data?.data?.id;

    if (entradaPropia.ok) {
      assert(
        /^E-003-\d+$/.test(entradaPropia.data.data.number),
        "El número usa el código documental del tipo E3",
        entradaPropia.data.data.number
      );
      assert(
        entradaPropia.data.data.items[0].warehouseId === bodegaPropia.id,
        "La bodega de producto propio es 1.1"
      );
      assert(
        entradaPropia.data.data.items[0].description.includes("CD 6020"),
        "Guarda la descripción del producto",
        entradaPropia.data.data.items[0].description
      );
      assert(
        entradaPropia.data.data.items[0].value === 0,
        "Guarda el valor monetario (0 permitido)"
      );
      assert(
        entradaPropia.data.data.items[0].lots.length === 1,
        "Guarda el lote con su vencimiento"
      );
      assert(
        entradaPropia.data.data.purchaseOrder === "OC-2026-0001",
        "Guarda la orden de compra"
      );
    }

    const inventarioTrasPropia = await api("/api/inventario");
    const stockPropia = inventarioTrasPropia.data?.data?.find(
      (i) => i.productId === producto.id && i.warehouseId === bodegaPropia.id
    );
    assert(
      Math.abs((stockPropia?.quantity ?? 0) - ((stockAntesPropia ?? 0) + 150)) < 0.001,
      "El inventario sube exactamente con la cantidad de la entrada",
      `existencia ${stockAntesPropia} → ${stockPropia?.quantity}`
    );

    /* ---------------- Caso 2: producto donado (E1) ---------------- */
    section("Caso 2. Entrada de producto donado (E1)");

    const entradaDonada = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        thirdPartyId: tercero.id,
        nit: tercero.nit,
        origin: tercero.name,
        sellerNumber: 1,
        items: [
          {
            productId: producto.id,
            warehouseId: bodegaDonados.id,
            quantity: 25,
            unit: producto.unit,
            description: `CD 6179 ${producto.name} C 1000 GRS`,
            location: "4",
            value: 0,
            debitCredit: 0,
            lots: [],
          },
        ],
      },
    });

    assert(entradaDonada.ok, "Crea la entrada E1", JSON.stringify(entradaDonada.data?.error));

    if (entradaDonada.ok) {
      assert(
        /^E-001-\d+$/.test(entradaDonada.data.data.number),
        "El número usa el código documental del tipo E1",
        entradaDonada.data.data.number
      );
      assert(
        entradaDonada.data.data.nit === tercero.nit,
        "El NIT se toma de la entidad seleccionada",
        entradaDonada.data.data.nit
      );
      assert(
        entradaDonada.data.data.origin === tercero.name,
        "El nombre se toma de la entidad seleccionada",
        entradaDonada.data.data.origin
      );
    }

    /* ---------------- Caso 3: tipos de entrada ---------------- */
    section("Caso 3. Tipos de entrada (E1, E3, N3, N5)");

    const tipos = [
      { format: "E1", code: "E-001", titulo: "NOTA ENTRADA DONACIÓN" },
      { format: "E3", code: "E-003", titulo: "NOTA ENTRADA PRODUCCIÓN OTROS" },
      { format: "N3", code: "N-003", titulo: "NOTA AJUSTE" },
      { format: "N5", code: "N-005", titulo: "NOTA CONTABILIZACIÓN" },
    ];

    for (const tipo of tipos) {
      const created = await api("/api/entradas", {
        method: "POST",
        body: {
          format: tipo.format,
          date: today,
          items: [
            {
              productId: producto.id,
              warehouseId: bodegaPropia.id,
              quantity: 1,
              unit: producto.unit,
              value: 0,
              lots: [],
            },
          ],
        },
      });

      const number = created.data?.data?.number ?? "";

      assert(
        created.ok && number.startsWith(`${tipo.code}-`),
        `${tipo.format} genera el código ${tipo.code}-n`,
        number
      );
    }

    /* ---------------- Caso 4: varios productos y lotes ---------------- */
    section("Caso 4. Varios productos y varios lotes");

    const segundoProducto = products.data?.data?.[1];

    const entradaMultiple = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E3",
        date: today,
        items: [
          {
            productId: producto.id,
            warehouseId: bodegaPropia.id,
            quantity: 10,
            unit: producto.unit,
            value: 0,
            lots: [
              { code: "LOTE-A", description: "Lotes Inicial", expirationDate: "2027-01-10", quantity: 6 },
              { code: "LOTE-B", description: "Lotes Inicial", expirationDate: "2027-06-20", quantity: 4 },
            ],
          },
          {
            productId: segundoProducto.id,
            warehouseId: bodegaPropia.id,
            quantity: 7.5,
            unit: segundoProducto.unit,
            value: 1250.75,
            lots: [],
          },
        ],
      },
    });

    assert(entradaMultiple.ok, "Crea una entrada con 2 productos y 2 lotes", JSON.stringify(entradaMultiple.data?.error));

    if (entradaMultiple.ok) {
      assert(
        entradaMultiple.data.data.items.length === 2,
        "Guarda los dos productos"
      );
      assert(
        entradaMultiple.data.data.items[0].lots.length === 2,
        "Guarda los dos lotes del primer producto"
      );
      assert(
        entradaMultiple.data.data.items[1].quantity === 7.5,
        "Acepta cantidades con decimales",
        `cantidad = ${entradaMultiple.data.data.items[1].quantity}`
      );
      assert(
        entradaMultiple.data.data.items[1].value === 1250.75,
        "Guarda el valor monetario con decimales",
        `valor = ${entradaMultiple.data.data.items[1].value}`
      );
    }

    /* ---------------- Caso 5: validaciones ---------------- */
    section("Caso 5. Validaciones");

    const sinProductos = await api("/api/entradas", {
      method: "POST",
      body: { format: "E1", date: today, items: [] },
    });
    assert(
      sinProductos.status === 400,
      "Rechaza una entrada sin productos",
      `status ${sinProductos.status}`
    );

    const cantidadCero = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        items: [
          { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 0, unit: producto.unit },
        ],
      },
    });
    assert(
      cantidadCero.status === 400,
      "Rechaza una cantidad de cero",
      `status ${cantidadCero.status}`
    );

    const cantidadNegativa = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        items: [
          { productId: producto.id, warehouseId: bodegaPropia.id, quantity: -5, unit: producto.unit },
        ],
      },
    });
    assert(
      cantidadNegativa.status === 400,
      "Rechaza una cantidad negativa",
      `status ${cantidadNegativa.status}`
    );

    const lotesInconsistentes = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        items: [
          {
            productId: producto.id,
            warehouseId: bodegaPropia.id,
            quantity: 10,
            unit: producto.unit,
            lots: [{ code: "L1", quantity: 4 }],
          },
        ],
      },
    });
    assert(
      lotesInconsistentes.status === 400,
      "Rechaza lotes cuya suma no coincide con la cantidad",
      `status ${lotesInconsistentes.status}`
    );

    const bodegaInvalida = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        items: [
          {
            productId: producto.id,
            warehouseId: "00000000-0000-0000-0000-000000000000",
            quantity: 1,
            unit: producto.unit,
          },
        ],
      },
    });
    assert(
      bodegaInvalida.status === 404 || bodegaInvalida.status === 400,
      "Rechaza una bodega inexistente",
      `status ${bodegaInvalida.status}`
    );

    const sinFecha = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        items: [
          { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 1, unit: producto.unit },
        ],
      },
    });
    assert(
      sinFecha.status === 400,
      "Rechaza una entrada sin fecha",
      `status ${sinFecha.status}`
    );

    /* ---------------- Caso 6: consecutivos y duplicados ---------------- */
    section("Caso 6. Consecutivos y movimientos duplicados");

    const numeroRepetido = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        number: "E-001-1",
        date: today,
        items: [
          { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 1, unit: producto.unit },
        ],
      },
    });
    assert(
      numeroRepetido.status === 409,
      "Rechaza un número de documento ya usado",
      `status ${numeroRepetido.status}`
    );

    const antes = await api("/api/inventario");
    const stockAntes = antes.data?.data?.find(
      (i) => i.productId === producto.id && i.warehouseId === bodegaPropia.id
    )?.quantity;

    const reintento = await api("/api/entradas", {
      method: "POST",
      body: {
        format: "E1",
        date: today,
        items: [
          { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 3, unit: producto.unit },
        ],
      },
    });
    assert(reintento.ok, "Registra una entrada nueva");

    const despues = await api("/api/inventario");
    const stockDespues = despues.data?.data?.find(
      (i) => i.productId === producto.id && i.warehouseId === bodegaPropia.id
    )?.quantity;

    assert(
      Math.abs((stockDespues ?? 0) - ((stockAntes ?? 0) + 3)) < 0.001,
      "El inventario cambia exactamente una vez por entrada",
      `antes ${stockAntes} → después ${stockDespues}`
    );

    const dosEntradas = await Promise.all([
      api("/api/entradas", {
        method: "POST",
        body: {
          format: "E1",
          date: today,
          items: [
            { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 1, unit: producto.unit },
          ],
        },
      }),
      api("/api/entradas", {
        method: "POST",
        body: {
          format: "E1",
          date: today,
          items: [
            { productId: producto.id, warehouseId: bodegaPropia.id, quantity: 1, unit: producto.unit },
          ],
        },
      }),
    ]);

    const numeros = dosEntradas.map((r) => r.data?.data?.number);
    assert(
      numeros[0] !== numeros[1],
      "Dos entradas simultáneas reciben números distintos",
      numeros.join(" vs ")
    );

    /* ---------------- Caso 7: comprobante ---------------- */
    section("Caso 7. Comprobante impreso");

    const comprobante = await fetch(
      `${BASE_URL}/entradas/${idPropia}/comprobante`,
      { headers: { Cookie: cookie } }
    );
    const html = await comprobante.text();

    assert(comprobante.status === 200, "La página del comprobante carga", `status ${comprobante.status}`);

    const expected = [
      ["NOTA ENTRADA PRODUCCIÓN OTROS", "título del documento"],
      ["E - 003 -", "código documental espaciado"],
      ["BANCO ARQUIDIOCESANO DE ALIMENTOS", "nombre de la institución"],
      ["809.009.880 - 0", "NIT del Banco"],
      ["CR 4 ESTADIO 23 44", "dirección del Banco"],
      ["2624927 - 5151727", "teléfonos del Banco"],
      ["SEÑORES:", "bloque de la entidad"],
      ["FECHA DOCUMENTO:", "fecha del documento"],
      ["ORDEN DE COMPRA:", "orden de compra"],
      ["OC-2026-0001", "valor de la orden de compra"],
      ["C. de COSTO", "columna de centro de costo"],
      ["BODEGA", "columna de bodega"],
      ["CANTIDAD", "columna de cantidad"],
      ["UNIDAD", "columna de unidad"],
      ["VALOR", "columna de valor"],
      ["CD 6020", "descripción del producto"],
      ["9999999999", "código del lote"],
      ["Lotes Inicial", "denominación del lote"],
      ["F.V.: 2026-09-05", "fecha de vencimiento del lote"],
      ["OBSERVACIONES:", "bloque de observaciones"],
      ["1.1", "código de la bodega"],
      ["150,00", "cantidad con formato numérico"],
    ];

    for (const [text, label] of expected) {
      assert(html.includes(text), `El comprobante incluye ${label}`, `falta "${text}"`);
    }

    assert(
      html.includes("logo1.jpeg"),
      "El comprobante incluye el logo institucional"
    );

    // El área de impresión es media hoja carta (21,59 x 13,97 cm).
    const estilos = await fetch(`${BASE_URL}/entradas/${idPropia}/comprobante`, {
      headers: { Cookie: cookie },
    });
    assert(estilos.status === 200, "El comprobante se puede volver a cargar");
  } catch (error) {
    fail(`Error inesperado: ${error.message}`);
    console.error(error);
  } finally {
    if (server) {
      server.kill();
      await sleep(800);
    }
  }

  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}Correctas: ${passed}${C.reset}   ${failed > 0 ? C.red : C.gray}Fallidas: ${failed}${C.reset}`);
  if (failures.length > 0) {
    console.log(`\n  ${C.red}Fallos:${C.reset}`);
    failures.forEach((message) => console.log(`   - ${message}`));
  }
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
