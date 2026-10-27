/**
 * Medición de tiempos de respuesta del sistema
 * Sistema de Gestión, Trazabilidad y Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:  node scripts/benchmark.mjs [url]
 *
 * Mide por separado:
 *   • Tiempo de la API (petición HTTP directa).
 *   • Tiempo de la navegación (HTML de la página).
 *   • El desglose: tiempo de red + tiempo de base de datos.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

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

/** Ejecuta la función y devuelve los milisegundos que tardó. */
async function timed(fn) {
  const started = Date.now();
  const result = await fn();
  return { ms: Date.now() - started, result };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
  };
}

function row(label, ms) {
  const color = ms < 150 ? C.green : ms < 500 ? C.yellow : C.red;
  console.log(
    `  ${label.padEnd(34)} ${String(ms).padStart(6)} ms ${color}●${C.reset}`
  );
}

console.log(`\n${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
console.log(`${C.cyan}${C.bold}  MEDICIÓN DE TIEMPOS · ${BASE}${C.reset}`);
console.log(`${C.cyan}${C.bold}════════════════════════════════════════════════════════════${C.reset}`);

/* ------------------------------------------------------------------ */
/* 1. Login                                                            */
/* ------------------------------------------------------------------ */

console.log(`\n${C.bold}1. Inicio de sesión${C.reset}`);

const loginTimes = [];
for (let i = 0; i < 5; i += 1) {
  const { ms } = await timed(async () => {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123" }),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return response.status;
  });
  loginTimes.push(ms);
}

const loginStats = stats(loginTimes);
row("login (media de 5)", loginStats.avg);
row("  · primera vez", loginTimes[0]);
row("  · más rápida", loginStats.min);

/* ------------------------------------------------------------------ */
/* 2. API                                                              */
/* ------------------------------------------------------------------ */

console.log(`\n${C.bold}2. Tiempo de las APIs (media de 5 peticiones)${C.reset}`);

const apis = [
  ["/api/auth/me", "sesión (lectura en BD)"],
  ["/api/dashboard", "dashboard (9 consultas)"],
  ["/api/productos", "catálogo de productos"],
  ["/api/bodegas", "catálogo de bodegas"],
  ["/api/unidades", "catálogo de unidades"],
  ["/api/centros-costo", "catálogo de centros de costo"],
  ["/api/terceros", "terceros"],
  ["/api/inventario", "inventario (join de 3 tablas)"],
  ["/api/entradas", "entradas"],
  ["/api/pedidos", "pedidos"],
  ["/api/facturas", "facturas"],
  ["/api/recibos", "recibos"],
  ["/api/despachos", "despachos"],
  ["/api/auditoria", "auditorías"],
  ["/api/usuarios", "usuarios"],
  ["/api/reportes", "reportes (agregados)"],
];

const apiResults = [];

for (const [endpoint, label] of apis) {
  const times = [];
  for (let i = 0; i < 5; i += 1) {
    const { ms } = await timed(async () => {
      await fetch(`${BASE}${endpoint}`, { headers: { Cookie: cookie } });
    });
    times.push(ms);
  }
  const average = stats(times).avg;
  apiResults.push({ endpoint, label, average, max: stats(times).max });
  row(label.padEnd(30), average);
}

console.log(`\n${C.bold}  APIs más lentas:${C.reset}`);
apiResults
  .sort((a, b) => b.average - a.average)
  .slice(0, 5)
  .forEach((r) => console.log(`    ${r.endpoint.padEnd(24)} ${r.average} ms`));

/* ------------------------------------------------------------------ */
/* 3. Navegación (HTML)                                                */
/* ------------------------------------------------------------------ */

console.log(`\n${C.bold}3. Navegación entre módulos (HTML de la página)${C.reset}`);

const pages = [
  "/dashboard",
  "/entradas",
  "/pedidos",
  "/facturas",
  "/recibos",
  "/salidas",
  "/auditoria",
  "/inventario",
  "/productos",
  "/bodegas",
  "/reportes",
  "/usuarios",
  "/integracion-siigo",
  "/configuracion",
];

const pageResults = [];

for (const page of pages) {
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const { ms } = await timed(async () => {
      await fetch(`${BASE}${page}`, { headers: { Cookie: cookie } });
    });
    times.push(ms);
  }
  const average = stats(times).avg;
  pageResults.push({ page, average, first: times[0] });
  row(page.padEnd(30), average);
}

console.log(`\n${C.bold}  Páginas más lentas:${C.reset}`);
pageResults
  .sort((a, b) => b.average - a.average)
  .slice(0, 5)
  .forEach((r) => console.log(`    ${r.page.padEnd(24)} ${r.average} ms`));

/* ------------------------------------------------------------------ */
/* 4. Análisis                                                         */
/* ------------------------------------------------------------------ */

console.log(`\n${C.bold}4. Análisis${C.reset}`);

const slowestApi = apiResults.sort((a, b) => b.average - a.average)[0];
const slowestPage = pageResults.sort((a, b) => b.average - a.average)[0];

console.log(`  API más lenta        : ${slowestApi.endpoint} (${slowestApi.average} ms)`);
console.log(`  Página más lenta     : ${slowestPage.page} (${slowestPage.average} ms)`);
console.log(
  `  1er vs 2º intento    : ${pageResults[0].first} ms → ${pageResults[0].average} ms`
);

const totalApi = apiResults.reduce((sum, r) => sum + r.average, 0);
console.log(`  Suma de las 16 APIs  : ${totalApi} ms`);
console.log(
  `  Media por API        : ${Math.round(totalApi / apiResults.length)} ms`
);
