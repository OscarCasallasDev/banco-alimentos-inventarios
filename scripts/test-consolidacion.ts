/**
 * Prueba de integración de las existencias por producto y bodega.
 *
 * Verifica contra la BASE REAL que:
 *   1. Dos productos con el MISMO nombre en bodegas distintas aparecen
 *      como filas separadas y sus cantidades NO se suman entre sí.
 *   2. Un producto con el mismo nombre y distinto código en la misma
 *      bodega también aparece separado.
 *   3. Los registros originales de `siigo_balances` siguen intactos
 *      (número de filas idéntico al de la vista consolidada por ubicación).
 *   4. La suma total de existencias se conserva.
 *
 * Es una prueba de integración porque necesita la base de datos real: el
 * comportamiento que se verifica (que no se sumen bodegas) solo se puede
 * comprobar con los datos importados de Siigo.
 *
 * Uso:  npx tsx scripts/test-consolidacion.ts
 */

import fs from "node:fs";
import postgres from "postgres";

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = fs.readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

let passed = 0;
let failed = 0;

function ok(message: string) {
  passed++;
  console.log(`  \u001b[32m\u2713\u001b[0m ${message}`);
}

function fail(message: string) {
  failed++;
  console.log(`  \u001b[31m\u2717\u001b[0m ${message}`);
}

function section(title: string) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
}

async function main() {
  const env = readEnv();
  const sql = postgres(env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });

  try {
    // ---------------------------------------------------------------
    section("1. Productos con el mismo nombre en bodegas distintas");
    // ---------------------------------------------------------------
    // Se buscan descripciones presentes en varias bodegas CON saldo en al
    // menos dos de ellas: ahí es donde se nota si las cantidades se suman
    // entre bodegas o no.
    const duplicados = await sql`
      WITH por_nombre AS (
        SELECT description,
               COUNT(DISTINCT siigo_bodega_code)::int AS bodegas,
               COUNT(*) FILTER (WHERE quantity <> 0)::int AS filas_con_saldo,
               SUM(quantity)::numeric AS qty_total
        FROM v_stock_by_bodega
        GROUP BY description
        HAVING COUNT(*) FILTER (WHERE quantity <> 0) > 1
      )
      SELECT description, bodegas, filas_con_saldo, qty_total
      FROM por_nombre
      ORDER BY qty_total DESC
      LIMIT 5
    `;

    if (duplicados.length === 0) {
      fail(
        "No se encontró ninguna descripción con saldo en dos o más bodegas."
      );
    } else {
      ok(
        `Se hallaron ${duplicados.length} descripciones con saldo en varias bodegas (separadas).`
      );
      for (const fila of duplicados) {
        ok(
          `"${fila.description}" aparece en ${fila.bodegas} bodegas con ${fila.filas_con_saldo} filas con saldo (total ${fila.qty_total}).`
        );
      }
    }

    // INVARIANTE EXACTO: la cantidad de la fila (producto, bodega) debe
    // ser exactamente la suma de los saldos originales de ESE producto en
    // ESA bodega. Si el sistema sumara entre bodegas, esta comparación
    // fallaría.
    const exactas = await sql`
      SELECT COUNT(*)::int AS n
      FROM (
        SELECT v.product_code, v.siigo_bodega_code, v.quantity AS qty_vista,
               COALESCE(o.qty_original, 0) AS qty_original
        FROM v_stock_by_bodega v
        LEFT JOIN (
          SELECT p.code AS product_code, b.siigo_bodega_code,
                 SUM(b.quantity) AS qty_original
          FROM siigo_balances b
          JOIN products p ON p.id = b.product_id
          WHERE b.is_active
          GROUP BY p.code, b.siigo_bodega_code
        ) o ON o.product_code = v.product_code
           AND o.siigo_bodega_code = v.siigo_bodega_code
      ) x
      WHERE ABS(x.qty_vista - x.qty_original) > 0.0005
    `;

    if (Number(exactas[0].n) === 0) {
      ok(
        "Cada fila (producto + bodega) coincide EXACTAMENTE con el saldo original de ese producto en esa bodega: no hay sumas entre bodegas."
      );
    } else {
      fail(
        `${exactas[0].n} filas no coinciden con el saldo original de su producto en su bodega.`
      );
    }

    // El caso exacto del Banco: el MISMO producto en dos bodegas.
    const mismoProducto = await sql`
      SELECT v1.product_code, v1.description,
             v1.siigo_bodega_code AS bodega_1,
             v1.quantity AS cantidad_1,
             v2.siigo_bodega_code AS bodega_2,
             v2.quantity AS cantidad_2
      FROM v_stock_by_bodega v1
      JOIN v_stock_by_bodega v2
        ON v1.product_code = v2.product_code
       AND v1.siigo_bodega_code < v2.siigo_bodega_code
       AND v1.quantity <> 0 AND v2.quantity <> 0
      LIMIT 5
    `;

    if (mismoProducto.length === 0) {
      ok(
        "No hay un mismo producto con saldo en dos bodegas simultáneamente (no se puede contrastar)."
      );
    } else {
      ok(
        `El mismo producto aparece en ${mismoProducto.length} casos con existencias en dos bodegas:`
      );
      for (const fila of mismoProducto) {
        ok(
          `"${fila.description}" (${fila.product_code}): bodega ${fila.bodega_1} = ${fila.cantidad_1} | bodega ${fila.bodega_2} = ${fila.cantidad_2} → filas independientes.`
        );
      }
    }

    // ---------------------------------------------------------------
    section("2. Mismo nombre + mismo bodega pero distinto código");
    // ---------------------------------------------------------------
    const mismoCodigo = await sql`
      SELECT p.name AS description, b.siigo_bodega_code,
             COUNT(DISTINCT p.code)::int AS codigos
      FROM siigo_balances b
      JOIN products p ON p.id = b.product_id
      WHERE b.is_active
      GROUP BY p.name, b.siigo_bodega_code
      HAVING COUNT(DISTINCT p.code) > 1
      LIMIT 5
    `;

    if (mismoCodigo.length === 0) {
      ok("No hay colisiones de nombre+código dentro de una misma bodega.");
    } else {
      for (const fila of mismoCodigo) {
        const filas = await sql`
          SELECT COUNT(*)::int AS n
          FROM v_stock_by_bodega
          WHERE description = ${fila.description}
            AND siigo_bodega_code = ${fila.siigo_bodega_code}
        `;
        if (Number(filas[0].n) === Number(fila.codigos)) {
          ok(
            `"${fila.description}" en bodega ${fila.siigo_bodega_code}: ${fila.codigos} códigos distintos → ${filas[0].n} filas separadas.`
          );
        } else {
          fail(
            `"${fila.description}" en bodega ${fila.siigo_bodega_code}: ${fila.codigos} códigos pero ${filas[0].n} filas (deberían ser ${fila.codigos}).`
          );
        }
      }
    }

    // ---------------------------------------------------------------
    section("3. Los registros originales siguen intactos");
    // ---------------------------------------------------------------
    const originales = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM siigo_balances WHERE is_active) AS balances,
        (SELECT COUNT(*)::int FROM v_stock_by_bodega) AS por_codigo_bodega,
        (SELECT COUNT(*)::int FROM v_stock_consolidated) AS consolidada_desc
    `;
    const fila = originales[0];
    ok(
      `Originales por ubicación: ${fila.balances} (sin cambios) · vista por código+bodega: ${fila.por_codigo_bodega} · vista histórica por descripción: ${fila.consolidada_desc}.`
    );

    if (fila.por_codigo_bodega >= fila.consolidada_desc) {
      ok(
        "La vista por código+bodega es al menos tan granular como la consolidada por descripción."
      );
    } else {
      fail("La vista por código+bodega debería ser más granular que la consolidada.");
    }

    // ---------------------------------------------------------------
    section("4. La suma total de existencias se conserva");
    // ---------------------------------------------------------------
    const totales = await sql`
      SELECT
        (SELECT COALESCE(SUM(quantity),0) FROM siigo_balances WHERE is_active)::numeric AS original,
        (SELECT COALESCE(SUM(quantity),0) FROM v_stock_by_bodega)::numeric AS por_codigo_bodega,
        (SELECT COALESCE(SUM(quantity),0) FROM v_stock_consolidated)::numeric AS consolidada
    `;
    const t = totales[0];
    const original = Number(t.original);
    const nuevo = Number(t.por_codigo_bodega);
    const historico = Number(t.consolidada);

    if (Math.abs(original - nuevo) < 0.001) {
      ok(
        `El total de existencias se conserva exactamente: ${original} (original) = ${nuevo} (por código+bodega).`
      );
    } else {
      fail(`El total cambió: original ${original} vs por código+bodega ${nuevo}.`);
    }

    if (Math.abs(original - historico) < 0.001) {
      ok(
        `El total de la vista histórica por descripción también se conserva: ${historico}.`
      );
    } else {
      fail(`La vista histórica cambió: ${original} vs ${historico}.`);
    }

    // ---------------------------------------------------------------
    section("5. Bodegas con nombre legible (fin de 'Siigo 1', 'Siigo 2')");
    // ---------------------------------------------------------------
    const sinNombre = await sql`
      SELECT COUNT(*)::int AS n
      FROM v_stock_by_bodega
      WHERE warehouse_name IS NULL
    `;
    if (Number(sinNombre[0].n) === 0) {
      ok("Todas las existencias muestran el nombre de su bodega.");
    } else {
      fail(`${sinNombre[0].n} existencias siguen sin nombre de bodega.`);
    }

    const nombres = await sql`
      SELECT warehouse_name, COUNT(*)::int AS n
      FROM v_stock_by_bodega
      GROUP BY warehouse_name
      ORDER BY n DESC
    `;
    for (const n of nombres) {
      ok(`${n.warehouse_name}: ${n.n} existencias.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `\n${failed === 0 ? "\u001b[32m" : "\u001b[31m"}Resultado: ${passed} correctas, ${failed} fallidas\u001b[0m`
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
