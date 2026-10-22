/**
 * Verificación de la interfaz por HTTP
 * Comprueba que cada página protegida se renderiza sin errores.
 */

const BASE_URL = process.argv[2] ?? "http://localhost:3000";

/**
 * Las páginas client-side muestran un spinner durante la carga inicial,
 * por lo que el HTML del servidor solo contiene el esqueleto.
 * El contenido con datos se verifica en la prueba end-to-end de la API.
 */
const pages = [
  { path: "/dashboard", expect: ["animate-spin"], note: "carga por API" },
  { path: "/entradas", expect: ["Nueva Entrada", "Entradas", "Formato"] },
  { path: "/pedidos", expect: ["Pedidos", "Destino", "Nuevo Pedido"] },
  { path: "/facturas", expect: ["Facturas", "Pedido", "Nueva Factura"] },
  { path: "/recibos", expect: ["Recibos", "Factura"] },
  { path: "/salidas", expect: ["Despachos", "Recibo"] },
  { path: "/auditoria", expect: ["Auditor", "Responsable"] },
  { path: "/inventario", expect: ["Inventario", "Cantidad", "Bodega"] },
  { path: "/productos", expect: ["Productos", "Nuevo Producto", "Stock Mín."] },
  { path: "/bodegas", expect: ["Bodegas", "Nueva Bodega"] },
  { path: "/reportes", expect: ["animate-spin"], note: "carga por API" },
  { path: "/usuarios", expect: ["Usuarios", "Nuevo Usuario", "Rol"] },
  { path: "/integracion-siigo", expect: ["Integración Siigo", "Formatos de exportación"] },
  { path: "/configuracion", expect: ["Configuración", "Base de Datos", "Host"] },
];

let cookie = "";
let passed = 0;
let failed = 0;

const login = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123" }),
});
cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

if (!cookie) {
  console.log("No se pudo iniciar sesión");
  process.exit(1);
}

console.log(`\n=== Verificación de interfaz en ${BASE_URL} ===\n`);

for (const page of pages) {
  const response = await fetch(`${BASE_URL}${page.path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });

  const html = await response.text();

  if (response.status !== 200) {
    console.log(`  ✗ ${page.path} → HTTP ${response.status}`);
    failed += 1;
    continue;
  }

  const missing = page.expect.filter((text) => !html.includes(text));

  if (missing.length > 0) {
    console.log(`  ✗ ${page.path} → falta contenido: ${missing.join(", ")}`);
    failed += 1;
    continue;
  }

  if (html.includes("Application error") || html.includes("__next_error__")) {
    console.log(`  ✗ ${page.path} → error de renderizado`);
    failed += 1;
    continue;
  }

  console.log(`  ✓ ${page.path} (${html.length} bytes)${page.note ? ` · ${page.note}` : ""}`);
  passed += 1;
}

// Página de login sin sesión → debe redirigir
const protectedResponse = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
console.log(
  `  ${protectedResponse.status === 307 || protectedResponse.status === 302 ? "✓" : "✗"} /dashboard sin sesión redirige (${protectedResponse.status})`
);
if (protectedResponse.status === 307 || protectedResponse.status === 302) passed += 1;
else failed += 1;

console.log(`\n  Correctas: ${passed}   Fallidas: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
