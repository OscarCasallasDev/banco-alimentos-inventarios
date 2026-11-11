/**
 * Reparación del catálogo de productos tras normalizar el código de Siigo.
 *
 * Los dos reportes de Siigo usan codificaciones distintas del mismo código:
 *
 *   - DETALLADO: "001-0001-000001"
 *   - RESUMEN:   "0010001000001"
 *
 * Con la normalización (LIN-GRUP-ELEMEN) el catálogo puede tener productos
 * duplicados: uno con el código normalizado y otro sin normalizar.
 *
 * Este script (todo en SQL de conjunto, no en bucle):
 *   1. Renombra los códigos sin normalizar al formato canónico cuando el
 *      destino está libre.
 *   2. Cuando el destino ya existe, mueve los movimientos al producto
 *      canónico y elimina el duplicado.
 *   3. NO borra datos: los movimientos se reasignan antes de borrar.
 */

import fs from "node:fs";
import postgres from "postgres";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

/** CTE con el código canónico de cada producto sin normalizar. */
const CANONICAL = `
  WITH canon AS (
    SELECT id,
           code AS dup_code,
           substr(code, 1, 3) || '-' ||
           substr(code, 4, 4) || '-' ||
           substr(code, 8, 6) AS canon_code
    FROM products
    WHERE code ~ '^[0-9]{13}$'
  )`;

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 2,
    prepare: false,
    onnotice: () => {},
  });

  try {
    await sql.begin(async (tx) => {
      const antes = await tx`
        SELECT COUNT(*)::int AS n FROM products WHERE code ~ '^[0-9]{13}$'
      `;
      console.log(`Productos con código sin normalizar: ${antes[0].n}`);

      // ---------- 1. Renombrar cuando el destino está libre ----------
      const renombrados = await tx.unsafe(`
        ${CANONICAL}
        UPDATE products p
        SET code = c.canon_code, updated_at = now()
        FROM canon c
        WHERE p.id = c.id
          AND NOT EXISTS (
            SELECT 1 FROM products x WHERE x.code = c.canon_code
          )
      `);
      console.log(`Renombrados: ${renombrados.count}`);

      // ---------- 2. Fusionar los que ya tienen destino ----------
      // Los movimientos se reasignan ANTES de borrar el duplicado.
      for (const tabla of [
        "siigo_resumen_movements",
        "siigo_balances",
        "siigo_movements",
        "salida_items",
        "siigo_reservations",
      ]) {
        const r = await tx.unsafe(`
          ${CANONICAL}
          UPDATE ${tabla} t
          SET product_id = dest.id
          FROM canon c
          JOIN products dest ON dest.code = c.canon_code
          WHERE t.product_id = c.id
        `);
        if (r.count > 0) {
          console.log(`  ${tabla}: ${r.count} registros reasignados`);
        }
      }

      const borrados = await tx.unsafe(`
        ${CANONICAL}
        DELETE FROM products p
        USING canon c
        JOIN products dest ON dest.code = c.canon_code
        WHERE p.id = c.id
      `);
      console.log(`Duplicados eliminados: ${borrados.count}`);

      // ---------- Comprobación ----------
      const restantes = await tx`
        SELECT COUNT(*)::int AS n FROM products WHERE code ~ '^[0-9]{13}$'
      `;
      const total = await tx`SELECT COUNT(*)::int AS n FROM products`;
      const sinNombre = await tx`
        SELECT COUNT(*)::int AS n FROM products WHERE source = 'SIIGO' AND (name IS NULL OR name = '')
      `;
      console.log(`Códigos sin normalizar restantes: ${restantes[0].n}`);
      console.log(`Total de productos: ${total[0].n}`);
      console.log(`Productos de Siigo sin nombre: ${sinNombre[0].n}`);
    });

    console.log("\nReparación completada.");
  } catch (error) {
    console.error("Error en la reparación:", error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main();
