/**
 * Prepara la base de datos de Supabase
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:  npm run db:setup
 *
 * Pasos:
 *   1. Verifica la conexión y deja la URL que funciona en .env.local.
 *   2. Aplica las migraciones de `drizzle/*.sql` en orden.
 *   3. Carga los datos iniciales (seed) si la base está vacía.
 */

import fs from "node:fs";
import postgres from "postgres";
import {
  buildConnectionCandidates,
  colorize,
  listMigrations,
  logFail,
  logInfo,
  logOk,
  logWarn,
  readEnvFile,
  writeEnvValue,
} from "./lib/env.mjs";

async function openDatabase(url) {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
    prepare: false,
    onnotice: () => {},
  });
  await sql`select 1`;
  return sql;
}

async function resolveConnection(databaseUrl) {
  for (const candidate of buildConnectionCandidates(databaseUrl)) {
    const sql = postgres(candidate.url, {
      max: 1,
      connect_timeout: 12,
      idle_timeout: 2,
      prepare: false,
    });

    try {
      await sql`select 1`;
      await sql.end({ timeout: 1 }).catch(() => {});
      return candidate;
    } catch {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }

  return null;
}

async function ensureMigrationsTable(sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamp NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Comprobación por migración para detectar si ya fue aplicada.
 * Permite que el script sea idempotente incluso sobre bases creadas
 * manualmente (por ejemplo, con el SQL Editor del dashboard de Supabase).
 */
const MIGRATION_CHECKS = {
  "0000_wet_nighthawk.sql": `select to_regclass('public.users') is not null as done`,
  "0001_update_users_username.sql": `select to_regclass('public.users') is not null as done`,
  "0002_add_email_to_users.sql": `
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'email'
    ) as done`,
  "0003_add_warehouse_audit_actions.sql": `
    select exists (
      select 1 from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'audit_log_action' and e.enumlabel = 'WAREHOUSE_CREATE'
    ) as done`,
  "0004_modulo_entradas.sql": `
    select to_regclass('public.entry_items') is not null as done`,
  "0005_lotes_trazabilidad.sql": `
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lots' and column_name = 'quantity_available'
    ) as done`,
  "0006_lotes_apertura.sql": `
    select to_regclass('public.v_lot_stock') is not null as done`,
  "0007_lotes_operacion.sql": `
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lots' and column_name = 'unit_kind'
    ) and to_regclass('public.system_settings') is not null as done`,
  "0008_secuencias_documentales.sql": `
    select to_regclass('public.document_sequences') is not null as done`,
  "0009_salidas_siigo_import.sql": `
    select to_regclass('public.siigo_balances') is not null
       and to_regclass('public.salidas') is not null
       and to_regclass('public.siigo_import_runs') is not null as done`,
  "0010_flags_programas.sql": `
    select to_regclass('public.programs') is not null
       and to_regclass('public.feature_flags') is not null as done`,
  "0011_destinos_orden_pedido.sql": `
    select to_regclass('public.destinations') is not null
       and to_regclass('public.siigo_locations') is not null
       and to_regclass('public.siigo_resumen_movements') is not null as done`,
  "0012_consolidacion_vencimientos.sql": `
    select to_regclass('public.v_stock_consolidated') is not null
       and to_regclass('public.vencimiento_lotes') is not null as done`,
  "0013_group_key_conciliacion.sql": `
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'siigo_reservations'
        and column_name = 'group_key'
    ) as done`,
  "0014_rendimiento_existencias.sql": `
    select to_regclass('public.mv_stock_consolidated') is not null as done`,
  "0015_stock_por_bodega.sql": `
    select to_regclass('public.mv_stock_by_bodega') is not null as done`,
};

async function isAlreadyApplied(sql, file) {
  const check = MIGRATION_CHECKS[file];
  if (!check) return false;

  const [row] = await sql.unsafe(check);
  return Boolean(row?.done);
}

async function applyMigrations(sql) {
  const migrations = listMigrations();
  const applied = new Set(
    (await sql`select name from "_migrations"`).map((row) => row.name)
  );

  for (const file of migrations) {
    if (applied.has(file) || (await isAlreadyApplied(sql, file))) {
      if (!applied.has(file)) {
        await sql`insert into "_migrations" (name) values (${file}) on conflict do nothing`;
      }
      logInfo(`Migración ya aplicada: ${file}`);
      continue;
    }

    const content = fs.readFileSync(`drizzle/${file}`, "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    try {
      for (const statement of statements) {
        await sql.unsafe(statement);
      }
      await sql`insert into "_migrations" (name) values (${file}) on conflict do nothing`;
      logOk(`Migración aplicada: ${file}`);
    } catch (error) {
      logFail(`Migración fallida: ${file}`);
      console.error(`   ${error.message}`);
      throw error;
    }
  }

  return migrations.length;
}

async function applySeed(sql) {
  const seedFile = "drizzle/seed.sql";

  if (!fs.existsSync(seedFile)) {
    logWarn("No se encontró drizzle/seed.sql");
    return false;
  }

  const [existing] = await sql`select count(*)::int as count from users`;

  if (existing.count > 0) {
    logInfo(
      `La base ya tiene ${existing.count} usuario(s): se omite el seed.`
    );
    return false;
  }

  const content = fs.readFileSync(seedFile, "utf8");
  await sql.unsafe(content);
  logOk("Datos iniciales cargados (seed)");

  return true;
}

async function resetDatabase(sql) {
  logWarn("Reiniciando la base de datos (se borran todos los datos)...");

  // Un solo comando atómico: evita bloqueos por tablas dependientes.
  await sql.unsafe(`SET lock_timeout = '15s'`);
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await sql.unsafe(`CREATE SCHEMA public`);
  await sql.unsafe(`GRANT ALL ON SCHEMA public TO postgres`);
  await sql.unsafe(`GRANT ALL ON SCHEMA public TO public`);

  logOk("Esquema public recreado");
}

async function main() {
  console.log(colorize("\n=== Preparación de la base de datos ===\n", "cyan"));

  const shouldReset = process.argv.includes("--reset");
  const env = readEnvFile();

  if (!env.DATABASE_URL) {
    logFail("DATABASE_URL no está definida en .env.local");
    process.exit(1);
  }

  const connection = await resolveConnection(env.DATABASE_URL);

  if (!connection) {
    logFail("No se pudo conectar con la base de datos.");
    console.log("");
    console.log("  Revisa el project_ref y la contraseña en .env.local.");
    console.log(
      "  El project_ref se ve en: Supabase Dashboard → Project Settings → API"
    );
    process.exit(1);
  }

  logOk(`Conexión establecida (${connection.label})`);

  if (connection.url !== env.DATABASE_URL) {
    writeEnvValue("DATABASE_URL", connection.url);
    logInfo("DATABASE_URL actualizada en .env.local");
  }

  const sql = await openDatabase(connection.url);

  try {
    if (shouldReset) {
      await resetDatabase(sql);
    }

    await ensureMigrationsTable(sql);

    const count = await applyMigrations(sql);
    logInfo(`${count} migración(es) procesada(s)`);

    await applySeed(sql);

    const [tables] = await sql`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public'
    `;

    const [users] = await sql`select count(*)::int as count from users`;

    console.log("");
    logOk(`Base de datos lista: ${tables.count} tablas, ${users.count} usuario(s)`);
    console.log("");
    console.log("  Usuario de acceso:  admin");
    console.log("  Contraseña:         admin123");
    console.log("");
  } catch (error) {
    console.error("");
    logFail(`Error durante la preparación: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
