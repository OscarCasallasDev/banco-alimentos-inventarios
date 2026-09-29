/**
 * Script para insertar el usuario admin en Supabase usando el cliente de Supabase
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SERVICE_KEY = "sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

async function setupAdmin() {
  console.log("=== Configuración de usuario admin ===\n");

  // Primero verificar si ya existe
  const { data: existingUsers } = await supabase
    .from("users")
    .select("*")
    .eq("username", "admin");

  if (existingUsers && existingUsers.length > 0) {
    console.log("✓ Usuario admin ya existe");
    return;
  }

  const passwordHash = hashPassword("admin123");
  console.log(`Hash de 'admin123': ${passwordHash}\n`);

  // Insertar usando SQL directo a través de la API
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: `INSERT INTO users (username, password_hash, first_name, last_name, role, status)
          VALUES ('admin', '${passwordHash}', 'Admin', 'Sistema', 'SUPERADMIN', 'ACTIVE')
          ON CONFLICT (username) DO NOTHING
          RETURNING *;`,
  });

  if (error) {
    console.error("Error insertando usuario:", error.message);
    return;
  }

  console.log("✓ Usuario admin insertado correctamente");
  console.log(`  Username: admin`);
  console.log(`  Nombre: Admin Sistema`);
  console.log(`  Rol: SUPERADMIN`);
  console.log(`  Estado: ACTIVE`);
}

setupAdmin().catch(console.error);
