/**
 * Verifica la conexión a Supabase y deja la URL que funciona en .env.local
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:  npm run db:check
 *
 * Prueba, en orden:
 *   1. La URL configurada en DATABASE_URL.
 *   2. El pooler de Supabase en varias regiones (sesión 5432 y transacción 6543).
 *
 * Escribe en .env.local la primera URL que responda, de modo que la
 * aplicación y Drizzle usen siempre la misma conexión.
 */

import postgres from "postgres";
import {
  buildConnectionCandidates,
  colorize,
  extractPassword,
  extractProjectRef,
  logFail,
  logInfo,
  logOk,
  logWarn,
  readEnvFile,
  writeEnvValue,
} from "./lib/env.mjs";

async function testConnection(url) {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 12,
    idle_timeout: 2,
    prepare: false,
  });

  try {
    const result = await sql`select current_database() as db, current_user as usr`;
    return { ok: true, database: result[0].db, user: result[0].usr };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function main() {
  const env = readEnvFile();
  const databaseUrl = env.DATABASE_URL;

  console.log(colorize("\n=== Conexión a Supabase ===\n", "cyan"));

  if (!databaseUrl) {
    logFail("DATABASE_URL no está definida en .env.local");
    process.exit(1);
  }

  const projectRef = extractProjectRef(databaseUrl);
  const password = extractPassword(databaseUrl);

  console.log(`Proyecto (ref): ${projectRef ?? "no se pudo determinar"}`);
  console.log(
    `Contraseña:       ${password ? "configurada" : "no se pudo determinar"}`
  );
  console.log("");

  const candidates = buildConnectionCandidates(databaseUrl);
  const working = [];

  for (const candidate of candidates) {
    process.stdout.write(`  ${candidate.label} ... `);
    const result = await testConnection(candidate.url);

    if (result.ok) {
      logOk(`OK (base "${result.database}")`);
      working.push(candidate);
    } else {
      logFail(result.error.split("\n")[0]);
    }
  }

  console.log("");

  if (working.length === 0) {
    logFail("Ninguna URL de conexión respondió.");
    console.log("");
    console.log("  Causas probables:");
    console.log(
      "   1. El proyecto de Supabase no existe o fue eliminado (el project_ref no resuelve en DNS)."
    );
    console.log(
      "   2. La contraseña de la base de datos no corresponde a ese proyecto."
    );
    console.log(
      "   3. El proyecto está pausado o la red bloquea el acceso a Supabase."
    );
    console.log("");
    console.log(
      "  Verifica el project_ref en: Supabase Dashboard → Project Settings → API"
    );
    process.exit(1);
  }

  const best = working[0];
  if (best.url !== databaseUrl) {
    writeEnvValue("DATABASE_URL", best.url);
    logOk(`DATABASE_URL actualizada en .env.local → ${best.label}`);
  } else {
    logOk("DATABASE_URL actual ya funciona.");
  }

  logInfo(`Conexiones disponibles: ${working.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
