const base = "https://banco-alimentos-inventarios.vercel.app";
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123" }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];

console.log("=== LATENCIA SECUENCIAL (una peticion a la vez) ===");
for (const p of ["/api/dashboard","/api/productos","/api/vencimientos","/api/reportes","/api/existencias","/api/lotes"]) {
  const t0 = Date.now();
  const r = await fetch(`${base}${p}`, { headers: { Cookie: cookie } });
  console.log(`  ${p.padEnd(22)} ${r.status}  ${Date.now() - t0} ms  (${r.headers.get("content-length") ?? "?"} bytes)`);
}

console.log("\n=== RAFAGA MODERADA (8 concurrentes) ===");
const rutas = ["/api/dashboard","/api/productos","/api/inventario","/api/lotes","/api/existencias","/api/vencimientos","/api/reportes","/api/movimientos"];
const t0 = Date.now();
const res = await Promise.all(rutas.map(async p => {
  const t = Date.now();
  const r = await fetch(`${base}${p}`, { headers: { Cookie: cookie } });
  return `${p} -> ${r.status} en ${Date.now() - t} ms`;
}));
res.forEach(x => console.log("  " + x));
console.log(`  total: ${Date.now() - t0} ms`);
