/**
 * Script de verificación completa del sistema
 * Prueba todas las funcionalidades del sistema
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SECRET_KEY = "sb_secret_-ebihhyQCEqv6bnJXwA1AA__ASEPrmi";

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

async function verify() {
  console.log("=== Verificación Completa del Sistema ===\n");

  let passed = 0;
  let failed = 0;

  // 1. Verificar conexión a Supabase
  console.log("1. Verificando conexión a Supabase...");
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) {
      console.log("❌ Error de conexión:", error.message);
      failed++;
    } else {
      console.log("✓ Conexión exitosa");
      passed++;
    }
  } catch (err) {
    console.log("❌ Error de conexión:", err.message);
    failed++;
  }
  console.log();

  // 2. Verificar usuario admin
  console.log("2. Verificando usuario admin...");
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, email, role, status")
      .eq("username", "admin");

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else if (users.length === 0) {
      console.log("❌ Usuario admin no encontrado");
      failed++;
    } else {
      const user = users[0];
      console.log("✓ Usuario admin encontrado:");
      console.log(`  - Username: ${user.username}`);
      console.log(`  - Email: ${user.email}`);
      console.log(`  - Rol: ${user.role}`);
      console.log(`  - Estado: ${user.status}`);
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 3. Verificar contraseña del admin
  console.log("3. Verificando contraseña del admin...");
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("password_hash")
      .eq("username", "admin");

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      const storedHash = users[0].password_hash;
      const inputHash = hashPassword("admin123");

      if (storedHash === inputHash) {
        console.log("✓ Contraseña verificada correctamente");
        passed++;
      } else {
        console.log("❌ Contraseña incorrecta");
        failed++;
      }
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 4. Verificar categorías
  console.log("4. Verificando categorías...");
  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("id, name")
      .limit(10);

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      console.log(`✓ Categorías encontradas: ${categories.length}`);
      categories.forEach((cat) => {
        console.log(`  - ${cat.name}`);
      });
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 5. Verificar bodegas
  console.log("5. Verificando bodegas...");
  try {
    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("id, code, name, type")
      .limit(10);

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      console.log(`✓ Bodegas encontradas: ${warehouses.length}`);
      warehouses.forEach((wh) => {
        console.log(`  - ${wh.code}: ${wh.name} (${wh.type})`);
      });
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 6. Verificar productos
  console.log("6. Verificando productos...");
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, code, name, status")
      .limit(10);

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      console.log(`✓ Productos encontrados: ${products.length}`);
      products.forEach((prod) => {
        console.log(`  - ${prod.code}: ${prod.name} (${prod.status})`);
      });
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 7. Verificar inventario
  console.log("7. Verificando inventario...");
  try {
    const { data: inventory, error } = await supabase
      .from("inventory")
      .select("id, product_id, warehouse_id, quantity")
      .limit(10);

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      console.log(`✓ Registros de inventario: ${inventory.length}`);
      inventory.forEach((inv) => {
        console.log(`  - Producto: ${inv.product_id}, Bodega: ${inv.warehouse_id}, Cantidad: ${inv.quantity}`);
      });
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 8. Verificar movimientos
  console.log("8. Verificando movimientos...");
  try {
    const { data: movements, error } = await supabase
      .from("inventory_movements")
      .select("id, type, quantity")
      .limit(10);

    if (error) {
      console.log("❌ Error:", error.message);
      failed++;
    } else {
      console.log(`✓ Movimientos encontrados: ${movements.length}`);
      movements.forEach((mov) => {
        console.log(`  - Tipo: ${mov.type}, Cantidad: ${mov.quantity}`);
      });
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 9. Prueba de inserción
  console.log("9. Prueba de inserción...");
  try {
    const { data: testUser, error } = await supabase
      .from("users")
      .insert({
        username: "test_verification",
        email: "test@verification.com",
        password_hash: hashPassword("test123"),
        first_name: "Test",
        last_name: "Verification",
        role: "RECEPCION",
        status: "ACTIVE",
      })
      .select()
      .single();

    if (error) {
      console.log("❌ Error en inserción:", error.message);
      failed++;
    } else {
      console.log("✓ Inserción exitosa");
      console.log(`  - Usuario creado: ${testUser.username}`);

      // Eliminar el usuario de prueba
      await supabase.from("users").delete().eq("id", testUser.id);
      console.log("✓ Usuario de prueba eliminado");
      passed++;
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // 10. Prueba de actualización
  console.log("10. Prueba de actualización...");
  try {
    const { data: testUser, error: insertError } = await supabase
      .from("users")
      .insert({
        username: "test_update",
        email: "test@update.com",
        password_hash: hashPassword("test123"),
        first_name: "Test",
        last_name: "Update",
        role: "RECEPCION",
        status: "ACTIVE",
      })
      .select()
      .single();

    if (insertError) {
      console.log("❌ Error en inserción:", insertError.message);
      failed++;
    } else {
      const { error: updateError } = await supabase
        .from("users")
        .update({ first_name: "Updated" })
        .eq("id", testUser.id);

      if (updateError) {
        console.log("❌ Error en actualización:", updateError.message);
        failed++;
      } else {
        console.log("✓ Actualización exitosa");

        // Eliminar el usuario de prueba
        await supabase.from("users").delete().eq("id", testUser.id);
        console.log("✓ Usuario de prueba eliminado");
        passed++;
      }
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
    failed++;
  }
  console.log();

  // Resumen final
  console.log("=== Resumen de Verificación ===");
  console.log(`✓ Pruebas pasadas: ${passed}`);
  console.log(`❌ Pruebas fallidas: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\n🎉 ¡Todas las pruebas pasaron! El sistema está funcionando correctamente.");
  } else {
    console.log("\n⚠️  Algunas pruebas fallaron. Revisa los errores anteriores.");
  }
}

verify().catch(console.error);
