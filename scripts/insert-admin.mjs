/**
 * Script para insertar el usuario admin en Supabase
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

async function insertAdmin() {
  console.log("=== Insertando usuario admin ===\n");

  const passwordHash = hashPassword("admin123");
  console.log(`Hash de 'admin123': ${passwordHash}`);

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        username: "admin",
        password_hash: passwordHash,
        first_name: "Admin",
        last_name: "Sistema",
        role: "SUPERADMIN",
        status: "ACTIVE",
      },
    ])
    .select();

  if (error) {
    console.error("Error insertando usuario:", error.message);
    return;
  }

  console.log("✓ Usuario admin insertado correctamente");
  console.log(`  ID: ${data[0].id}`);
  console.log(`  Username: ${data[0].username}`);
  console.log(`  Nombre: ${data[0].firstName} ${data[0].lastName}`);
  console.log(`  Rol: ${data[0].role}`);
  console.log(`  Estado: ${data[0].status}`);
}

insertAdmin().catch(console.error);
