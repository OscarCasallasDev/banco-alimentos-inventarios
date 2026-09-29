/**
 * Script para verificar la conexión a Supabase usando el cliente de Supabase
 * Este método usa la API REST y no necesita la contraseña de la base de datos
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkSupabase() {
  console.log("=== Verificación de Supabase ===\n");

  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Key: ${SUPABASE_PUBLISHABLE_KEY.substring(0, 20)}...\n`);

  try {
    // 1. Verificar conexión
    console.log("1. Verificando conexión...");
    const { data, error } = await supabase.from("users").select("id").limit(1);

    if (error) {
      console.error("❌ Error de conexión:");
      console.error(`   ${error.message}`);
      console.error("\nPosibles causas:");
      console.error("1. El proyecto de Supabase está pausado");
      console.error("2. La URL o la clave son incorrectas");
      console.error("3. Problemas de red");
      return;
    }

    console.log("✓ Conexión exitosa!\n");

    // 2. Verificar tablas
    console.log("2. Verificando tablas...");
    const tables = [
      'users', 'roles', 'categories', 'products', 'warehouses',
      'inventory', 'inventory_movements', 'entries', 'entry_items',
      'orders', 'order_items', 'invoices', 'invoice_items',
      'receipts', 'dispatches', 'dispatch_items', 'audits',
      'audit_items', 'audit_logs', 'documents'
    ];

    const results = await Promise.all(
      tables.map(async (table) => {
        const { error } = await supabase.from(table).select("*").limit(1);
        return { table, exists: !error, error: error?.message };
      })
    );

    const existingTables = results.filter((r) => r.exists);
    const missingTables = results.filter((r) => !r.exists);

    console.log(`✓ Tablas existentes: ${existingTables.length}`);
    existingTables.forEach((t) => {
      console.log(`  - ${t.table}`);
    });

    if (missingTables.length > 0) {
      console.log(`\n⚠️  Tablas faltantes: ${missingTables.length}`);
      missingTables.forEach((t) => {
        console.log(`  - ${t.table}: ${t.error}`);
      });
    }
    console.log();

    // 3. Verificar usuarios
    console.log("3. Verificando usuarios...");
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, username, email, role, status")
      .limit(10);

    if (usersError) {
      console.log(`⚠️  Error obteniendo usuarios: ${usersError.message}\n`);
    } else if (users.length === 0) {
      console.log("⚠️  No hay usuarios en la base de datos\n");
    } else {
      console.log(`✓ Usuarios encontrados: ${users.length}`);
      users.forEach((u) => {
        console.log(`  - ${u.username} (${u.email}) - Rol: ${u.role} - Estado: ${u.status}`);
      });
    }
    console.log();

    // 4. Verificar productos
    console.log("4. Verificando productos...");
    const { count: productCount, error: productError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    if (productError) {
      console.log(`⚠️  Error: ${productError.message}\n`);
    } else {
      console.log(`✓ Productos: ${productCount}\n`);
    }

    // 5. Verificar bodegas
    console.log("5. Verificando bodegas...");
    const { count: warehouseCount, error: warehouseError } = await supabase
      .from("warehouses")
      .select("*", { count: "exact", head: true });

    if (warehouseError) {
      console.log(`⚠️  Error: ${warehouseError.message}\n`);
    } else {
      console.log(`✓ Bodegas: ${warehouseCount}\n`);
    }

    // 6. Verificar inventario
    console.log("6. Verificando inventario...");
    const { count: inventoryCount, error: inventoryError } = await supabase
      .from("inventory")
      .select("*", { count: "exact", head: true });

    if (inventoryError) {
      console.log(`⚠️  Error: ${inventoryError.message}\n`);
    } else {
      console.log(`✓ Registros de inventario: ${inventoryCount}\n`);
    }

    console.log("=== Verificación Completada ===");

  } catch (err) {
    console.error("Error inesperado:", err.message);
  }
}

checkSupabase().catch(console.error);
