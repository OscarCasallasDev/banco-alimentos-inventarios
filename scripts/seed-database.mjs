/**
 * Script para cargar datos iniciales en la base de datos usando el cliente de Supabase
 * Solo carga los datos que faltan
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SECRET_KEY = "sb_secret_-ebihhyQCEqv6bnJXwA1AA__ASEPrmi";

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

async function seed() {
  console.log("=== Cargando Datos Iniciales ===\n");

  try {
    // 1. Verificar usuario admin
    console.log("1. Verificando usuario admin...");
    const { data: existingUsers } = await supabase
      .from("users")
      .select("id, username")
      .eq("username", "admin");

    let adminUser;

    if (existingUsers && existingUsers.length > 0) {
      console.log("✓ Usuario admin ya existe");
      adminUser = existingUsers[0];
    } else {
      const { data: newAdmin, error: adminError } = await supabase
        .from("users")
        .insert({
          username: "admin",
          email: "admin@bancoalimentos.org",
          password_hash: hashPassword("admin123"),
          first_name: "Admin",
          last_name: "Sistema",
          role: "SUPERADMIN",
          status: "ACTIVE",
        })
        .select()
        .single();

      if (adminError) {
        console.error("❌ Error creando usuario admin:", adminError.message);
        return;
      }

      adminUser = newAdmin;
      console.log("✓ Usuario admin creado");
    }
    console.log("  Usuario: admin / Contraseña: admin123\n");

    // 2. Verificar categorías
    console.log("2. Verificando categorías...");
    const { count: catCount } = await supabase.from("categories").select("*", { count: "exact", head: true });

    let categories = [];
    if (catCount > 0) {
      console.log(`✓ Ya existen ${catCount} categorías`);
      const { data } = await supabase.from("categories").select("*");
      categories = data;
    } else {
      const categoryData = [
        { name: "Granos", description: "Productos básicos de granos y cereales" },
        { name: "Enlatados", description: "Productos en conserva y enlatados" },
        { name: "Lácteos", description: "Productos lácteos y derivados" },
        { name: "Frutas y Verduras", description: "Productos frescos de frutas y verduras" },
        { name: "Panadería", description: "Productos de panadería y repostería" },
        { name: "Bebidas", description: "Bebidas y líquidos" },
        { name: "Aseo", description: "Productos de aseo y limpieza" },
        { name: "Otros", description: "Otros productos varios" },
      ];

      const { data: createdCategories, error: catError } = await supabase
        .from("categories")
        .insert(categoryData)
        .select();

      if (catError) {
        console.error("❌ Error creando categorías:", catError.message);
        return;
      }

      categories = createdCategories;
      console.log(`✓ Categorías creadas: ${categories.length}`);
    }
    console.log();

    // 3. Verificar bodegas
    console.log("3. Verificando bodegas...");
    const { count: whCount } = await supabase.from("warehouses").select("*", { count: "exact", head: true });

    let warehouses = [];
    if (whCount > 0) {
      console.log(`✓ Ya existen ${whCount} bodegas`);
      const { data } = await supabase.from("warehouses").select("*");
      warehouses = data;
    } else {
      const warehouseData = [
        { code: "1.1", name: "Productos Propios", description: "Bodega principal de productos propios del Banco", type: "PROPIA", status: "ACTIVE", observations: "Bodega principal" },
        { code: "1.2", name: "Productos Donados", description: "Productos recibidos por donaciones", type: "TERCERO", status: "ACTIVE", observations: null },
        { code: "2.1", name: "Campaña Navideña", description: "Productos para campaña navideña", type: "CAMPAIGN", status: "ACTIVE", observations: null },
        { code: "2.2", name: "Programa Escolar", description: "Productos para programa escolar", type: "PROGRAM", status: "ACTIVE", observations: null },
        { code: "3.1", name: "Productos Vencidos", description: "Productos próximos a vencer o vencidos", type: "PROPIA", status: "ACTIVE", observations: "Requiere revisión especial" },
        { code: "3.2", name: "Productos en Cuarentena", description: "Productos en revisión de calidad", type: "PROPIA", status: "ACTIVE", observations: null },
        { code: "4.1", name: "Almacén Central", description: "Almacén de alto volumen", type: "PROPIA", status: "ACTIVE", observations: null },
        { code: "4.2", name: "Punto de Distribución", description: "Punto de distribución secundario", type: "PROPIA", status: "ACTIVE", observations: null },
      ];

      const { data: createdWarehouses, error: whError } = await supabase
        .from("warehouses")
        .insert(warehouseData)
        .select();

      if (whError) {
        console.error("❌ Error creando bodegas:", whError.message);
        return;
      }

      warehouses = createdWarehouses;
      console.log(`✓ Bodegas creadas: ${warehouses.length}`);
    }
    console.log();

    // 4. Verificar productos
    console.log("4. Verificando productos...");
    const { count: prodCount } = await supabase.from("products").select("*", { count: "exact", head: true });

    let products = [];
    if (prodCount > 0) {
      console.log(`✓ Ya existen ${prodCount} productos`);
      const { data } = await supabase.from("products").select("*");
      products = data;
    } else {
      const productData = [
        { code: "GRN-001", name: "Arroz", description: "Arroz blanco de primera calidad", presentation: "Bolsa 500g", weight: 0.5, unit: "kg", category_id: categories[0].id, status: "ACTIVE", min_stock: 50 },
        { code: "GRN-002", name: "Frijol", description: "Frijol rojo seleccionado", presentation: "Bolsa 500g", weight: 0.5, unit: "kg", category_id: categories[0].id, status: "ACTIVE", min_stock: 30 },
        { code: "GRN-003", name: "Lenteja", description: "Lenteja nacional", presentation: "Bolsa 500g", weight: 0.5, unit: "kg", category_id: categories[0].id, status: "ACTIVE", min_stock: 25 },
        { code: "GRN-004", name: "Avena", description: "Avena en hojuelas", presentation: "Paquete 400g", weight: 0.4, unit: "kg", category_id: categories[0].id, status: "ACTIVE", min_stock: 20 },
        { code: "ENL-001", name: "Atún", description: "Atún en lata al natural", presentation: "Lata 180g", weight: 0.18, unit: "kg", category_id: categories[1].id, status: "ACTIVE", min_stock: 40 },
        { code: "ENL-002", name: "Sardinas", description: "Sardinas en salsa de tomate", presentation: "Lata 250g", weight: 0.25, unit: "kg", category_id: categories[1].id, status: "ACTIVE", min_stock: 35 },
        { code: "ENL-003", name: "Frijol Enlatado", description: "Frijol rojo enlatado", presentation: "Lata 400g", weight: 0.4, unit: "kg", category_id: categories[1].id, status: "ACTIVE", min_stock: 30 },
        { code: "LAC-001", name: "Leche", description: "Leche entera en caja", presentation: "Caja 1L", weight: 1.0, unit: "L", category_id: categories[2].id, status: "ACTIVE", min_stock: 60 },
        { code: "LAC-002", name: "Queso", description: "Queso fresco", presentation: "Paquete 500g", weight: 0.5, unit: "kg", category_id: categories[2].id, status: "ACTIVE", min_stock: 20 },
        { code: "LAC-003", name: "Yogurt", description: "Yogurt natural", presentation: "Vaso 150g", weight: 0.15, unit: "kg", category_id: categories[2].id, status: "ACTIVE", min_stock: 25 },
        { code: "FRV-001", name: "Manzana", description: "Manzana roja fresca", presentation: "Unidad", weight: 0.2, unit: "kg", category_id: categories[3].id, status: "ACTIVE", min_stock: 100 },
        { code: "FRV-002", name: "Banano", description: "Banano criollo", presentation: "Unidad", weight: 0.15, unit: "kg", category_id: categories[3].id, status: "ACTIVE", min_stock: 150 },
        { code: "FRV-003", name: "Papa", description: "Papa criolla", presentation: "Libra", weight: 0.5, unit: "kg", category_id: categories[3].id, status: "ACTIVE", min_stock: 80 },
        { code: "FRV-004", name: "Zanahoria", description: "Zanahoria fresca", presentation: "Libra", weight: 0.5, unit: "kg", category_id: categories[3].id, status: "ACTIVE", min_stock: 40 },
        { code: "PAN-001", name: "Pan", description: "Pan tajado", presentation: "Paquete 500g", weight: 0.5, unit: "kg", category_id: categories[4].id, status: "ACTIVE", min_stock: 30 },
        { code: "PAN-002", name: "Galletas", description: "Galletas de soda", presentation: "Paquete 200g", weight: 0.2, unit: "kg", category_id: categories[4].id, status: "ACTIVE", min_stock: 25 },
        { code: "BEB-001", name: "Agua", description: "Agua embotellada", presentation: "Botella 1.5L", weight: 1.5, unit: "L", category_id: categories[5].id, status: "ACTIVE", min_stock: 100 },
        { code: "BEB-002", name: "Jugo", description: "Jugo de fruta natural", presentation: "Caja 1L", weight: 1.0, unit: "L", category_id: categories[5].id, status: "ACTIVE", min_stock: 50 },
        { code: "ASE-001", name: "Jabón", description: "Jabón de barra", presentation: "Unidad", weight: 0.25, unit: "kg", category_id: categories[6].id, status: "ACTIVE", min_stock: 40 },
        { code: "ASE-002", name: "Detergente", description: "Detergente en polvo", presentation: "Paquete 500g", weight: 0.5, unit: "kg", category_id: categories[6].id, status: "ACTIVE", min_stock: 30 },
      ];

      const { data: createdProducts, error: prodError } = await supabase
        .from("products")
        .insert(productData)
        .select();

      if (prodError) {
        console.error("❌ Error creando productos:", prodError.message);
        return;
      }

      products = createdProducts;
      console.log(`✓ Productos creados: ${products.length}`);
    }
    console.log();

    // 5. Verificar inventario
    console.log("5. Verificando inventario...");
    const { count: invCount } = await supabase.from("inventory").select("*", { count: "exact", head: true });

    if (invCount > 0) {
      console.log(`✓ Ya existen ${invCount} registros de inventario\n`);
    } else {
      const mainWarehouse = warehouses[0];
      const quantities = [150, 80, 60, 45, 120, 90, 70, 200, 40, 55, 300, 450, 160, 80, 60, 50, 250, 100, 80, 60];

      const inventoryItems = products.map((product, index) => ({
        product_id: product.id,
        warehouse_id: mainWarehouse.id,
        quantity: quantities[index] || 0,
        last_movement_at: new Date().toISOString(),
      }));

      const { error: invError } = await supabase
        .from("inventory")
        .insert(inventoryItems);

      if (invError) {
        console.error("❌ Error creando inventario:", invError.message);
        return;
      }

      console.log(`✓ Registros de inventario creados: ${inventoryItems.length}\n`);
    }

    // 6. Verificar movimientos
    console.log("6. Verificando movimientos...");
    const { count: movCount } = await supabase.from("inventory_movements").select("*", { count: "exact", head: true });

    if (movCount > 0) {
      console.log(`✓ Ya existen ${movCount} movimientos\n`);
    } else {
      const { data: inventoryData } = await supabase.from("inventory").select("*");
      const movements = inventoryData.map((item) => ({
        type: "ENTRY",
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: item.quantity,
        balance_after: item.quantity,
        document_id: null,
        document_type: "SEED",
        user_id: adminUser.id,
        notes: "Carga inicial de inventario DEMO",
        created_at: new Date().toISOString(),
      }));

      const { error: movError } = await supabase
        .from("inventory_movements")
        .insert(movements);

      if (movError) {
        console.error("❌ Error creando movimientos:", movError.message);
        return;
      }

      console.log(`✓ Movimientos creados: ${movements.length}\n`);
    }

    console.log("=== Seed Completado Exitosamente ===\n");
    console.log("Resumen:");
    console.log(`  - Usuario admin: admin / admin123`);
    console.log(`  - Categorías: ${categories.length}`);
    console.log(`  - Bodegas: ${warehouses.length}`);
    console.log(`  - Productos: ${products.length}`);

  } catch (error) {
    console.error("Error inesperado:", error.message);
  }
}

seed().catch(console.error);
