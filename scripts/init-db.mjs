/**
 * Script de inicialización de base de datos
 * Elimina tablas existentes y recrea todo desde ceso
 * Idempotente: puede ejecutarse múltiples veces
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

const sql = postgres(connectionString, { max: 1 });

async function run() {
  try {
    console.log("🔄 Conectando a la base de datos...");

    // Verificar conexión
    await sql`SELECT 1`;
    console.log("✅ Conexión exitosa");

    // Eliminar tablas existentes (en orden inverso por dependencias)
    console.log("\n🗑️  Limpiando tablas existentes...");
    await sql.unsafe(`
      DROP TABLE IF EXISTS audit_items CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS audits CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS dispatch_items CASCADE;
      DROP TABLE IF EXISTS dispatches CASCADE;
      DROP TABLE IF EXISTS receipt_items CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS invoice_items CASCADE;
      DROP TABLE IF EXISTS invoices CASCADE;
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS entry_items CASCADE;
      DROP TABLE IF EXISTS entries CASCADE;
      DROP TABLE IF EXISTS inventory_movements CASCADE;
      DROP TABLE IF EXISTS inventory CASCADE;
      DROP TABLE IF EXISTS warehouses CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS roles CASCADE;
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS user_status CASCADE;
      DROP TYPE IF EXISTS warehouse_type CASCADE;
      DROP TYPE IF EXISTS warehouse_status CASCADE;
      DROP TYPE IF EXISTS product_status CASCADE;
      DROP TYPE IF EXISTS movement_type CASCADE;
      DROP TYPE IF EXISTS entry_format CASCADE;
      DROP TYPE IF EXISTS entry_status CASCADE;
      DROP TYPE IF EXISTS order_status CASCADE;
      DROP TYPE IF EXISTS invoice_format CASCADE;
      DROP TYPE IF EXISTS invoice_status CASCADE;
      DROP TYPE IF EXISTS receipt_format CASCADE;
      DROP TYPE IF EXISTS receipt_status CASCADE;
      DROP TYPE IF EXISTS dispatch_status CASCADE;
      DROP TYPE IF EXISTS audit_status CASCADE;
      DROP TYPE IF EXISTS audit_log_action CASCADE;
      DROP TYPE IF EXISTS audit_result CASCADE;
      DROP TYPE IF EXISTS document_type CASCADE;
    `);
    console.log("✅ Tablas eliminadas");

    // Ejecutar migración 0000
    console.log("\n📦 Ejecutando migración 0000 (schema inicial)...");
    const migration0000 = readFileSync(
      join(__dirname, "..", "drizzle", "0000_wet_nighthawk.sql"),
      "utf8"
    );
    await sql.unsafe(migration0000);
    console.log("✅ Migración 0000 completada");

    // Ejecutar migración 0001 solo si no existe la columna username
    const [hasUsername] = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'username'
      ) as exists
    `;

    if (!hasUsername.exists) {
      console.log("\n📦 Ejecutando migración 0001 (username)...");
      const migration0001 = readFileSync(
        join(__dirname, "..", "drizzle", "0001_update_users_username.sql"),
        "utf8"
      );
      await sql.unsafe(migration0001);
      console.log("✅ Migración 0001 completada");
    } else {
      console.log("\n⚠️  La columna 'username' ya existe, omitiendo migración 0001");
    }

    // Ejecutar seed
    console.log("\n🌱 Ejecutando seed (datos demo)...");
    const seed = readFileSync(
      join(__dirname, "..", "drizzle", "seed.sql"),
      "utf8"
    );
    await sql.unsafe(seed);
    console.log("✅ Seed completado");

    // Verificar usuario admin
    const [admin] = await sql`
      SELECT id, username, first_name, last_name, role, status
      FROM users
      WHERE username = 'admin'
    `;

    if (admin) {
      console.log("\n✅ Usuario admin verificado:");
      console.log(`   - Username: ${admin.username}`);
      console.log(`   - Nombre: ${admin.first_name} ${admin.last_name}`);
      console.log(`   - Rol: ${admin.role}`);
      console.log(`   - Estado: ${admin.status}`);
    } else {
      console.log("\n⚠️  Usuario admin no encontrado después del seed");
    }

    // Contar registros
    const [{ count: products }] = await sql`SELECT COUNT(*) as count FROM products`;
    const [{ count: warehouses }] = await sql`SELECT COUNT(*) as count FROM warehouses`;
    const [{ count: inventory }] = await sql`SELECT COUNT(*) as count FROM inventory`;
    const [{ count: categories }] = await sql`SELECT COUNT(*) as count FROM categories`;

    console.log("\n📊 Resumen de datos:");
    console.log(`   - Categorías: ${categories}`);
    console.log(`   - Productos: ${products}`);
    console.log(`   - Bodegas: ${warehouses}`);
    console.log(`   - Registros de inventario: ${inventory}`);

    console.log("\n🎉 ¡Base de datos inicializada correctamente!");
    console.log("\n📝 Credenciales de acceso:");
    console.log("   Usuario: admin");
    console.log("   Contraseña: admin123");
    console.log("\n🚀 Ejecuta: npm run dev");
    console.log("   Y abre: http://localhost:3000");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nDetalles:", error);
  } finally {
    await sql.end();
  }
}

run();
