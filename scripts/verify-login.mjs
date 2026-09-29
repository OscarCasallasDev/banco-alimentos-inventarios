/**
 * Script para verificar el login del usuario admin
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

async function verifyLogin() {
  console.log("=== Verificación de Login ===\n");

  // 1. Verificar si el usuario admin existe
  console.log("1. Verificando usuario admin...");
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
    .eq("username", "admin");

  if (usersError) {
    console.error("Error consultando usuario:", usersError.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log("❌ Usuario 'admin' NO encontrado en la base de datos");
    console.log("   Es necesario ejecutar el seed de datos");
    return;
  }

  const user = users[0];
  console.log("✓ Usuario 'admin' encontrado");
  console.log(`   ID: ${user.id}`);
  console.log(`   Nombre: ${user.firstName} ${user.lastName}`);
  console.log(`   Rol: ${user.role}`);
  console.log(`   Estado: ${user.status}`);
  console.log(`   Hash almacenado: ${user.passwordHash.substring(0, 20)}...`);

  // 2. Verificar el hash de la contraseña
  console.log("\n2. Verificando contraseña...");
  const inputHash = hashPassword("admin123");
  console.log(`   Hash de 'admin123': ${inputHash.substring(0, 20)}...`);
  console.log(`   Hash almacenado:      ${user.passwordHash.substring(0, 20)}...`);

  if (inputHash === user.passwordHash) {
    console.log("✓ Contraseña correcta");
  } else {
    console.log("❌ Contraseña INCORRECTA");
    console.log("   El hash no coincide");
  }

  // 3. Verificar estado del usuario
  console.log("\n3. Verificando estado del usuario...");
  if (user.status === "ACTIVE") {
    console.log("✓ Usuario activo");
  } else {
    console.log(`❌ Usuario con estado: ${user.status}`);
  }

  console.log("\n=== Resumen ===");
  if (inputHash === user.passwordHash && user.status === "ACTIVE") {
    console.log("✓ El login debería funcionar correctamente");
  } else {
    console.log("❌ Hay problemas con el login que deben corregirse");
  }
}

verifyLogin().catch(console.error);
