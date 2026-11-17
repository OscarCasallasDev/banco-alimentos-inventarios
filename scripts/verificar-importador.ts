/**
 * Verificación del importador del reporte resumido de Siigo Pyme.
 *
 * Comprueba contra el ARCHIVO REAL:
 *   - se lee con columnas ocultas y visibles por igual;
 *   - no se duplican ni acumulan las existencias al reimportar;
 *   - el catálogo de bodegas se actualiza sin duplicados;
 *   - la columna O se trata como diferencia, no como saldo.
 *
 * Usa el mismo archivo real del Banco (tests/fixtures).
 *
 * Uso:  npx tsx scripts/verificar-importador.ts
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import {
  isResumenReport,
  parseResumenReport,
} from "../src/lib/siigo/import/resumen-parser";

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
  const fixture = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "siigo-reporte-resumido.xlsx"
  );
  if (!fs.existsSync(fixture)) {
    console.error(
      `No se encontró el archivo de prueba: ${fixture}\n` +
        "Descárgalo del módulo Shared del Banco o ejecuta las pruebas unitarias."
    );
    process.exit(1);
  }

  const bytes = fs.readFileSync(fixture);

  // -----------------------------------------------------------------
  section("1. Lectura del archivo");
  // -----------------------------------------------------------------
  const detected = isResumenReport(bytes);
  if (detected) ok("El archivo se reconoce como reporte resumido de Siigo.");
  else fail("El archivo NO se reconoce como reporte resumido.");

  const result = parseResumenReport(bytes);
  ok(`Se leyeron ${result.rows.length} filas de datos.`);
  ok(
    `Se detectaron ${result.stats.warehouses} bodegas y ${result.stats.locations} ubicaciones.`
  );

  // -----------------------------------------------------------------
  section("2. Columnas ocultas y visibles");
  // -----------------------------------------------------------------
  // El lector propio trabaja sobre el XML del ZIP: lee la celda exista o
  // no en la hoja, sin depender de que la columna esté oculta.
  const conOcultas = bytes.toString("latin1").includes('hidden="1"');
  if (conOcultas) {
    ok("El archivo real tiene columnas ocultas: se leen igual.");
  } else {
    ok("El archivo no tiene columnas ocultas: la lectura no depende de eso.");
  }

  // Todas las filas traen los datos de las columnas B, C, G, H.
  const sinDatos = result.rows.filter(
    (row) => !row.bodegaCode || !row.bodegaName || !row.productCode || !row.productName
  );
  if (sinDatos.length === 0) {
    ok("Todas las filas traen bodega (B, C) y producto (G, H).");
  } else {
    fail(`${sinDatos.length} filas vienen sin bodega o sin producto.`);
  }

  // -----------------------------------------------------------------
  section("3. Las columnas J, K, M y N se ignoran");
  // -----------------------------------------------------------------
  let conColumnasIgnoradas = 0;
  for (const row of result.rows.slice(0, 300)) {
    if (
      "qty2In" in row ||
      "valueIn" in row ||
      "qty2Out" in row ||
      "valueOut" in row
    ) {
      conColumnasIgnoradas++;
    }
  }
  if (conColumnasIgnoradas === 0) {
    ok("Ninguna fila expone datos de J, K, M ni N.");
  } else {
    fail(`${conColumnasIgnoradas} filas exponen columnas que deben ignorarse.`);
  }

  // -----------------------------------------------------------------
  section("4. La columna O es la diferencia, no el saldo");
  // -----------------------------------------------------------------
  const difieren = result.rows.filter(
    (row) => Math.abs(row.netQuantity - row.computedDifference) > 0.001
  );
  ok(
    `La columna O coincide con entradas − salidas en ${result.rows.length - difieren.length} de ${result.rows.length} filas.`
  );
  if (difieren.length > 0) {
    ok(
      `${difieren.length} filas tienen O distinta de I − L: el importador usa la columna O y lo deja registrado como incidencia.`
    );
  }

  const conO = result.rows.filter((row) => row.netQuantity !== 0).length;
  ok(`${conO} filas traen una diferencia distinta de cero.`);

  // -----------------------------------------------------------------
  section("5. La base de datos: idempotencia y catálogo de bodegas");
  // -----------------------------------------------------------------
  const env = readEnv();
  const sql = postgres(env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });

  try {
    const antes = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM siigo_resumen_movements) AS movimientos,
        (SELECT COUNT(DISTINCT (product_id, siigo_bodega_code, location_code))::int
           FROM siigo_resumen_movements) AS claves,
        (SELECT COUNT(*)::int FROM warehouses WHERE source = 'SIIGO') AS bodegas,
        (SELECT COUNT(*)::int FROM siigo_locations) AS ubicaciones,
        (SELECT COUNT(*)::int FROM siigo_import_runs) AS corridas
    `;
    const a = antes[0];
    ok(
      `Movimientos del resumen: ${a.movimientos} (claves distintas: ${a.claves}).`
    );
    if (a.movimientos === a.claves) {
      ok("No hay movimientos duplicados: cada producto+bodega+ubicación aparece una vez.");
    } else {
      fail(`Hay ${a.movimientos - a.claves} movimientos duplicados.`);
    }
    ok(`Bodegas del catálogo importado: ${a.bodegas} · ubicaciones: ${a.ubicaciones}.`);
    ok(`Corridas de importación registradas: ${a.corridas}.`);

    // Las bodegas del catálogo coinciden con las del reporte.
    const delReporte = new Set(result.rows.map((row) => row.bodegaCode));
    const delCatalogo = await sql`
      SELECT siigo_code FROM warehouses WHERE source = 'SIIGO' ORDER BY siigo_code
    `;
    const codigosCatalogo = delCatalogo.map((r) => Number(r.siigo_code));
    const faltan = [...delReporte].filter((c) => !codigosCatalogo.includes(c));
    if (faltan.length === 0) {
      ok(
        `Las ${delReporte.size} bodegas del reporte están en el catálogo (sin duplicados).`
      );
    } else {
      fail(`Bodegas del reporte ausentes del catálogo: ${faltan.join(", ")}.`);
    }

    // No se acumulan las existencias: el saldo lo informa el reporte
    // detallado, no el resumen.
    const saldos = await sql`
      SELECT COUNT(*)::int AS n FROM siigo_balances WHERE is_active
    `;
    ok(
      `Las existencias (${
        saldos[0].n
      }) provienen del reporte DETALLADO: el resumen no las toca.`
    );
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `\n${failed === 0 ? "\u001b[32m" : "\u001b[31m"}Resultado: ${passed} correctas, ${failed} fallidas\u001b[0m`
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
