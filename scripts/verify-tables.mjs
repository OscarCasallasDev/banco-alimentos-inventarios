/**
 * Script para verificar las tablas en Supabase
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hszylkcojdjnbjatuhnv.supabase.co";
const SUPABASE_SERVICE_KEY = "sb_publishable_674Wkrhp-3VOXOxmOA_zAg_G6QiQ1w4";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const expectedTables = [
  "users",
  "roles",
  "categories",
  "products",
  "warehouses",
  "inventory",
  "inventory_movements",
  "entries",
  "entry_items",
  "orders",
  "order_items",
  "invoices",
  "invoice_items",
  "receipts",
  "dispatches",
  "dispatch_items",
  "audits",
  "audit_items",
  "audit_logs",
  "documents",
];

async function verifyTables() {
  console.log("Verificando tablas en Supabase...\n");

  let foundCount = 0;
  let missingTables = [];

  for (const table of expectedTables) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);

      if (error) {
        console.error(`✗ Tabla "${table}": ${error.message}`);
        missingTables.push(table);
      } else {
        console.log(`✓ Tabla "${table}" existe`);
        foundCount++;
      }
    } catch (err) {
      console.error(`✗ Tabla "${table}": Error de conexión`);
      missingTables.push(table);
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Tablas encontradas: ${foundCount}/${expectedTables.length}`);

  if (missingTables.length > 0) {
    console.log(`\nTablas faltantes:`);
    missingTables.forEach((t) => console.log(`  - ${t}`));
  } else {
    console.log(`\n¡Todas las tablas están creadas correctamente!`);
  }
}

verifyTables().catch(console.error);
