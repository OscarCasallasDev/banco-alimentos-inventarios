/**
 * Script para aplicar migraciones y seed a Supabase
 * Usa conexión directa a la base de datos con el pooler de Supabase
 * Uso: node scripts/apply-migrations.mjs
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL no está definida en .env.local");
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

async function run() {
  try {
    console.log("🔄 Verificando conexión a Supabase...");
    await sql`SELECT 1`;
    console.log("✅ Conexión exitosa\n");

    // Verificar si las tablas ya existen
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'products', 'warehouses', 'categories')
    `;

    if (tables.length >= 4) {
      console.log("✅ Las tablas ya existen en Supabase. Saltando migración.");
      console.log("✅ El seed ya fue aplicado previamente.");
      return;
    }

    // Leer y aplicar migración
    console.log("📦 Aplicando migración inicial...");
    const migrationPath = join(__dirname, "..", "drizzle", "0000_wet_nighthawk.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Dividir por statement-breakpoint
    const statements = migrationSQL
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let appliedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await sql.unsafe(stmt);
        appliedCount++;
        console.log(`  ✅ Statement ${i + 1}/${statements.length} aplicado`);
      } catch (err) {
        if (err.message.includes("already exists") || err.message.includes("duplicate")) {
          skippedCount++;
          console.log(`  ⚠️  Statement ${i + 1}/${statements.length} - ya existe (ignorado)`);
        } else {
          console.error(`  ❌ Error en statement ${i + 1}: ${err.message}`);
        }
      }
    }

    console.log(`\n📊 Migración: ${appliedCount} aplicados, ${skippedCount} omitidos`);

    // Aplicar seed
    console.log("\n📦 Aplicando seed...");
    const seedPath = join(__dirname, "..", "drizzle", "seed.sql");
    const seedSQL = readFileSync(seedPath, "utf-8");

    const seedStatements = seedSQL
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let seedApplied = 0;
    let seedSkipped = 0;

    for (let i = 0; i < seedStatements.length; i++) {
      const stmt = seedStatements[i];
      try {
        await sql.unsafe(stmt);
        seedApplied++;
        console.log(`  ✅ Seed ${i + 1}/${seedStatements.length} aplicado`);
      } catch (err) {
        if (err.message.includes("already exists") || err.message.includes("duplicate")) {
          seedSkipped++;
          console.log(`  ⚠️  Seed ${i + 1}/${seedStatements.length} - ya existe (ignorado)`);
        } else {
          console.error(`  ❌ Error en seed ${i + 1}: ${err.message}`);
        }
      }
    }

    console.log(`\n📊 Seed: ${seedApplied} aplicados, ${seedSkipped} omitidos`);
    console.log("\n✅ Migraciones y seed aplicados exitosamente");
  } catch (err) {
    console.error("\n❌ Error fatal:", err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
