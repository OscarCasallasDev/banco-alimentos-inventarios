/**
 * Script para ejecutar la migración 0002 en Supabase
 * Agrega el campo email a la tabla users
 * Usa el cliente de Supabase con la función rpc
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SERVICE_KEY = "sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log("=== Ejecutando Migración 0002 ===\n");

  // SQL para agregar el campo email
  const migrationSQL = `
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
    UPDATE "users" SET "email" = username || '@bancoalimentos.org' WHERE "email" IS NULL;
    ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
  `;

  console.log("Ejecutando SQL de migración...\n");

  // Usar rpc para ejecutar el SQL
  const { data, error } = await supabase.rpc("exec_sql", { sql: migrationSQL });

  if (error) {
    console.error("Error con rpc:", error.message);
    console.log("\n⚠️  No se pudo ejecutar automáticamente.");
    console.log("Por favor, ejecuta el siguiente SQL en el Supabase SQL Editor:\n");
    console.log(migrationSQL);
    process.exit(1);
  }

  console.log("✓ Migración ejecutada exitosamente\n");

  // Verificar que el campo email existe
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, username, email")
    .limit(5);

  if (usersError) {
    console.error("Error verificando usuarios:", usersError.message);
    return;
  }

  console.log(`✓ Usuarios en la base de datos: ${users.length}`);
  users.forEach((u) => {
    console.log(`  - ${u.username}: ${u.email}`);
  });
}

runMigration().catch(console.error);
