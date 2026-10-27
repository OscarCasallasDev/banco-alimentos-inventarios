/**
 * Diagnóstico de latencia de la base de datos
 * Aísla el costo de: handshake TLS, latencia de red, queries y el pool.
 */

import postgres from "postgres";
import { readEnvFile } from "./lib/env.mjs";

const env = readEnvFile();

const URLS = {
  "pooler sesión (5432)": env.DATABASE_URL,
  "pooler transacción (6543)": env.DATABASE_FALLBACK_URLS?.split(",")[0]?.trim(),
};

async function measure(label, url, options = {}) {
  if (!url) {
    console.log(`\n${label}: no configurada`);
    return;
  }

  const sql = postgres(url, {
    max: options.max ?? 5,
    idle_timeout: options.idle_timeout ?? 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

  try {
    // 1. Conexión nueva (cold)
    const coldStart = Date.now();
    await sql`select 1`;
    const cold = Date.now() - coldStart;

    // 2. Query simple con conexión ya establecida
    const warm = [];
    for (let i = 0; i < 5; i += 1) {
      const t = Date.now();
      await sql`select 1`;
      warm.push(Date.now() - t);
    }

    // 3. Query real del catálogo
    const query = [];
    for (let i = 0; i < 5; i += 1) {
      const t = Date.now();
      await sql`select code, name from products order by code limit 20`;
      query.push(Date.now() - t);
    }

    // 4. Query con join (inventario)
    const join = [];
    for (let i = 0; i < 5; i += 1) {
      const t = Date.now();
      await sql`
        select i.id, p.code, p.name, w.code as bodega, i.quantity
        from inventory i
        join products p on p.id = i.product_id
        join warehouses w on w.id = i.warehouse_id
      `;
      join.push(Date.now() - t);
    }

    const avg = (values) =>
      Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    console.log(`\n${label}`);
    console.log(`  conexión nueva (TLS)   : ${cold} ms`);
    console.log(`  select 1 (mediana)     : ${avg(warm)} ms`);
    console.log(`  consulta catálogo      : ${avg(query)} ms`);
    console.log(`  consulta con join      : ${avg(join)} ms`);
  } catch (error) {
    console.log(`\n${label}: ERROR ${error.message}`);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

console.log("\n=== LATENCIA DE LA BASE DE DATOS ===");

await measure("A. Configuración actual", env.DATABASE_URL);

for (const [label, url] of Object.entries(URLS)) {
  if (label === "pooler sesión (5432)") continue;
  await measure(`B. ${label}`, url);
}

// Pool grande + conexiones que no se cierran
await measure("C. Pool amplio y conexiones persistentes", env.DATABASE_URL, {
  max: 20,
  idle_timeout: 120,
});

console.log("\n=== RESUMEN ===");
console.log("  Si 'select 1' es de miles de ms, el costo está en la red/handshake.");
console.log("  Si es de pocos ms, el costo está en el framework o en el pool.");
