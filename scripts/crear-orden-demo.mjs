/**
 * Crea una orden de demostración con productos de varias bodegas.
 *
 * Sirve para revisar la impresión (encabezado, columna de código, columna
 * de bodega de salida y salto de páginas).
 *
 * Uso:  node scripts/crear-orden-demo.mjs
 */

const BASE = process.env.E2E_URL || "http://localhost:3101";
const CANTIDAD_PRODUCTOS = Number(process.env.DEMO_ITEMS || 24);

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
  return { status: response.status, body };
}

async function main() {
  const raw = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  cookie = (raw.headers.get("set-cookie") || "").split(";")[0];

  // Productos con disponibilidad, de distintas bodegas.
  const existencias = await api(
    "/api/existencias?availability=positive&pageSize=200"
  );
  const items = existencias.body?.data?.items ?? [];
  if (items.length === 0) {
    console.error("No hay existencias con stock.");
    process.exit(1);
  }

  // Se alternan bodegas para que la orden tenga varias columnas con
  // nombres distintos.
  const prod = [];
  for (let i = 0; i < CANTIDAD_PRODUCTOS && i < items.length; i++) {
    const item = items[i];
    prod.push({
      productId: item.productId,
      siigoBodegaCode: item.siigoBodegaCode,
      locationCode: 0,
      quantity: Math.max(1, Math.min(item.available, 10)),
      unit: item.unit || "UND",
      weight: 1.5,
      weightUnit: "kg",
      expirationDate: "2027-06-30",
      notes: i % 5 === 0 ? "Entregar en el área de despacho" : undefined,
    });
  }

  const creada = await api("/api/salidas", {
    method: "POST",
    body: JSON.stringify({
      programId: null,
      customProgramName: "Jornada de atención especial",
      delivererName: "Oscar Daniel Casallas",
      delivererDocument: "1.098.765.432",
      notes:
        "Orden de demostración para revisar la impresión: productos de varias bodegas, códigos de Siigo completos y columna de bodega de salida.",
      items: prod,
    }),
  });

  if (creada.status >= 400) {
    console.error("No se pudo crear:", JSON.stringify(creada.body).slice(0, 300));
    process.exit(1);
  }

  const orden = creada.body.data;
  await api(`/api/salidas/${orden.id}/estado`, {
    method: "POST",
    body: JSON.stringify({ action: "generar" }),
  });

  const generada = await api(`/api/salidas/${orden.id}`);
  console.log(`Orden creada: ${generada.body?.data?.number ?? orden.id}`);
  console.log(`  Líneas: ${prod.length}`);
  console.log(
    `  Bodegas: ${[...new Set(prod.map((p) => p.siigoBodegaCode))].join(", ")}`
  );
  console.log(`  Ver: ${BASE}/salidas-almacen/${orden.id}`);
  console.log(`  Imprimir: ${BASE}/salidas-almacen/${orden.id}/comprobante`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
