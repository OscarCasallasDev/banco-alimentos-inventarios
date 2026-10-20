/**
 * Prueba end-to-end de todos los módulos
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:
 *   npm run test:e2e            → levanta el servidor de desarrollo y prueba todo
 *   npm run test:e2e -- --url   → usa una URL ya desplegada
 *
 * El recorrido exercises el flujo real: login → productos → bodegas →
 * entradas → pedidos → facturas → recibos → despachos → auditoría →
 * inventario → reportes → dashboard → auditoría del sistema → Siigo.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const BASE_URL =
  urlIndex !== -1 && args[urlIndex + 1]
    ? args[urlIndex + 1].replace(/\/$/, "")
    : "http://localhost:3100";

const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin123";

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
};

function ok(message) {
  passed += 1;
  console.log(`  ${C.green}✓${C.reset} ${message}`);
}

function fail(message, detail) {
  failed += 1;
  failures.push(message);
  console.log(`  ${C.red}✗${C.reset} ${message}`);
  if (detail) console.log(`    ${C.gray}${detail}${C.reset}`);
}

function section(title) {
  console.log(`\n${C.cyan}${title}${C.reset}`);
}

function assert(condition, message, detail) {
  if (condition) ok(message);
  else fail(message, detail);
}

/**
 * Ejecuta una petición HTTP con la cookie de sesión.
 */
async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { status: response.status, ok: response.ok, data: null, response };
  }

  const data = await response.json();
  return { status: response.status, ok: response.ok, data, response };
}

/**
 * Levanta el servidor de desarrollo y espera a que responda.
 */
async function startServer() {
  console.log(`${C.gray}Levantando el servidor de desarrollo en ${BASE_URL}...${C.reset}`);

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
    [nextBin, "dev", "--webpack", "--port", "3100"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    }
  );

  server.on("error", (error) => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
  });

  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk.toString()));
  server.stderr.on("data", (chunk) => (output += chunk.toString()));

  const deadline = Date.now() + 180000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `El servidor terminó inesperadamente.\n${output.slice(-2000)}`
      );
    }

    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) {
        console.log(`${C.green}Servidor listo.${C.reset}`);
        return server;
      }
    } catch {
      /* aún no levanta */
    }
    await sleep(1500);
  }

  server.kill();
  throw new Error(`El servidor no respondió a tiempo.\n${output.slice(-2000)}`);
}

async function run() {
  console.log(`\n${C.cyan}══════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}  PRUEBA END-TO-END · Sistema de Inventarios${C.reset}`);
  console.log(`${C.cyan}  Objetivo: ${BASE_URL}${C.reset}`);
  console.log(`${C.cyan}══════════════════════════════════════════════${C.reset}`);

  // ---------------------------------------------------------------
  section("1. Autenticación");

  const badLogin = await api("/api/auth/login", {
    method: "POST",
    body: { username: ADMIN_USER, password: "incorrecta" },
  });
  assert(
    badLogin.status === 401,
    "Rechaza credenciales incorrectas",
    `status ${badLogin.status}`
  );

  const login = await api("/api/auth/login", {
    method: "POST",
    body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
  });
  assert(login.ok && login.data?.success, `Login admin / ${ADMIN_PASSWORD}`, JSON.stringify(login.data));
  assert(!!cookie, "Establece la cookie de sesión");

  const me = await api("/api/auth/me");
  assert(me.ok && me.data?.data?.username === ADMIN_USER, "El endpoint /api/auth/me responde con el usuario");

  const noAuth = await fetch(`${BASE_URL}/api/productos`);
  assert(noAuth.status === 401, "Sin sesión las APIs responden 401", `status ${noAuth.status}`);

  // ---------------------------------------------------------------
  section("2. Catálogo (productos, categorías y bodegas)");

  const suffix = Date.now().toString().slice(-6);
  const productCode = `TEST-${suffix}`;
  const warehouseCode = `T.${suffix.slice(0, 3)}`;

  const categories = await api("/api/categorias");
  assert(categories.ok && Array.isArray(categories.data?.data), "GET /api/categorias");

  const category = await api("/api/categorias", {
    method: "POST",
    body: { name: `Categoría prueba ${suffix}`, description: "Temporal" },
  });
  assert(category.ok && !!category.data?.data?.id, "Crea una categoría", JSON.stringify(category.data));

  const warehouse = await api("/api/bodegas", {
    method: "POST",
    body: {
      code: warehouseCode,
      name: `Bodega prueba ${suffix}`,
      type: "PROPIA",
    },
  });
  assert(warehouse.ok && !!warehouse.data?.data?.id, "Crea una bodega", JSON.stringify(warehouse.data));
  const warehouseId = warehouse.data?.data?.id;

  const product = await api("/api/productos", {
    method: "POST",
    body: {
      code: productCode,
      name: `Producto prueba ${suffix}`,
      unit: "unidad",
      weight: 1.5,
      minStock: 5,
      categoryId: category.data?.data?.id ?? null,
    },
  });
  assert(product.ok && !!product.data?.data?.id, "Crea un producto", JSON.stringify(product.data));
  const productId = product.data?.data?.id;

  const products = await api("/api/productos");
  assert(
    products.ok && products.data.data.some((p) => p.id === productId),
    "El producto aparece en el listado"
  );
  assert(
    products.data.data.find((p) => p.id === productId)?.categoryName,
    "El producto trae el nombre de su categoría"
  );

  const duplicate = await api("/api/productos", {
    method: "POST",
    body: { code: productCode, name: "Duplicado", unit: "unidad" },
  });
  assert(duplicate.status === 409, "Rechaza códigos de producto duplicados", `status ${duplicate.status}`);

  const updated = await api(`/api/productos/${productId}`, {
    method: "PUT",
    body: { name: `Producto prueba ${suffix} (editado)`, minStock: 9 },
  });
  assert(updated.ok && updated.data?.data?.name.includes("editado"), "Actualiza el producto", JSON.stringify(updated.data));

  const invalid = await api("/api/productos", {
    method: "POST",
    body: { code: "con espacios inválidos", name: "X" },
  });
  assert(invalid.status === 400, "Rechaza datos inválidos con 400", `status ${invalid.status}`);

  // ---------------------------------------------------------------
  section("3. Entradas (deben afectar el inventario)");

  const entry = await api("/api/entradas", {
    method: "POST",
    body: {
      format: "E1",
      date: new Date().toISOString().slice(0, 10),
      origin: "Prueba end-to-end",
      items: [
        { productId, warehouseId, quantity: 100, unit: "unidad" },
      ],
    },
  });
  assert(entry.ok && !!entry.data?.data?.id, "Crea una entrada", JSON.stringify(entry.data));
  assert(!!entry.data?.data?.number?.startsWith("ENT-"), "La entrada recibe número consecutivo automático", entry.data?.data?.number);
  assert(entry.data?.data?.items?.length === 1, "La entrada guarda sus ítems");

  const afterEntry = await api("/api/inventario");
  const stockAfterEntry = afterEntry.data?.data?.find(
    (i) => i.productId === productId && i.warehouseId === warehouseId
  );
  assert(
    stockAfterEntry?.quantity === 100,
    "El inventario sube a 100 unidades tras la entrada",
    `existencia = ${stockAfterEntry?.quantity}`
  );

  const entryAgain = await api("/api/entradas", {
    method: "POST",
    body: {
      format: "E1",
      date: new Date().toISOString().slice(0, 10),
      items: [{ productId, warehouseId, quantity: 20, unit: "unidad" }],
    },
  });
  assert(entryAgain.ok, "Crea una segunda entrada");

  const afterSecond = await api("/api/inventario");
  const stockAfterSecond = afterSecond.data?.data?.find(
    (i) => i.productId === productId && i.warehouseId === warehouseId
  );
  assert(
    stockAfterSecond?.quantity === 120,
    "El inventario acumula (120 unidades)",
    `existencia = ${stockAfterSecond?.quantity}`
  );

  // ---------------------------------------------------------------
  section("4. Flujo de salida: pedido → factura → recibo → despacho");

  const order = await api("/api/pedidos", {
    method: "POST",
    body: {
      date: new Date().toISOString().slice(0, 10),
      destination: "Destino de prueba",
      items: [{ productId, warehouseId, quantity: 30 }],
    },
  });
  assert(order.ok && !!order.data?.data?.id, "Crea un pedido", JSON.stringify(order.data));
  assert(order.data?.data?.items?.length === 1, "El pedido guarda sus ítems");
  const orderId = order.data?.data?.id;

  const invoice = await api("/api/facturas", {
    method: "POST",
    body: {
      format: "SF1",
      orderId,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  assert(invoice.ok && !!invoice.data?.data?.id, "Crea una factura a partir del pedido", JSON.stringify(invoice.data));
  assert(invoice.data?.data?.items?.length === 1, "La factura hereda los ítems del pedido");

  const ordersAfterInvoice = await api("/api/pedidos");
  const orderStatus = ordersAfterInvoice.data?.data?.find((o) => o.id === orderId)?.status;
  assert(orderStatus === "INVOICED", "El pedido queda en estado INVOICED", orderStatus);

  const receipt = await api("/api/recibos", {
    method: "POST",
    body: {
      format: "R1",
      invoiceId: invoice.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  assert(receipt.ok && !!receipt.data?.data?.id, "Crea un recibo a partir de la factura", JSON.stringify(receipt.data));

  const dispatch = await api("/api/despachos", {
    method: "POST",
    body: {
      receiptId: receipt.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  assert(dispatch.ok && !!dispatch.data?.data?.id, "Crea un despacho a partir del recibo", JSON.stringify(dispatch.data));
  assert(dispatch.data?.data?.items?.length === 1, "El despacho hereda los ítems del pedido");

  const afterDispatch = await api("/api/inventario");
  const stockAfterDispatch = afterDispatch.data?.data?.find(
    (i) => i.productId === productId && i.warehouseId === warehouseId
  );
  assert(
    stockAfterDispatch?.quantity === 90,
    "El inventario baja a 90 unidades tras el despacho",
    `existencia = ${stockAfterDispatch?.quantity}`
  );

  const duplicateDispatch = await api("/api/despachos", {
    method: "POST",
    body: {
      receiptId: receipt.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  assert(
    duplicateDispatch.status === 409,
    "Rechaza un segundo despacho para el mismo recibo",
    `status ${duplicateDispatch.status} ${JSON.stringify(duplicateDispatch.data?.error)}`
  );

  // Salida mayor que la existencia disponible → debe rechazarse.
  const bigOrder = await api("/api/pedidos", {
    method: "POST",
    body: {
      date: new Date().toISOString().slice(0, 10),
      destination: "Destino sin stock",
      items: [{ productId, warehouseId, quantity: 5000 }],
    },
  });
  assert(bigOrder.ok, "Crea un pedido por encima de la existencia");

  const bigInvoice = await api("/api/facturas", {
    method: "POST",
    body: {
      format: "SF1",
      orderId: bigOrder.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  const bigReceipt = await api("/api/recibos", {
    method: "POST",
    body: {
      format: "R1",
      invoiceId: bigInvoice.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const overDispatch = await api("/api/despachos", {
    method: "POST",
    body: {
      receiptId: bigReceipt.data?.data?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  assert(
    overDispatch.status === 400,
    "Rechaza despachar más de la existencia disponible",
    `status ${overDispatch.status} ${JSON.stringify(overDispatch.data?.error)}`
  );
  assert(
    overDispatch.data?.error?.code === "INSUFFICIENT_STOCK",
    "Informa que no hay stock suficiente",
    JSON.stringify(overDispatch.data?.error)
  );

  const stockUnchanged = await api("/api/inventario");
  const quantityAfterFail = stockUnchanged.data?.data?.find(
    (i) => i.productId === productId && i.warehouseId === warehouseId
  );
  assert(
    quantityAfterFail?.quantity === 90,
    "El inventario no cambia cuando el despacho se rechaza",
    `existencia = ${quantityAfterFail?.quantity}`
  );

  // ---------------------------------------------------------------
  section("5. Auditoría de inventario (conciliación)");

  const audit = await api("/api/auditoria", {
    method: "POST",
    body: {
      date: new Date().toISOString().slice(0, 10),
      warehouseId,
      responsible: "Prueba end-to-end",
      items: [{ productId, physicalQuantity: 85 }],
    },
  });
  assert(audit.ok && !!audit.data?.data?.id, "Crea una auditoría", JSON.stringify(audit.data));
  assert(
    audit.data?.data?.items?.[0]?.systemQuantity === 90,
    "La existencia del sistema se toma de la base de datos (90)",
    `systemQuantity = ${audit.data?.data?.items?.[0]?.systemQuantity}`
  );
  assert(
    audit.data?.data?.items?.[0]?.difference === -5,
    "Calcula la diferencia física (-5)",
    `difference = ${audit.data?.data?.items?.[0]?.difference}`
  );

  const afterAudit = await api("/api/inventario");
  const stockAfterAudit = afterAudit.data?.data?.find(
    (i) => i.productId === productId && i.warehouseId === warehouseId
  );
  assert(
    stockAfterAudit?.quantity === 85,
    "El inventario se ajusta al conteo físico (85)",
    `existencia = ${stockAfterAudit?.quantity}`
  );

  // ---------------------------------------------------------------
  section("6. Consulta y reportes");

  const dashboard = await api("/api/dashboard");
  assert(dashboard.ok && dashboard.data?.data?.totalProducts > 0, "El dashboard devuelve totales", JSON.stringify(dashboard.data?.data?.totalProducts));
  assert(Array.isArray(dashboard.data?.data?.recentEntries), "El dashboard lista las entradas recientes");
  assert(Array.isArray(dashboard.data?.data?.lowStockProducts), "El dashboard lista los productos con stock bajo");

  const reports = await api("/api/reportes");
  assert(reports.ok && Array.isArray(reports.data?.data?.inventoryByWarehouse), "El reporte agrupa el inventario por bodega");
  assert(Array.isArray(reports.data?.data?.lowStock), "El reporte lista los productos con stock bajo");
  assert(Array.isArray(reports.data?.data?.recentEntries), "El reporte lista las entradas recientes");
  assert(Array.isArray(reports.data?.data?.auditDifferences), "El reporte lista las diferencias de auditoría");

  const entries = await api("/api/entradas");
  assert(entries.ok && entries.data.data.length > 0, "El listado de entradas responde");

  const invoices = await api("/api/facturas");
  assert(invoices.ok && invoices.data.data.length > 0, "El listado de facturas responde");

  const receipts = await api("/api/recibos");
  assert(receipts.ok && receipts.data.data.length > 0, "El listado de recibos responde");

  const dispatches = await api("/api/despachos");
  assert(dispatches.ok && dispatches.data.data.length > 0, "El listado de despachos responde");

  const audits = await api("/api/auditoria");
  assert(audits.ok && audits.data.data.length > 0, "El listado de auditorías responde");
  assert(
    audits.data.data.some((a) => !!a.warehouseName),
    "Las auditorías traen el nombre de la bodega"
  );

  const warehouses = await api("/api/bodegas");
  assert(warehouses.ok && warehouses.data.data.length > 0, "El listado de bodegas responde");

  // ---------------------------------------------------------------
  section("7. Usuarios y auditoría del sistema");

  const createdUser = await api("/api/usuarios", {
    method: "POST",
    body: {
      username: `test${suffix}`,
      email: `test${suffix}@bancoalimentos.org`,
      firstName: "Usuario",
      lastName: "Prueba",
      password: "prueba123",
      role: "RECEPCION",
    },
  });
  assert(createdUser.ok && !!createdUser.data?.data?.id, "Crea un usuario", JSON.stringify(createdUser.data));
  assert(
    createdUser.data?.data?.passwordHash === undefined,
    "No expone el hash de la contraseña"
  );

  const userList = await api("/api/usuarios");
  const newUser = userList.data?.data?.find((u) => u.id === createdUser.data?.data?.id);
  assert(newUser?.firstName === "Usuario", "El usuario se listar con nombre y apellido", JSON.stringify(newUser));

  const config = await api("/api/configuracion");
  assert(config.ok && config.data?.data?.database?.connected, "Configuración confirma la conexión a la base de datos");

  // ---------------------------------------------------------------
  section("8. Integración Siigo (ExcelSiigo)");

  const siigo = await api("/api/siigo/export", {
    method: "POST",
    body: { format: "E1" },
  });
  assert(
    siigo.response.headers.get("content-type")?.includes("spreadsheetml"),
    "Genera el archivo ExcelSiigo (E1)",
    siigo.response.headers.get("content-type") ?? "sin content-type"
  );

  const siigoError = await api("/api/siigo/export", {
    method: "POST",
    body: { format: "NO_EXISTE" },
  });
  assert(siigoError.status === 400, "Rechaza formatos no soportados", `status ${siigoError.status}`);

  // ---------------------------------------------------------------
  section("9. Cierre de sesión");

  const logout = await api("/api/auth/logout", { method: "POST" });
  assert(logout.ok, "Cierra la sesión");

  cookie = "";
  const afterLogout = await fetch(`${BASE_URL}/api/productos`);
  assert(
    afterLogout.status === 401,
    "Tras cerrar sesión las APIs responden 401",
    `status ${afterLogout.status}`
  );
}

async function main() {
  const server = urlIndex === -1 ? await startServer() : null;

  try {
    await run();
  } catch (error) {
    fail(`Error inesperado: ${error.message}`, error.stack);
  } finally {
    if (server) {
      server.kill();
      await sleep(1000);
    }
  }

  console.log(`\n${C.cyan}══════════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}Correctas: ${passed}${C.reset}   ${failed > 0 ? C.red : C.gray}Fallidas: ${failed}${C.reset}`);
  if (failures.length > 0) {
    console.log(`\n  ${C.red}Fallos:${C.reset}`);
    failures.forEach((message) => console.log(`   - ${message}`));
  }
  console.log(`${C.cyan}══════════════════════════════════════════════${C.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
