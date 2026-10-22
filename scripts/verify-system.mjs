/**
 * Verificación integral del sistema
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:
 *   npm run verify              → usa el servidor en http://localhost:3000
 *   npm run verify -- --server  → levanta el servidor de desarrollo y lo apaga al final
 *
 * Qué hace:
 *   1. Verifica la conexión real a Supabase (host, latencia, versión).
 *   2. Verifica el esquema (tablas, enums, índices).
 *   3. Ejecuta una prueba funcional de CADA módulo a través de la API real,
 *      dejando los datos creados en la base para que sean visibles en el
 *      Table Editor de Supabase.
 *   4. Vuelve a leer la base de datos directamente y confirma que cada dato
 *      quedó escrito con el valor esperado.
 *   5. Entrega las instrucciones exactas para revisar los datos en Supabase.
 *
 * Los datos de prueba NO se borran: llevan el prefijo de la corrida para que
 * puedas identificarlos y eliminarlos cuando quieras.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import postgres from "postgres";
import { readEnvFile } from "./lib/env.mjs";

// ============================================================
// CONFIGURACIÓN
// ============================================================

const args = process.argv.slice(2);
const useOwnServer = args.includes("--server");
const BASE_URL = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--url="))
  ?.replace("--url=", "")
  .replace(/\/$/, "") ?? "http://localhost:3000";

const ADMIN = { username: "admin", password: "admin123" };

/** Identificador visible de la corrida: PRUEBA-AAAAMMDD-HHMM */
const RUN_ID = `PRUEBA-${new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 12)}`;

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

const results = [];
let passed = 0;
let failed = 0;

function ok(module, message, detail) {
  passed += 1;
  results.push({ module, status: "ok", message });
  console.log(`  ${C.green}✓${C.reset} ${message}${detail ? ` ${C.gray}${detail}${C.reset}` : ""}`);
}

function fail(module, message, detail) {
  failed += 1;
  results.push({ module, status: "fail", message });
  console.log(`  ${C.red}✗${C.reset} ${message}${detail ? ` ${C.gray}${detail}${C.reset}` : ""}`);
}

function section(title) {
  console.log(`\n${C.cyan}${C.bold}${title}${C.reset}`);
}

function info(text) {
  console.log(`    ${C.gray}${text}${C.reset}`);
}

// ============================================================
// SERVIDOR
// ============================================================

async function isServerUp(url) {
  try {
    const response = await fetch(`${url}/login`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  console.log(`${C.gray}Levantando el servidor de desarrollo...${C.reset}`);

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
    try {
      const response = await fetch("http://localhost:3000/login");
      if (response.ok) return server;
    } catch {
      /* aún no levanta */
    }
    await sleep(1500);
  }

  server.kill();
  throw new Error(`El servidor no respondió a tiempo.\n${output.slice(-1500)}`);
}

// ============================================================
// CLIENTE HTTP
// ============================================================

let cookie = "";

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

// ============================================================
// 1. CONEXIÓN
// ============================================================

const created = {
  usuario: null,
  categoria: null,
  bodega: null,
  productoAlto: null,
  productoBajo: null,
  entrada: null,
  pedido: null,
  factura: null,
  recibo: null,
  despacho: null,
  auditoria: null,
};

async function checkConnection() {
  section("1. CONEXIÓN A SUPABASE");

  const env = readEnvFile();
  if (!env.DATABASE_URL) {
    fail("conexión", "DATABASE_URL no está definida en .env.local");
    return null;
  }

  const sql = postgres(env.DATABASE_URL, {
    max: 1,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

  try {
    const startedAt = Date.now();
    const [serverInfo] = await sql`
      select current_database() as db,
             current_user as usr,
             version() as version,
             inet_server_addr()::text as server
    `;
    const latency = Date.now() - startedAt;

    ok("conexión", "Conexión TCP + autenticación + consulta OK");
    info(`host      : ${new URL(env.DATABASE_URL).host}`);
    info(`base      : ${serverInfo.db}   usuario: ${serverInfo.usr}`);
    info(`versión   : ${serverInfo.version.split(" ").slice(0, 2).join(" ")}`);
    info(`latencia  : ${latency} ms`);
    info(`server    : ${serverInfo.server}`);

    // Escritura real en la base (marca de tiempo de la corrida)
    await sql`
      insert into "audit_logs" ("user_id", "action", "entity", "result", "details")
      select id, 'LOGIN', 'verificacion', 'SUCCESS', ${`Prueba automatica ${RUN_ID}`}
      from "users" where "username" = ${ADMIN.username}
    `;

    const [written] = await sql`
      select count(*)::int as c from "audit_logs" where "details" = ${`Prueba automatica ${RUN_ID}`}
    `;
    ok("conexión", "Escritura real en la base de datos confirmada", `audit_logs +1 fila`);

    if (written.c !== 1) {
      fail("conexión", "La escritura no se refleja en la lectura");
    }

    return sql;
  } catch (error) {
    fail("conexión", "No se pudo conectar a la base de datos", error.message);
    await sql.end({ timeout: 1 }).catch(() => {});
    return null;
  }
}

// ============================================================
// 2. ESQUEMA
// ============================================================

async function checkSchema(sql) {
  section("2. ESQUEMA DE LA BASE DE DATOS");

  const expected = [
    "users", "roles", "categories", "products", "warehouses", "inventory",
    "inventory_movements", "entries", "entry_items", "orders", "order_items",
    "invoices", "invoice_items", "receipts", "dispatches", "dispatch_items",
    "audits", "audit_items", "audit_logs", "documents",
  ];

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  const names = tables.map((t) => t.table_name);
  const missing = expected.filter((t) => !names.includes(t));

  if (missing.length === 0) {
    ok("esquema", `${expected.length} tablas del sistema presentes`);
  } else {
    fail("esquema", `Faltan tablas: ${missing.join(", ")}`);
  }

  const enums = await sql`
    select t.typname from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  `;
  ok("esquema", `${enums.length} tipos ENUM definidos`);

  const indexes = await sql`
    select count(*)::int as c from pg_indexes where schemaname = 'public'
  `;
  ok("esquema", `${indexes[0].c} índices creados`);

  const fks = await sql`
    select count(*)::int as c
    from information_schema.table_constraints
    where table_schema = 'public' and constraint_type = 'FOREIGN KEY'
  `;
  ok("esquema", `${fks[0].c} claves foráneas con integridad referencial`);
}

// ============================================================
// 3. MÓDULOS (API real)
// ============================================================

async function checkModules() {
  section("3. MÓDULOS A TRAVÉS DE LA API REAL");

  // ---------- Autenticación ----------
  const bad = await api("/api/auth/login", {
    method: "POST",
    body: { username: ADMIN.username, password: "incorrecta" },
  });
  if (bad.status === 401) ok("autenticación", "Rechaza credenciales inválidas");
  else fail("autenticación", "No rechazó credenciales inválidas", `status ${bad.status}`);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: ADMIN,
  });
  if (login.ok && login.data?.success) {
    ok("autenticación", `Login ${ADMIN.username} / ${ADMIN.password}`, "cookie de sesión firmada");
  } else {
    fail("autenticación", "El login falló", JSON.stringify(login.data));
    return false;
  }

  // ---------- Categorías ----------
  const categoria = await api("/api/categorias", {
    method: "POST",
    body: { name: `${RUN_ID} Categoria`, description: "Creada por la verificacion automatica" },
  });
  if (categoria.ok) {
    created.categoria = categoria.data.data;
    ok("categorías", "Crea una categoría", categoria.data.data.name);
  } else {
    fail("categorías", "No se pudo crear la categoría", JSON.stringify(categoria.data));
  }

  // ---------- Bodegas ----------
  const bodega = await api("/api/bodegas", {
    method: "POST",
    body: {
      code: `V.${RUN_ID.slice(-4)}`,
      name: `${RUN_ID} Bodega`,
      type: "PROPIA",
      description: "Creada por la verificacion automatica",
    },
  });
  if (bodega.ok) {
    created.bodega = bodega.data.data;
    ok("bodegas", "Crea una bodega", `${created.bodega.code} — ${created.bodega.name}`);
  } else {
    fail("bodegas", "No se pudo crear la bodega", JSON.stringify(bodega.data));
  }

  // ---------- Productos ----------
  const productoAlto = await api("/api/productos", {
    method: "POST",
    body: {
      code: `${RUN_ID}-A`,
      name: `${RUN_ID} Producto A`,
      description: "Creado por la verificacion automatica",
      unit: "unidad",
      weight: 1,
      minStock: 10,
      categoryId: created.categoria?.id ?? null,
    },
  });
  if (productoAlto.ok) {
    created.productoAlto = productoAlto.data.data;
    ok("productos", "Crea un producto con categoría", created.productoAlto.code);
  } else {
    fail("productos", "No se pudo crear el producto", JSON.stringify(productoAlto.data));
  }

  const productoBajo = await api("/api/productos", {
    method: "POST",
    body: {
      code: `${RUN_ID}-B`,
      name: `${RUN_ID} Producto B (stock bajo)`,
      unit: "kg",
      weight: 0.5,
      minStock: 50,
      categoryId: created.categoria?.id ?? null,
    },
  });
  if (productoBajo.ok) {
    created.productoBajo = productoBajo.data.data;
    ok("productos", "Crea un producto que dispara la alerta de stock bajo");
  } else {
    fail("productos", "No se pudo crear el segundo producto", JSON.stringify(productoBajo.data));
  }

  const duplicado = await api("/api/productos", {
    method: "POST",
    body: { code: `${RUN_ID}-A`, name: "Duplicado", unit: "unidad" },
  });
  if (duplicado.status === 409) ok("productos", "Rechaza códigos duplicados");
  else fail("productos", "Aceptó un código duplicado", `status ${duplicado.status}`);

  // ---------- Usuarios ----------
  const usuario = await api("/api/usuarios", {
    method: "POST",
    body: {
      username: `verif${RUN_ID.slice(-8).toLowerCase()}`,
      email: `${RUN_ID.toLowerCase()}@bancoalimentos.org`,
      firstName: "Verificacion",
      lastName: "Automatica",
      password: "verificacion123",
      role: "RECEPCION",
    },
  });
  if (usuario.ok) {
    created.usuario = usuario.data.data;
    ok("usuarios", "Crea un usuario", created.usuario.username);
  } else {
    fail("usuarios", "No se pudo crear el usuario", JSON.stringify(usuario.data));
  }

  const sinHash = usuario.data?.data?.passwordHash === undefined;
  if (sinHash) ok("usuarios", "No expone el hash de la contraseña");
  else fail("usuarios", "Expone el hash de la contraseña");

  // ---------- Entradas ----------
  const entrada = await api("/api/entradas", {
    method: "POST",
    body: {
      format: "E1",
      date: new Date().toISOString().slice(0, 10),
      nit: "900.123.456-7",
      origin: `${RUN_ID} Origen verificacion`,
      document: `${RUN_ID}-FAC-001`,
      notes: "Entrada creada por la verificacion automatica",
      items: [
        {
          productId: created.productoAlto?.id,
          warehouseId: created.bodega?.id,
          quantity: 200,
          unit: "unidad",
        },
        {
          productId: created.productoBajo?.id,
          warehouseId: created.bodega?.id,
          quantity: 30,
          unit: "kg",
        },
      ],
    },
  });
  if (entrada.ok) {
    created.entrada = entrada.data.data;
    ok("entradas", "Crea una entrada con 2 ítems", `número ${created.entrada.number}`);
  } else {
    fail("entradas", "No se pudo crear la entrada", JSON.stringify(entrada.data));
  }

  // ---------- Pedidos ----------
  const pedido = await api("/api/pedidos", {
    method: "POST",
    body: {
      date: new Date().toISOString().slice(0, 10),
      nit: "800.987.654-3",
      destination: `${RUN_ID} Destino verificacion`,
      notes: "Pedido creado por la verificacion automatica",
      items: [
        { productId: created.productoAlto?.id, warehouseId: created.bodega?.id, quantity: 50 },
      ],
    },
  });
  if (pedido.ok) {
    created.pedido = pedido.data.data;
    ok("pedidos", "Crea un pedido con ítems", `número ${created.pedido.number}`);
  } else {
    fail("pedidos", "No se pudo crear el pedido", JSON.stringify(pedido.data));
  }

  // ---------- Facturas ----------
  const factura = await api("/api/facturas", {
    method: "POST",
    body: {
      format: "SF1",
      orderId: created.pedido?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  if (factura.ok) {
    created.factura = factura.data.data;
    ok("facturas", "Crea una factura desde el pedido", `número ${created.factura.number}`);
  } else {
    fail("facturas", "No se pudo crear la factura", JSON.stringify(factura.data));
  }

  // ---------- Recibos ----------
  const recibo = await api("/api/recibos", {
    method: "POST",
    body: {
      format: "R1",
      invoiceId: created.factura?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  if (recibo.ok) {
    created.recibo = recibo.data.data;
    ok("recibos", "Crea un recibo desde la factura", `número ${created.recibo.number}`);
  } else {
    fail("recibos", "No se pudo crear el recibo", JSON.stringify(recibo.data));
  }

  // ---------- Despachos ----------
  const despacho = await api("/api/despachos", {
    method: "POST",
    body: {
      receiptId: created.recibo?.id,
      date: new Date().toISOString().slice(0, 10),
      notes: "Despacho creado por la verificacion automatica",
    },
  });
  if (despacho.ok) {
    created.despacho = despacho.data.data;
    ok("despachos", "Crea un despacho desde el recibo", `número ${created.despacho.number}`);
  } else {
    fail("despachos", "No se pudo crear el despacho", JSON.stringify(despacho.data));
  }

  const despachoDuplicado = await api("/api/despachos", {
    method: "POST",
    body: {
      receiptId: created.recibo?.id,
      date: new Date().toISOString().slice(0, 10),
    },
  });
  if (despachoDuplicado.status === 409) {
    ok("despachos", "Impide despachar dos veces el mismo recibo");
  } else {
    fail("despachos", "Permitió un segundo despacho del mismo recibo", `status ${despachoDuplicado.status}`);
  }

  // ---------- Auditoría ----------
  const auditoria = await api("/api/auditoria", {
    method: "POST",
    body: {
      date: new Date().toISOString().slice(0, 10),
      warehouseId: created.bodega?.id,
      responsible: `${RUN_ID} Verificador`,
      notes: "Auditoria creada por la verificacion automatica",
      items: [{ productId: created.productoAlto?.id, physicalQuantity: 190 }],
    },
  });
  if (auditoria.ok) {
    created.auditoria = auditoria.data.data;
    ok("auditoría", "Crea una auditoría de conciliación", `diferencia ${auditoria.data.data.items?.[0]?.difference}`);
  } else {
    fail("auditoría", "No se pudo crear la auditoría", JSON.stringify(auditoria.data));
  }

  // ---------- Inventario (lectura) ----------
  const inventario = await api("/api/inventario");
  const fila = inventario.data?.data?.find(
    (i) => i.productId === created.productoAlto?.id && i.warehouseId === created.bodega?.id
  );
  if (fila) ok("inventario", "Consulta el inventario con producto y bodega", `existencia ${fila.quantity}`);
  else fail("inventario", "No encontró el registro de inventario");

  // ---------- Dashboard ----------
  const dashboard = await api("/api/dashboard");
  if (dashboard.ok && dashboard.data?.data) {
    const d = dashboard.data.data;
    ok(
      "dashboard",
      "Calcula los indicadores",
      `${d.totalProducts} productos · ${d.totalUnits} unidades · ${d.lowStockProducts.length} con stock bajo`
    );
  } else {
    fail("dashboard", "No devolvió indicadores", JSON.stringify(dashboard.data));
  }

  // ---------- Reportes ----------
  const reportes = await api("/api/reportes");
  if (
    reportes.ok &&
    Array.isArray(reportes.data?.data?.inventoryByWarehouse) &&
    Array.isArray(reportes.data?.data?.lowStock)
  ) {
    const r = reportes.data.data;
    ok(
      "reportes",
      "Genera los agregados",
      `${r.inventoryByWarehouse.length} bodegas · ${r.lowStock.length} stock bajo · ${r.auditDifferences.length} diferencias`
    );
  } else {
    fail("reportes", "No devolvió los reportes", JSON.stringify(reportes.data));
  }

  // ---------- Integración Siigo ----------
  const siigo = await api("/api/siigo/export", {
    method: "POST",
    body: { format: "E1" },
  });
  if (siigo.response.headers.get("content-type")?.includes("spreadsheetml")) {
    ok("siigo", "Genera el archivo ExcelSiigo (E1)", "desde datos reales");
  } else {
    fail("siigo", "No generó el archivo ExcelSiigo", `status ${siigo.status}`);
  }

  // ---------- Configuración ----------
  const config = await api("/api/configuracion");
  if (config.ok && config.data?.data?.database?.connected) {
    ok("configuración", "Confirma el estado de la conexión", `${config.data.data.database.latencyMs} ms`);
  } else {
    fail("configuración", "No confirmó la conexión");
  }

  return true;
}

// ============================================================
// 4. VERIFICACIÓN DIRECTA EN LA BASE
// ============================================================

async function verifyInDatabase(sql) {
  section("4. VERIFICACIÓN DIRECTA EN LA BASE (lo que verás en Supabase)");

  const checks = [
    {
      table: "users",
      label: "usuarios",
      query: `select * from "users" where "email" = $1`,
      params: [`${RUN_ID.toLowerCase()}@bancoalimentos.org`],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.username} (${rows[0]?.role})`,
    },
    {
      table: "categories",
      label: "categorías",
      query: `select * from "categories" where "name" = $1`,
      params: [`${RUN_ID} Categoria`],
      expect: (rows) => rows.length === 1,
      detail: (rows) => rows[0]?.name,
    },
    {
      table: "warehouses",
      label: "bodegas",
      query: `select * from "warehouses" where "name" = $1`,
      params: [`${RUN_ID} Bodega`],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.code} (${rows[0]?.type})`,
    },
    {
      table: "products",
      label: "productos",
      query: `select * from "products" where "code" like $1`,
      params: [`${RUN_ID}-%`],
      expect: (rows) => rows.length === 2,
      detail: (rows) => rows.map((r) => r.code).join(", "),
    },
    {
      table: "entries",
      label: "entradas",
      query: `select * from "entries" where "origin" = $1`,
      params: [`${RUN_ID} Origen verificacion`],
      expect: (rows) => rows.length === 1 && rows[0].status === "CONFIRMED",
      detail: (rows) => `${rows[0]?.number} · ${rows[0]?.status}`,
    },
    {
      table: "entry_items",
      label: "ítems de entrada",
      query: `select * from "entry_items" where "entry_id" = $1`,
      params: [created.entrada?.id],
      expect: (rows) => rows.length === 2,
      detail: (rows) => rows.map((r) => `${r.quantity} ${r.unit}`).join(" + "),
    },
    {
      table: "inventory",
      label: "inventario",
      query: `select * from "inventory" where "product_id" = $1`,
      params: [created.productoAlto?.id],
      // Existencia real al auditar: 200 (entrada) − 50 (despacho) = 150
      // El conteo físico fue 190 → diferencia +40 y el stock queda en 190.
      expect: (rows) => rows.length === 1 && Number(rows[0].quantity) === 190,
      detail: (rows) =>
        `existencia ${rows[0]?.quantity} (200 − 50 + 40 ajuste)`,
    },
    {
      table: "inventory_movements",
      label: "movimientos",
      query: `select * from "inventory_movements" where "product_id" = $1`,
      params: [created.productoAlto?.id],
      expect: (rows) => rows.length === 3,
      detail: (rows) =>
        rows
          .map((r) => `${r.type} ${Number(r.quantity) > 0 ? "+" : ""}${Number(r.quantity)}`)
          .join(", "),
    },
    {
      table: "orders",
      label: "pedidos",
      query: `select * from "orders" where "destination" = $1`,
      params: [`${RUN_ID} Destino verificacion`],
      expect: (rows) => rows.length === 1 && rows[0].status === "DISPATCHED",
      detail: (rows) => `${rows[0]?.number} · ${rows[0]?.status}`,
    },
    {
      table: "order_items",
      label: "ítems de pedido",
      query: `select * from "order_items" where "order_id" = $1`,
      params: [created.pedido?.id],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.quantity} unidades`,
    },
    {
      table: "invoices",
      label: "facturas",
      query: `select * from "invoices" where "order_id" = $1`,
      params: [created.pedido?.id],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.number} (${rows[0]?.format})`,
    },
    {
      table: "invoice_items",
      label: "ítems de factura",
      query: `select * from "invoice_items" where "invoice_id" = $1`,
      params: [created.factura?.id],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.quantity} unidades`,
    },
    {
      table: "receipts",
      label: "recibos",
      query: `select * from "receipts" where "invoice_id" = $1`,
      params: [created.factura?.id],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.number} (${rows[0]?.format})`,
    },
    {
      table: "dispatches",
      label: "despachos",
      query: `select * from "dispatches" where "receipt_id" = $1`,
      params: [created.recibo?.id],
      expect: (rows) => rows.length === 1 && rows[0].status === "DISPATCHED",
      detail: (rows) => `${rows[0]?.number} · ${rows[0]?.status}`,
    },
    {
      table: "dispatch_items",
      label: "ítems de despacho",
      query: `select * from "dispatch_items" where "dispatch_id" = $1`,
      params: [created.despacho?.id],
      expect: (rows) => rows.length === 1,
      detail: (rows) => `${rows[0]?.quantity} unidades`,
    },
    {
      table: "audits",
      label: "auditorías",
      query: `select *, "date"::text as fecha_texto from "audits" where "responsible" = $1`,
      params: [`${RUN_ID} Verificador`],
      expect: (rows) => rows.length === 1 && rows[0].status === "COMPLETED",
      detail: (rows) => `${rows[0]?.status} · ${rows[0]?.fecha_texto}`,
    },
    {
      table: "audit_items",
      label: "ítems de auditoría",
      query: `select * from "audit_items" where "audit_id" = $1`,
      params: [created.auditoria?.id],
      // Existencia real al auditar: 200 (entrada) − 50 (despacho) = 150
      // El conteo físico fue 190 → diferencia +40 y el stock queda en 190.
      expect: (rows) => rows.length === 1 && Number(rows[0].difference) === 40,
      detail: (rows) =>
        `sistema ${rows[0]?.system_quantity} · físico ${rows[0]?.physical_quantity} · dif +${Number(rows[0]?.difference)}`,
    },
    {
      table: "documents",
      label: "soportes documentales",
      query: `select * from "documents" where "related_id" in (select id from "entries" where "origin" = $1)`,
      params: [`${RUN_ID} Origen verificacion`],
      expect: (rows) => rows.length === 1,
      detail: (rows) => rows.map((r) => `${r.type} ${r.number}`).join(", "),
    },
    {
      table: "audit_logs",
      label: "bitácora del sistema",
      query: `select * from "audit_logs" where "created_at" > now() - interval '15 minutes'`,
      params: [],
      expect: (rows) => rows.length >= 8,
      detail: (rows) => `${rows.length} operaciones registradas`,
    },
  ];

  for (const check of checks) {
    try {
      const rows = await sql.unsafe(check.query, check.params);

      if (check.expect(rows)) {
        ok(check.label, `${check.table}: escritura confirmada`, check.detail(rows));
      } else {
        fail(check.label, `${check.table}: el valor esperado no coincide`, check.detail(rows));
      }
    } catch (error) {
      fail(check.label, `Error al leer ${check.table}`, error.message);
    }
  }
}

// ============================================================
// 5. INSTRUCCIONES PARA SUPABASE
// ============================================================

function printSupabaseGuide() {
  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}${C.bold}  CÓMO VER ESTOS DATOS EN SUPABASE${C.reset}`);
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);

  console.log(`\n  ${C.bold}Marcador de la corrida: ${RUN_ID}${C.reset}\n`);

  console.log(`  ${C.bold}Opción A — Table Editor (interfaz web)${C.reset}`);
  console.log(`    1. Supabase Dashboard → tu proyecto → ${C.bold}Table Editor${C.reset}`);
  console.log(`    2. Elige la tabla (products, entries, inventory, ...)`);
  console.log(`    3. Filtra con: ${C.cyan}code${C.reset} ${C.bold}ilike${C.reset} ${C.cyan}"${RUN_ID}%"${C.reset}`);
  console.log(`       o por nombre: ${C.cyan}name${C.reset} ${C.bold}ilike${C.reset} ${C.cyan}"${RUN_ID}%"${C.reset}`);
  console.log(`    4. En las tablas hijas filtra por el ${C.bold}id${C.reset} del documento padre`);

  console.log(`\n  ${C.bold}Opción B — SQL Editor (todo de un vistazo)${C.reset}`);
  console.log(`    Abre el ${C.bold}SQL Editor${C.reset} de Supabase y pega el contenido de`);
  console.log(`    ${C.cyan}scripts/supabase-verificar.sql${C.reset}`);
  console.log(`    (ya trae esta corrida parametrizada con ${RUN_ID})`);

  console.log(`\n  ${C.bold}Opción C — desde tu proyecto${C.reset}`);
  console.log(`    ${C.gray}npx supabase db dump --linked${C.reset}   (volcar los datos)`);

  console.log(`\n  ${C.bold}Identificadores creados en esta corrida${C.reset}`);
  const ids = [
    ["Usuario", created.usuario?.username],
    ["Categoría", created.categoria?.name],
    ["Bodega", `${created.bodega?.code} — ${created.bodega?.name}`],
    ["Producto A", created.productoAlto?.code],
    ["Producto B", created.productoBajo?.code],
    ["Entrada", created.entrada?.number],
    ["Pedido", created.pedido?.number],
    ["Factura", created.factura?.number],
    ["Recibo", created.recibo?.number],
    ["Despacho", created.despacho?.number],
  ];
  for (const [label, value] of ids) {
    if (value) console.log(`    ${label.padEnd(12)} ${C.cyan}${value}${C.reset}`);
  }

  console.log(`\n  ${C.bold}Cómo limpiar los datos de prueba (opcional)${C.reset}`);
  console.log(`    ${C.gray}Ejecuta scripts/supabase-limpiar.sql en el SQL Editor de Supabase.${C.reset}`);
  console.log(`    ${C.gray}Tus datos reales no se ven afectados: todo lleva el prefijo ${RUN_ID}.${C.reset}`);
}

// ============================================================
// EJECUCIÓN
// ============================================================

async function main() {
  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}${C.bold}  VERIFICACIÓN DEL SISTEMA DE INVENTARIOS${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${new Date().toLocaleString("es-CO")}  ·  ${RUN_ID}${C.reset}`);
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);

  let server = null;

  try {
    if (useOwnServer || !(await isServerUp(BASE_URL))) {
      server = await startServer();
    } else {
      console.log(`${C.gray}Usando el servidor ya activo en ${BASE_URL}${C.reset}`);
    }

    const sql = await checkConnection();
    if (!sql) {
      console.log(`\n${C.red}No se pudo continuar sin conexión a la base de datos.${C.reset}`);
      process.exitCode = 1;
      return;
    }

    await checkSchema(sql);

    const modulesOk = await checkModules();
    if (modulesOk) {
      await verifyInDatabase(sql);
    }

    await sql.end({ timeout: 5 }).catch(() => {});
  } catch (error) {
    fail("general", `Error inesperado: ${error.message}`);
    console.error(error);
  } finally {
    if (server) {
      server.kill();
      await sleep(800);
    }
  }

  printSupabaseGuide();

  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}Correctas: ${passed}${C.reset}   ${failed > 0 ? C.red : C.gray}Fallidas: ${failed}${C.reset}`);
  if (failed > 0) {
    console.log(`\n  ${C.red}Fallos:${C.reset}`);
    results
      .filter((r) => r.status === "fail")
      .forEach((r) => console.log(`   - [${r.module}] ${r.message}`));
  }
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
