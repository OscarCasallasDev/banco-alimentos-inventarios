/**
 * Script para ejecutar migraciones en Supabase
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración de Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: Las variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigrations() {
  console.log("Iniciando migraciones...\n");

  // Leer el archivo de migración
  const migrationPath = join(__dirname, "..", "drizzle", "0000_wet_nighthawk.sql");
  const migrationSQL = readFileSync(migrationPath, "utf-8");

  // Dividir en statements individuales
  const statements = migrationSQL
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Ejecutando ${statements.length} statements SQL...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      const { error } = await supabase.rpc("exec_sql", { sql: statement });

      if (error) {
        console.error(`Error en statement ${i + 1}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        console.log(`✓ Statement ${i + 1} ejecutado correctamente`);
      }
    } catch (err) {
      console.error(`Error en statement ${i + 1}:`, err);
      errorCount++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Exitosos: ${successCount}`);
  console.log(`Errores: ${errorCount}`);
  console.log(`Total: ${statements.length}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

runMigrations().catch(console.error);
