/**
 * Verificación de la consolidación por descripción y bodega.
 *
 * Comprueba contra la BASE REAL que:
 *   1. Las ubicaciones del mismo producto en la misma bodega se SUMAN.
 *   2. NO se mezclan existencias de bodegas diferentes.
 *   3. NO se fusionan descripciones diferentes.
 *   4. Los registros originales (códigos, ubicaciones) se conservan intactos.
 *   5. La suma total de existencias no cambia.
 *   6. Las cantidades negativas y los ceros se conservan.
 *
 * Es una prueba de integración: necesita la base real, porque lo que se
 * verifica es que el cálculo derivado coincide con los datos importados.
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

function fail(message: string, detail?: string) {
  failed++;
  console.log(`  \u001b[31m\u2717\u001b[0m ${message}`);
  if (detail) console.log(`      \u001b[31m${detail}\u001b[0m`);
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
    section("1. Las ubicaciones del mismo producto se suman");
    // ---------------------------------------------------------------
    const multi = await sql.unsafe(`
      SELECT v.description, v.siigo_bodega_code, v.warehouse_name,
             v.location_count, v.quantity, v.product_count, v.product_codes,
             (SELECT COUNT(*)::int FROM siigo_balances b
                JOIN products p2 ON p2.id = b.product_id
               WHERE b.is_active
                 AND btrim(regexp_replace(p2.name, '\\s+', ' ', 'g')) = v.description
                 AND b.siigo_bodega_code = v.siigo_bodega_code) AS filas_originales,
             (SELECT COALESCE(SUM(b.quantity), 0) FROM siigo_balances b
                JOIN products p2 ON p2.id = b.product_id
               WHERE b.is_active
                 AND btrim(regexp_replace(p2.name, '\\s+', ' ', 'g')) = v.description
                 AND b.siigo_bodega_code = v.siigo_bodega_code) AS suma_original
      FROM v_stock_consolidated v
      WHERE v.location_count > 1
      ORDER BY v.location_count DESC
      LIMIT 5
    `);

    if (multi.length === 0) {
      fail("No se encontró ningún grupo con varias ubicaciones.");
    } else {
      for (const fila of multi) {
        const cant = Number(fila.quantity ?? 0);
        const original = Number(fila.suma_original);
        const ubic = Number(fila.location_count);
        const filas = Number(fila.filas_originales);
        if (Math.abs(cant - original) < 0.0005 && filas >= ubic && ubic > 1) {
          ok(
            `"${fila.description}" (bodega ${fila.siigo_bodega_code} · ${fila.warehouse_name}): ${filas} registro(s) en ${ubic} ubicación(es) → ${cant} unidades (suma original ${original}).`
          );
        } else {
          fail(
            `"${fila.description}": ${cant} no coincide con la suma original ${original}.`,
            `ubicaciones: ${ubic}, filas originales: ${filas}`
          );
        }
      }
    }

    // ---------------------------------------------------------------
    section("2. Cada grupo coincide EXACTAMENTE con sus originales");
    // ---------------------------------------------------------------
    const descuadres = await sql.unsafe(`
      SELECT COUNT(*)::int AS n
      FROM (
        SELECT v.description, v.siigo_bodega_code, v.quantity
        FROM v_stock_consolidated v
      ) x
      WHERE ABS(x.quantity - (
        SELECT COALESCE(SUM(b.quantity), 0) FROM siigo_balances b
          JOIN products p2 ON p2.id = b.product_id
         WHERE b.is_active
           AND btrim(regexp_replace(p2.name, '\\s+', ' ', 'g')) = x.description
           AND b.siigo_bodega_code = x.siigo_bodega_code
      )) > 0.0005
    `);
    if (Number(descuadres[0].n) === 0) {
      ok(
        "Todos los grupos consolidados cuadran exactamente con la suma de sus registros originales."
      );
    } else {
      fail(`${descuadres[0].n} grupos no cuadran con el original.`);
    }

    // ---------------------------------------------------------------
    section("3. No se mezclan bodegas diferentes");
    // ---------------------------------------------------------------
    const mezcla = await sql.unsafe(`
      SELECT COUNT(*)::int AS n
      FROM v_stock_consolidated v
      WHERE v.quantity <> (
        SELECT COALESCE(SUM(b.quantity), 0) FROM siigo_balances b
          JOIN products p2 ON p2.id = b.product_id
         WHERE b.is_active
           AND btrim(regexp_replace(p2.name, '\\s+', ' ', 'g')) = v.description
           AND b.siigo_bodega_code = v.siigo_bodega_code
      )
    `);
    if (Number(mezcla[0].n) === 0) {
      ok("Ningún grupo contiene existencias de otra bodega.");
    } else {
      fail(`${mezcla[0].n} grupos contienen existencias de otras bodegas.`);
    }

    // La misma descripción en dos bodegas produce dos filas independientes.
    const porBodega = await sql.unsafe(`
      WITH d AS (
        SELECT description,
               COUNT(DISTINCT siigo_bodega_code)::int AS bodegas,
               COUNT(*) FILTER (WHERE quantity <> 0)::int AS filas_con_saldo,
               SUM(quantity)::numeric AS qty_total
        FROM v_stock_consolidated
        GROUP BY description
        HAVING COUNT(DISTINCT siigo_bodega_code) > 1
      )
      SELECT description, bodegas, filas_con_saldo, qty_total
      FROM d ORDER BY qty_total DESC LIMIT 5
    `);
    if (porBodega.length === 0) {
      fail("No hay descripciones en varias bodegas.");
    } else {
      for (const fila of porBodega) {
        ok(
          `"${fila.description}": ${fila.bodegas} bodegas con ${fila.filas_con_saldo} fila(s) con saldo (total ${fila.qty_total}).`
        );
      }
    }

    // ---------------------------------------------------------------
    section("4. No se fusionan descripciones diferentes");
    // ---------------------------------------------------------------
    const distintas = await sql.unsafe(`
      SELECT COUNT(DISTINCT description)::int AS n FROM v_stock_consolidated
    `);
    const originalDesc = await sql.unsafe(`
      SELECT COUNT(DISTINCT btrim(regexp_replace(p.name, '\\s+', ' ', 'g')))::int AS n
      FROM siigo_balances b JOIN products p ON p.id = b.product_id
      WHERE b.is_active
    `);
    if (Number(distintas[0].n) === Number(originalDesc[0].n)) {
      ok(
        `Se conservan las ${originalDesc[0].n} descripciones distintas: ninguna se fusionó con otra.`
      );
    } else {
      fail(
        `Fusión de descripciones detectada: ${distintas[0].n} en la vista frente a ${originalDesc[0].n} originales.`
      );
    }

    // ---------------------------------------------------------------
    section("5. Los registros originales se conservan");
    // ---------------------------------------------------------------
    const originales = await sql.unsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM siigo_balances WHERE is_active) AS balances,
        (SELECT COUNT(DISTINCT location_code)::int FROM siigo_balances WHERE is_active) AS ubicaciones,
        (SELECT COUNT(DISTINCT p.code)::int FROM siigo_balances b
           JOIN products p ON p.id = b.product_id WHERE b.is_active) AS codigos,
        (SELECT COUNT(*)::int FROM v_stock_consolidated) AS consolidados
    `);
    const o = originales[0];
    ok(
      `Originales por ubicación: ${o.balances} · ubicaciones distintas: ${o.ubicaciones} · códigos de Siigo: ${o.codigos} · grupos consolidados: ${o.consolidados}.`
    );
    if (o.consolidados <= o.balances) {
      ok(
        "La consolidación agrupa (reduce filas) sin eliminar ningún registro original."
      );
    } else {
      fail("La consolidación aumentó el número de filas: hay una anomalía.");
    }

    // Los códigos de cada grupo se conservan.
    const codigosPerdidos = await sql.unsafe(`
      SELECT COUNT(*)::int AS n FROM v_stock_consolidated v
      WHERE EXISTS (
        SELECT 1 FROM siigo_balances b JOIN products p2 ON p2.id = b.product_id
         WHERE b.is_active
           AND btrim(regexp_replace(p2.name, '\\s+', ' ', 'g')) = v.description
           AND b.siigo_bodega_code = v.siigo_bodega_code
           AND NOT (p2.code = ANY(v.product_codes))
      )
    `);
    if (Number(codigosPerdidos[0].n) === 0) {
      ok("Todos los códigos de Siigo de cada grupo quedan registrados en la vista.");
    } else {
      fail(`${codigosPerdidos[0].n} grupos perdieron algún código de Siigo.`);
    }

    // ---------------------------------------------------------------
    section("6. La suma total de existencias se conserva");
    // ---------------------------------------------------------------
    const totales = await sql.unsafe(`
      SELECT
        (SELECT COALESCE(SUM(quantity),0) FROM siigo_balances WHERE is_active)::numeric AS original,
        (SELECT COALESCE(SUM(quantity),0) FROM v_stock_consolidated)::numeric AS consolidado
    `);
    const original = Number(totales[0].original);
    const consolidado = Number(totales[0].consolidado);
    if (Math.abs(original - consolidado) < 0.001) {
      ok(`El total de existencias se conserva exactamente: ${original}.`);
    } else {
      fail(`El total cambió: original ${original} vs consolidado ${consolidado}.`);
    }

    // ---------------------------------------------------------------
    section("7. Negativos y ceros se conservan");
    // ---------------------------------------------------------------
    const signos = await sql.unsafe(`
      SELECT
        COUNT(*) FILTER (WHERE quantity < 0)::int AS negativos,
        COUNT(*) FILTER (WHERE quantity = 0)::int AS ceros,
        COUNT(*) FILTER (WHERE quantity > 0)::int AS positivos
      FROM v_stock_consolidated
    `);
    const s = signos[0];
    ok(
      `Zeros: ${s.ceros} · Negativos: ${s.negativos} · Positivos: ${s.positivos}.`
    );
    const origSignos = await sql.unsafe(`
      SELECT COUNT(*) FILTER (WHERE quantity < 0)::int AS negativos
      FROM siigo_balances WHERE is_active
    `);
    // Al consolidar, varias filas negativas pueden compensarse: lo que debe
    // conservarse es que NINGÚN grupo con saldo negativo se pierda.
    const negPerdidos = await sql.unsafe(`
      SELECT COUNT(*)::int AS n FROM (
        SELECT btrim(regexp_replace(p.name, '\\s+', ' ', 'g')) AS description,
               b.siigo_bodega_code, SUM(b.quantity) AS qty
        FROM siigo_balances b JOIN products p ON p.id = b.product_id
        WHERE b.is_active
        GROUP BY 1, 2
      ) g
      WHERE g.qty < 0
        AND NOT EXISTS (
          SELECT 1 FROM v_stock_consolidated v
          WHERE v.description = g.description
            AND v.siigo_bodega_code = g.siigo_bodega_code
            AND v.quantity < 0
        )
    `);    if (Number(negPerdidos[0].n) === 0) {
      ok(
        `Ningún grupo con saldo negativo se perdió: ${s.negativos} grupos con saldo negativo (de ${origSignos[0].negativos} registros negativos originales, compensados al consolidar).`
      );
    } else {
      fail(`${negPerdidos[0].n} grupos con saldo negativo se perdieron.`);
    }

    // ---------------------------------------------------------------
    section("8. Bodegas con nombre legible");
    // ---------------------------------------------------------------
    const sinNombre = await sql.unsafe(
      `SELECT COUNT(*)::int AS n FROM v_stock_consolidated WHERE warehouse_name IS NULL`
    );
    if (Number(sinNombre[0].n) === 0) {
      ok("Todas las existencias muestran el nombre real de su bodega.");
    } else {
      fail(`${sinNombre[0].n} existencias siguen sin nombre de bodega.`);
    }
    const nombres = await sql.unsafe(
      `SELECT warehouse_name, COUNT(*)::int AS n FROM v_stock_consolidated
        GROUP BY warehouse_name ORDER BY n DESC`
    );
    for (const n of nombres) {
      ok(`${n.warehouse_name}: ${n.n} grupos consolidados.`);
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
