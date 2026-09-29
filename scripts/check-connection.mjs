/**
 * Script para verificar la conexión a Supabase
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SERVICE_KEY = "sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkConnection() {
  console.log("=== Verificando Conexión a Supabase ===\n");

  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Key: ${SUPABASE_SERVICE_KEY.substring(0, 20)}...\n`);

  try {
    // Intentar hacer una consulta simple
    console.log("Intentando conectar...");
    const { data, error } = await supabase
      .from("users")
      .select("id, username, email")
      .limit(5);

    if (error) {
      console.error("Error:", error.message);
      console.log("\nPosibles causas:");
      console.log("1. El proyecto de Supabase está pausado");
      console.log("2. La tabla 'users' no existe");
      console.log("3. Problemas de red");
      return;
    }

    console.log("✓ Conexión exitosa!\n");
    console.log(`Usuarios encontrados: ${data.length}`);
    data.forEach((u) => {
      console.log(`  - ${u.username}: ${u.email || 'sin email'}`);
    });

  } catch (err) {
    console.error("Error de conexión:", err.message);
    console.log("\nPosibles causas:");
    console.log("1. El proyecto de Supabase está pausado");
    console.log("2. Problemas de red");
    console.log("3. Credenciales incorrectas");
  }
}

checkConnection().catch(console.error);
