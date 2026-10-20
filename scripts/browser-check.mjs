/**
 * Verificación de todos los módulos como los ves en el navegador
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:
 *   npm run check:modulos                     → usa http://localhost:3000
 *   npm run check:modulos -- --url=...        → otra URL
 *
 * Para cada módulo verifica DOS cosas:
 *   1. Que la página cargue con sesión activa (y devuelva 200).
 *   2. Que los datos que esa página consume lleguen bien y con contenido.
 *
 * El resultado es la lista de verificación para la revisión manual.
 */

const args = process.argv.slice(2);
const BASE_URL = (
  args.find((arg) => arg.startsWith("--url="))?.replace("--url=", "") ??
  "http://localhost:3000"
).replace(/\/$/, "");

const ADMIN = { username: "admin", password: "admin123" };

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

let cookie = "";
let passed = 0;
let failed = 0;
const fallos = [];

function ok(text) {
  passed += 1;
  console.log(`    ${C.green}✓${C.reset} ${text}`);
}

function fail(text, detail) {
  failed += 1;
  fallos.push(text);
  console.log(`    ${C.red}✗${C.reset} ${text}${detail ? ` ${C.gray}${detail}${C.reset}` : ""}`);
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

  return { status: response.status, ok: response.ok, response };
}

async function apiJson(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Cookie: cookie },
  });
  return { status: response.status, ok: response.ok, data: await response.json() };
}

/**
 * Cada módulo: página + endpoint de datos + comprobaciones.
 */
const MODULES = [
  {
    name: "Dashboard",
    page: "/dashboard",
    endpoint: "/api/dashboard",
    async check(data) {
      const d = data?.data;
      if (!d) return fail("no devolvió datos");
      if (typeof d.totalProducts !== "number") return fail("totales con formato inesperado");
      ok(`${d.totalProducts} productos · ${d.totalUnits} unidades · ${d.totalWarehouses} bodegas · ${d.totalUsers} usuarios`);
      ok(`${d.recentEntries.length} entradas recientes · ${d.recentExits.length} salidas recientes`);
      ok(`${d.lowStockProducts.length} producto(s) con stock bajo`);
    },
  },
  {
    name: "Entradas",
    page: "/entradas",
    endpoint: "/api/entradas",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} entrada(s) registrada(s)`);
      const confirmada = rows.find((e) => e.status === "CONFIRMED");
      if (confirmada) ok(`última confirmada: ${confirmada.number} (${confirmada.format})`);
      else fail("ninguna entrada confirmada");
    },
  },
  {
    name: "Pedidos",
    page: "/pedidos",
    endpoint: "/api/pedidos",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} pedido(s)`);
      if (rows[0]) ok(`ítems del pedido: ${rows[0].items?.length ?? 0}`);
    },
  },
  {
    name: "Facturas",
    page: "/facturas",
    endpoint: "/api/facturas",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} factura(s)`);
      if (rows[0]) ok(`heredan los ítems del pedido: ${rows[0].items?.length ?? 0} ítem(s)`);
    },
  },
  {
    name: "Recibos",
    page: "/recibos",
    endpoint: "/api/recibos",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} recibo(s)`);
    },
  },
  {
    name: "Despachos (Salidas)",
    page: "/salidas",
    endpoint: "/api/despachos",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} despacho(s)`);
      const despachado = rows.find((d) => d.status === "DISPATCHED");
      if (despachado) ok(`despacho confirmado: ${despachado.number} · ${despachado.items?.length ?? 0} ítem(s)`);
      else fail("ningún despacho confirmado");
    },
  },
  {
    name: "Auditoría",
    page: "/auditoria",
    endpoint: "/api/auditoria",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} auditoría(s)`);
      const conBodega = rows.find((a) => a.warehouseName);
      if (conBodega) ok(`muestra la bodega: ${conBodega.warehouseCode} ${conBodega.warehouseName}`);
      else fail("no muestra el nombre de la bodega");
      if (rows[0]?.items?.length) {
        const item = rows[0].items[0];
        ok(`conciliación: sistema ${item.systemQuantity} · físico ${item.physicalQuantity} · dif ${item.difference}`);
      }
    },
  },
  {
    name: "Inventario",
    page: "/inventario",
    endpoint: "/api/inventario",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} registro(s) de stock`);
      if (rows[0]) ok(`${rows[0].productCode} en ${rows[0].warehouseCode} → ${rows[0].quantity} unidades`);
      const conNombre = rows.find((r) => r.productName && r.warehouseName);
      if (!conNombre) fail("no trae el nombre del producto ni de la bodega");
    },
  },
  {
    name: "Productos",
    page: "/productos",
    endpoint: "/api/productos",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} producto(s) en el catálogo`);
      const conCategoria = rows.find((p) => p.categoryName);
      if (conCategoria) ok(`con categoría: ${conCategoria.code} → ${conCategoria.categoryName}`);
      else fail("no trae el nombre de la categoría");
      const conMinimo = rows.find((p) => typeof p.minStock === "number");
      if (conMinimo) ok(`stock mínimo visible: ${conMinimo.code} → ${conMinimo.minStock}`);
      else fail("no trae el stock mínimo");
    },
  },
  {
    name: "Bodegas",
    page: "/bodegas",
    endpoint: "/api/bodegas",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} bodega(s)`);
      if (rows[0]) ok(`tipos: ${[...new Set(rows.map((w) => w.type))].join(", ")}`);
    },
  },
  {
    name: "Reportes",
    page: "/reportes",
    endpoint: "/api/reportes",
    async check(data) {
      const r = data?.data;
      if (!r) return fail("no devolvió datos");
      if (!Array.isArray(r.inventoryByWarehouse)) return fail("sin inventario por bodega");
      ok(`inventario agrupado en ${r.inventoryByWarehouse.length} bodega(s)`);
      ok(`${r.lowStock.length} producto(s) con stock bajo`);
      ok(`${r.recentEntries.length} entrada(s) reciente(s)`);
      ok(`${r.auditDifferences.length} diferencia(s) de auditoría`);
    },
  },
  {
    name: "Usuarios",
    page: "/usuarios",
    endpoint: "/api/usuarios",
    async check(data) {
      const rows = data?.data;
      if (!Array.isArray(rows)) return fail("no devolvió un listado");
      ok(`${rows.length} usuario(s)`);
      if (rows[0]) ok(`nombre completo visible: ${rows[0].firstName} ${rows[0].lastName} (${rows[0].role})`);
      else fail("sin usuarios");
      if (rows.some((u) => u.passwordHash !== undefined)) {
        fail("expone el hash de una contraseña");
      } else {
        ok("no expone hashes de contraseña");
      }
    },
  },
  {
    name: "Integración Siigo",
    page: "/integracion-siigo",
    endpoint: null,
    async check() {
      const response = await api("/api/siigo/export", {
        method: "POST",
        body: { format: "E1" },
      });
      const type = response.response.headers.get("content-type") ?? "";
      if (!type.includes("spreadsheetml")) {
        return fail("no generó el archivo Excel", `status ${response.status}`);
      }
      const buffer = await response.response.arrayBuffer();
      ok(`archivo ExcelSiigo generado (${buffer.byteLength} bytes)`);
    },
  },
  {
    name: "Configuración",
    page: "/configuracion",
    endpoint: "/api/configuracion",
    async check(data) {
      const s = data?.data;
      if (!s) return fail("no devolvió datos");
      if (!s.database?.connected) return fail("la base de datos aparece desconectada");
      ok(`base conectada: ${s.database.host} (${s.database.latencyMs} ms)`);
      ok(`productos en catálogo: ${s.catalog.products}`);
    },
  },
];

async function main() {
  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.cyan}${C.bold}  VERIFICACIÓN DE MÓDULOS · como los ves en el navegador${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${BASE_URL}${C.reset}`);
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);

  // --- Sesión ---
  console.log(`\n${C.bold}SESIÓN${C.reset}`);
  const bad = await api("/api/auth/login", {
    method: "POST",
    body: { username: ADMIN.username, password: "mala" },
  });
  if (bad.status === 401) ok("rechaza credenciales incorrectas");
  else fail("no rechazó credenciales incorrectas", `status ${bad.status}`);

  const login = await api("/api/auth/login", { method: "POST", body: ADMIN });
  if (!login.ok) {
    fail("el login falló", `status ${login.status}`);
    process.exit(1);
  }
  ok(`login ${ADMIN.username} / ${ADMIN.password} → cookie de sesión`);

  const me = await apiJson("/api/auth/me");
  if (me.data?.success) ok(`sesión activa: ${me.data.data.firstName} ${me.data.data.lastName} (${me.data.data.role})`);
  else fail("no reconoce la sesión");

  // --- Módulos ---
  for (const modulo of MODULES) {
    console.log(`\n${C.bold}${modulo.name}${C.reset}  ${C.gray}${modulo.page}${C.reset}`);

    const page = await fetch(`${BASE_URL}${modulo.page}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    if (page.status !== 200) {
      fail(`la página respondió ${page.status}`);
      continue;
    }

    const html = await page.text();
    if (html.includes("Application error") || html.includes("__next_error__")) {
      fail("la página renderizó con error");
      continue;
    }
    ok(`página cargada (${html.length} bytes)`);

    if (modulo.endpoint) {
      const response = await apiJson(modulo.endpoint);
      if (!response.ok) {
        fail(`${modulo.endpoint} respondió ${response.status}`);
        continue;
      }
      // `response.data` es el cuerpo JSON de la API: { success, data }
      await modulo.check(response.data);
    } else {
      await modulo.check();
    }
  }

  // --- Protected ---
  console.log(`\n${C.bold}PROTECCIÓN DE RUTAS${C.reset}`);
  const sinSesion = await fetch(`${BASE_URL}/api/productos`, { redirect: "manual" });
  if (sinSesion.status === 401) ok("las APIs responden 401 sin sesión");
  else fail("las APIs no responden 401 sin sesión", `status ${sinSesion.status}`);

  const paginaSinSesion = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
  if ([302, 307].includes(paginaSinSesion.status)) {
    ok("las páginas redirigen a /login sin sesión");
  } else {
    fail("las páginas no redirigen sin sesión", `status ${paginaSinSesion.status}`);
  }

  console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}Correctas: ${passed}${C.reset}   ${failed > 0 ? C.red : C.gray}Fallidas: ${failed}${C.reset}`);
  if (failed > 0) {
    console.log(`\n  ${C.red}Fallos:${C.reset}`);
    fallos.forEach((f) => console.log(`   - ${f}`));
  }
  console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
