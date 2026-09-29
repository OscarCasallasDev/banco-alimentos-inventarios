/**
 * Script de diagnóstico completo de la base de datos
 * Verifica conexión, tablas, estructura y consultas
 */

import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres:Y3iVdMCxRx&YR3Y@db.hszylkcojdjnbjatuhnv.supabase.co:5432/postgres";

async function diagnose() {
  console.log("=== Diagnóstico de Base de Datos ===\n");

  console.log("URL de conexión:");
  console.log(`  ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  let sql;

  try {
    // 1. Intentar conectar
    console.log("1. Intentando conectar a la base de datos...");
    sql = postgres(DATABASE_URL, {
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
    });

    const result = await sql`SELECT 1 as test`;
    console.log("✓ Conexión exitosa!\n");

    // 2. Verificar tablas existentes
    console.log("2. Verificando tablas existentes...");
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    if (tables.length === 0) {
      console.log("⚠️  No se encontraron tablas en la base de datos");
      console.log("   Es necesario ejecutar la migración inicial\n");
      return;
    }

    console.log(`✓ Tablas encontradas: ${tables.length}`);
    tables.forEach((t) => {
      console.log(`  - ${t.table_name}`);
    });
    console.log();

    // 3. Verificar estructura de la tabla users
    console.log("3. Verificando estructura de la tabla 'users'...");
    const userColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    if (userColumns.length === 0) {
      console.log("⚠️  La tabla 'users' no existe\n");
    } else {
      console.log(`✓ Columnas en 'users': ${userColumns.length}`);
      userColumns.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)'}`);
      });
    }
    console.log();

    // 4. Verificar si hay usuarios
    console.log("4. Verificando usuarios en la base de datos...");
    const users = await sql`SELECT id, username, email, role, status FROM users LIMIT 10`;

    if (users.length === 0) {
      console.log("⚠️  No hay usuarios en la base de datos");
      console.log("   Es necesario ejecutar el seed\n");
    } else {
      console.log(`✓ Usuarios encontrados: ${users.length}`);
      users.forEach((u) => {
        console.log(`  - ${u.username} (${u.email}) - Rol: ${u.role} - Estado: ${u.status}`);
      });
    }
    console.log();

    // 5. Verificar productos
    console.log("5. Verificando productos...");
    const products = await sql`SELECT COUNT(*) as count FROM products`;
    console.log(`✓ Productos: ${products[0].count}\n`);

    // 6. Verificar bodegas
    console.log("6. Verificando bodegas...");
    const warehouses = await sql`SELECT COUNT(*) as count FROM warehouses`;
    console.log(`✓ Bodegas: ${warehouses[0].count}\n`);

    // 7. Verificar inventario
    console.log("7. Verificando inventario...");
    const inventory = await sql`SELECT COUNT(*) as count FROM inventory`;
    console.log(`✓ Registros de inventario: ${inventory[0].count}\n`);

    // 8. Prueba de inserción y eliminación
    console.log("8. Prueba de inserción y eliminación...");
    try {
      const testId = await sql`
        INSERT INTO users (username, email, password_hash, first_name, last_name, role, status)
        VALUES ('test_diagnostic', 'test@diagnostic.com', 'hash123', 'Test', 'User', 'RECEPCION', 'ACTIVE')
        RETURNING id
      `;

      console.log("✓ Inserción exitosa");

      await sql`DELETE FROM users WHERE username = 'test_diagnostic'`;
      console.log("✓ Eliminación exitosa\n");
    } catch (err) {
      console.log(`⚠️  Error en prueba de inserción/eliminación: ${err.message}\n`);
    }

    // 9. Verificar todas las tablas del sistema
    console.log("9. Verificando todas las tablas del sistema...");
    const expectedTables = [
      'users', 'roles', 'categories', 'products', 'warehouses',
      'inventory', 'inventory_movements', 'entries', 'entry_items',
      'orders', 'order_items', 'invoices', 'invoice_items',
      'receipts', 'dispatches', 'dispatch_items', 'audits',
      'audit_items', 'audit_logs', 'documents'
    ];

    const existingTables = tables.map((t) => t.table_name);
    const missingTables = expectedTables.filter((t) => !existingTables.includes(t));

    if (missingTables.length === 0) {
      console.log("✓ Todas las tablas del sistema existen\n");
    } else {
      console.log(`⚠️  Tablas faltantes: ${missingTables.join(', ')}\n`);
    }

    console.log("=== Diagnóstico Completado ===");

  } catch (error) {
    console.error("\n❌ Error de conexión:");
    console.error(`   ${error.message}`);
    console.error("\nPosibles causas:");
    console.error("1. El proyecto de Supabase está pausado");
    console.error("2. La URL de conexión es incorrecta");
    console.error("3. Problemas de red");
    console.error("4. Credenciales incorrectas");
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}

diagnose().catch(console.error);
