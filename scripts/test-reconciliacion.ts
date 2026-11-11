/**
 * PRUEBA CRÍTICA: el inventario NO se descuenta dos veces.
 *
 * Escenario exacto del plan:
 *
 *   1. Siigo informa 100 unidades.
 *   2. El almacenista genera una salida de 50 unidades.
 *   3. La salida queda pendiente de confirmación en Siigo.
 *   4. La disponibilidad operativa debe considerar esas 50 comprometidas.
 *   5. Despacho registra el movimiento en Siigo.
 *   6. La siguiente importación informa 50 unidades.
 *   7. El sistema debe reconocer que el descuento ya fue reflejado por
 *      Siigo y liberar la reserva, SIN restar otras 50 unidades.
 *
 * Si el resultado final fuera 0 (en vez de 50), habría un doble descuento.
 *
 * La prueba usa el MISMO camino que el agente local: crea una corrida,
 * envía las filas por lotes y cierra la importación.
 */

import fs from "node:fs";

import { createRun, saveBatch, finalizeRun } from "../src/lib/services/siigo-import.service";
import { listAvailability } from "../src/lib/services/exit.service";
import { createSalida, generateSalida, cancelSalida } from "../src/lib/services/exit.service";
import { getDb } from "../src/lib/db/client";

// Las variables de entorno se leen ANTES de importar la capa de datos.
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

let passed = 0;
let failed = 0;

function ok(text: string) {
  passed++;
  console.log(`  ${C.green}✓${C.reset} ${text}`);
}

function fail(text: string, detail?: unknown) {
  failed++;
  console.log(`  ${C.red}✗${C.reset} ${text}`);
  if (detail !== undefined) console.log(`      ${text ? "" : ""}${detail}`);
}

function assert(condition: boolean, text: string, detail?: unknown) {
  if (condition) ok(text);
  else fail(text, detail === undefined ? undefined : JSON.stringify(detail));
}

// ---------------------------------------------------------------
// Datos de la prueba
// ---------------------------------------------------------------

const PRODUCT_CODE = "999-9999-999001";
const PRODUCT_NAME = "PRODUCTO DE PRUEBA DE RECONCILIACION";
const BODEGA = 1;
const UBICACION = 1;
const UNIDAD = "UN";
const CANTIDAD_INICIAL = 100;
const CANTIDAD_SALIDA = 50;

/** Construye las filas normalizadas de un reporte de prueba. */
function construirFilas(incluirVenta: boolean) {
  const filas: Record<string, unknown>[] = [];

  // Fila de apertura: saldo anterior al informe = 0.
  filas.push({
    rowNumber: filas.length + 8,
    productCode: PRODUCT_CODE,
    productName: PRODUCT_NAME,
    reference: "PRUEBA",
    unit: UNIDAD,
    brand: "PRUEBA",
    description: "Producto de prueba",
    document: "-000 00000000000-0000",
    date: null,
    isOpening: true,
    bodega: BODEGA,
    ubicacion: UBICACION,
    qtyBefore: 0,
    qtyIn: 0,
    qtyOut: 0,
    qtyNet: 0,
    qtyAccum: 0,
    valueMovement: 0,
    qty2In: 0,
    qty2Out: 0,
    qty2Balance: 0,
  });

  // Movimiento de entrada: 100 unidades.
  filas.push({
    rowNumber: filas.length + 8,
    productCode: PRODUCT_CODE,
    productName: PRODUCT_NAME,
    reference: "PRUEBA",
    unit: UNIDAD,
    brand: "PRUEBA",
    description: "Entrada de prueba",
    document: "E-001 00000000001-0001",
    date: "2026-08-01",
    isOpening: false,
    bodega: BODEGA,
    ubicacion: UBICACION,
    qtyBefore: 0,
    qtyIn: CANTIDAD_INICIAL,
    qtyOut: 0,
    qtyNet: CANTIDAD_INICIAL,
    qtyAccum: CANTIDAD_INICIAL,
    valueMovement: 0,
    qty2In: 0,
    qty2Out: 0,
    qty2Balance: 0,
  });

  // Movimiento de salida (solo en la segunda importación): -50 unidades.
  if (incluirVenta) {
    filas.push({
      rowNumber: filas.length + 8,
      productCode: PRODUCT_CODE,
      productName: PRODUCT_NAME,
      reference: "PRUEBA",
      unit: UNIDAD,
      brand: "PRUEBA",
      description: "Salida registrada en Siigo",
      document: "F-001 00000000002-0001",
      date: "2026-08-02",
      isOpening: false,
      bodega: BODEGA,
      ubicacion: UBICACION,
      qtyBefore: 0,
      qtyIn: 0,
      qtyOut: CANTIDAD_SALIDA,
      qtyNet: -CANTIDAD_SALIDA,
      qtyAccum: CANTIDAD_INICIAL - CANTIDAD_SALIDA,
      valueMovement: 0,
      qty2In: 0,
      qty2Out: 0,
      qty2Balance: 0,
    });
  }

  return filas;
}

/** Importa un reporte de prueba completo. */
async function importar(etiqueta: string, incluirVenta: boolean) {
  const filas = construirFilas(incluirVenta);
  const hash = `reconciliacion-${etiqueta}-${Date.now()}`;

  const run = await createRun(
    {
      fileSha256: hash.replace(/[^a-f0-9]/g, "0").padEnd(64, "0"),
      fileName: `prueba-${etiqueta}.xlsx`,
      fileSize: 1024,
      source: "MANUAL",
    },
    null
  );

  await saveBatch(run.id, 0, filas as never);
  const summary = await finalizeRun(run.id);
  return { runId: run.id, summary };
}

/** Consulta la existencia del producto de prueba. */
let productoId = "";

/** Consulta la existencia del producto de prueba. */
async function existencia() {
  const resultado = await listAvailability({
    productId: productoId,
    page: 0,
    pageSize: 10,
  });
  return (
    resultado.items.find(
      (i) =>
        i.siigoBodegaCode === BODEGA && i.locationCode === UBICACION
    ) ?? null
  );
}

// ---------------------------------------------------------------
// Prueba
// ---------------------------------------------------------------

async function main() {
  console.log(
    `\n${C.cyan}=== Reconciliación: el inventario NO se descuenta dos veces ===${C.reset}\n`
  );

  const db = getDb();

  // Limpieza de una ejecución anterior de esta misma prueba.
  await db.execute(
    `DELETE FROM siigo_reservations WHERE product_id IN (SELECT id FROM products WHERE code = '${PRODUCT_CODE}')`
  );
  await db.execute(`DELETE FROM salida_items WHERE product_id IN (SELECT id FROM products WHERE code = '${PRODUCT_CODE}')`);
  await db.execute(`DELETE FROM salidas WHERE id NOT IN (SELECT DISTINCT salida_id FROM salida_items)`);
  await db.execute(`DELETE FROM siigo_balance_diffs WHERE product_id IN (SELECT id FROM products WHERE code = '${PRODUCT_CODE}')`);
  await db.execute(`DELETE FROM siigo_balances WHERE product_id IN (SELECT id FROM products WHERE code = '${PRODUCT_CODE}')`);
  await db.execute(`DELETE FROM siigo_movements WHERE product_id IN (SELECT id FROM products WHERE code = '${PRODUCT_CODE}')`);
  await db.execute(`DELETE FROM products WHERE code = '${PRODUCT_CODE}'`);

  const programas = await db.execute<{ id: string; name: string }>(
    `SELECT id, name FROM programs WHERE status = 'ACTIVE' ORDER BY sort_order LIMIT 1`
  );
  const programId = (programas as unknown as { id: string }[])[0]?.id;
  if (!programId) {
    console.error("No hay programas configurados.");
    process.exit(1);
  }

  // Usuario de la prueba (el administrador del sistema).
  const usuarios = await db.execute<{ id: string }>(
    `SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY role LIMIT 1`
  );
  const usuarioId = (usuarios as unknown as { id: string }[])[0]?.id;
  if (!usuarioId) {
    console.error("No hay usuarios activos.");
    process.exit(1);
  }

  // ---------- 1. Primera importación: Siigo informa 100 ----------
  const primera = await importar("A", false);
  console.log(`  Importación A: ${primera.summary.status} · ${primera.summary.balancesCount} saldos`);

  const productoRows = await db.execute<{ id: string }>(
    `SELECT id FROM products WHERE code = '${PRODUCT_CODE}'`
  );
  productoId = (productoRows as unknown as { id: string }[])[0]?.id;

  const inicial = await existencia();
  assert(
    inicial !== null && inicial.siigoQuantity === CANTIDAD_INICIAL,
    `Siigo informa ${CANTIDAD_INICIAL} unidades`,
    inicial
  );
  assert(
    inicial !== null && inicial.availableQuantity === CANTIDAD_INICIAL,
    `La disponibilidad operativa es ${CANTIDAD_INICIAL} (sin compromisos)`,
    inicial?.availableQuantity
  );

  // ---------- 2. El almacenista genera una salida de 50 ----------
  const salida = await createSalida(
    {
      programId,
      warehouseId: null,
      notes: "Prueba de reconciliación",
      items: [
        {
          productId: productoId,
          siigoBodegaCode: BODEGA,
          locationCode: UBICACION,
          quantity: CANTIDAD_SALIDA,
        },
      ],
    },
    usuarioId
  );

  const generada = await generateSalida(salida.id, usuarioId);
  console.log(`  Salida generada: ${generada.number}`);

  const conReserva = await existencia();
  assert(
    conReserva !== null && conReserva.reservedQuantity === CANTIDAD_SALIDA,
    `La salida reservó ${CANTIDAD_SALIDA} unidades`,
    conReserva
  );
  assert(
    conReserva !== null &&
      conReserva.availableQuantity === CANTIDAD_INICIAL - CANTIDAD_SALIDA,
    `La disponibilidad operativa bajó a ${CANTIDAD_INICIAL - CANTIDAD_SALIDA}`,
    conReserva?.availableQuantity
  );
  assert(
    conReserva !== null && conReserva.siigoQuantity === CANTIDAD_INICIAL,
    "El saldo INFORMADO por Siigo no se tocó (sigue en 100)",
    conReserva?.siigoQuantity
  );

  // ---------- 3. Segunda importación: Siigo ya rebajó a 50 ----------
  const segunda = await importar("B", true);
  console.log(
    `  Importación B: ${segunda.summary.status} · ${segunda.summary.diffsFound} diferencias`
  );

  const final = await existencia();
  console.log(
    `  Estado final: informado ${final?.siigoQuantity} · comprometido ${final?.reservedQuantity} · ` +
      `disponible ${final?.availableQuantity}`
  );

  // ---------- 4. Verificaciones ----------
  assert(
    final !== null && final.siigoQuantity === CANTIDAD_INICIAL - CANTIDAD_SALIDA,
    `Siigo ahora informa ${CANTIDAD_INICIAL - CANTIDAD_SALIDA} (el descuento lo hizo Siigo, no la app)`,
    final?.siigoQuantity
  );
  assert(
    final !== null && final.reservedQuantity === 0,
    "La reserva se liberó (la importación demostró el descuento)",
    final?.reservedQuantity
  );
  assert(
    final !== null &&
      final.availableQuantity === CANTIDAD_INICIAL - CANTIDAD_SALIDA,
    `La disponibilidad final es ${CANTIDAD_INICIAL - CANTIDAD_SALIDA} — NO 0 (sin doble descuento)`,
    final?.availableQuantity
  );

  const salidasRows = await db.execute<{
    reconciliation_status: string;
    reconciliation_note: string | null;
  }>(
    `SELECT reconciliation_status, reconciliation_note FROM salidas WHERE id = '${salida.id}'`
  );
  const estado = (salidasRows as unknown as { reconciliation_status: string }[])[0];
  assert(
    estado?.reconciliation_status === "MATCHED",
    "La salida quedó marcada como conciliada con Siigo",
    estado
  );

  // ---------- 5. Limpieza ----------
  await cancelSalida(salida.id, "Fin de la prueba de reconciliación");
  await db.execute(
    `DELETE FROM siigo_reservations WHERE product_id = '${productoId}'`
  );
  await db.execute(`DELETE FROM salida_items WHERE salida_id = '${salida.id}'`);
  await db.execute(`DELETE FROM salidas WHERE id = '${salida.id}'`);
  await db.execute(`DELETE FROM siigo_balance_diffs WHERE product_id = '${productoId}'`);
  await db.execute(`DELETE FROM siigo_balances WHERE product_id = '${productoId}'`);
  await db.execute(`DELETE FROM siigo_movements WHERE product_id = '${productoId}'`);
  await db.execute(`DELETE FROM products WHERE id = '${productoId}'`);

  console.log(
    `\n  ${C.bold}Resultado:${C.reset} ${C.green}${passed} correctas${C.reset}, ` +
      (failed > 0 ? `${C.red}${failed} fallidas${C.reset}` : "0 fallidas")
  );
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\nError inesperado:", error);
  process.exit(1);
});
