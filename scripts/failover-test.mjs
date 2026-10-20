/**
 * Prueba del mecanismo de conexión y failover
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Evalúa el comportamiento que debe tener la aplicación con la
 * configuración de `.env.local` ACTUAL:
 *
 *   - Si alguna conexión funciona → la aplicación debe servir con normalidad
 *     (incluso si la principal falla y entra el failover).
 *   - Si ninguna conexión funciona → la aplicación debe responder con un
 *     mensaje accionable y la API con 503 DATABASE_UNAVAILABLE, nunca con
 *     un "Runtime Error" sin contexto.
 *
 * Uso:  node scripts/failover-test.mjs [url]
 *
 * Para forzar cada escenario, edita `.env.local`:
 *   · Principal rota, con respaldo  → debe funcionar igual
 *   · Principal y respaldo rotos    → debe avisar con claridad
 */

import { createHmac } from "node:crypto";
import { readEnvFile } from "./lib/env.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
let failed = 0;

function assert(condition, message, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${message}${detail ? ` · ${detail}` : ""}`);
  }
}

/**
 * Genera una cookie de sesión válida sin tocar la base de datos.
 * Permite evaluar el comportamiento aunque el login falle.
 */
function buildSessionCookie(userId) {
  const secret = readEnvFile().SESSION_SECRET;
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `session_token=${Buffer.from(payload).toString("base64url")}.${signature}`;
}

console.log(`\n=== Comportamiento de la conexión en ${BASE} ===\n`);

// --- 1. ¿La aplicación responde con datos? ---
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123" }),
});

const cookie =
  login.headers.get("set-cookie")?.split(";")[0] ?? buildSessionCookie("00000000-0000-0000-0000-000000000000");

console.log(`  login            : HTTP ${login.status}`);

const inventario = await fetch(`${BASE}/api/inventario`, {
  headers: { Cookie: cookie },
});
const inventarioBody = await inventario.json();
const registros = inventarioBody?.data?.length ?? 0;

console.log(`  inventario       : HTTP ${inventario.status} (${registros} registros)`);

if (login.status === 200 && registros > 0) {
  console.log("\n  La conexión funciona. La aplicación sirve con normalidad.");
  assert(true, "login e inventario responden con datos reales");
} else {
  console.log(
    "\n  Ninguna conexión responde. Debe avisar con claridad, no reventar."
  );

  const dashboard = await fetch(`${BASE}/dashboard`, { headers: { Cookie: cookie } });
  const html = await dashboard.text();

  assert(
    html.includes("db:check"),
    "la página muestra el mensaje accionable (npm run db:check)",
    `HTTP ${dashboard.status}`
  );

  const api = await fetch(`${BASE}/api/productos`, { headers: { Cookie: cookie } });
  const apiBody = await api.json();

  assert(
    api.status === 503 && apiBody?.error?.code === "DATABASE_UNAVAILABLE",
    "la API responde 503 con el código DATABASE_UNAVAILABLE",
    `HTTP ${api.status}`
  );
}

console.log(`\n  Correctas: ${passed}   Fallidas: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
