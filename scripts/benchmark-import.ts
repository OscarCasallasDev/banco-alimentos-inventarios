/**
 * Medición del rendimiento de la importación con el archivo real.
 *
 * Mide por separado:
 *   - la interpretación del .xlsx (el paso que más CPU consume),
 *   - el guardado del staging,
 *   - el cierre (saldos, catálogo, movimientos y conciliación).
 *
 * Uso:
 *   npm run bench:import -- "tests\fixtures\siigo-reporte-inventarios.xlsx"
 *   npm run bench:import -- "archivo.xlsx" --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { parseSiigoReport } from "../src/lib/siigo/import/parser";
import { computeGroupBalances } from "../src/lib/siigo/import/balances";
import { validateRows } from "../src/lib/siigo/import/validator";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!fileArg) {
    console.error("Uso: npm run bench:import -- <archivo.xlsx> [--dry-run]");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const buffer = fs.readFileSync(filePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  console.log(`\n=== Rendimiento de la importación ===\n`);
  console.log(`Archivo : ${path.basename(filePath)} (${mb(buffer.length)})`);
  console.log(`SHA-256 : ${sha256}`);

  // ---------- Interpretación ----------
  const heapBefore = process.memoryUsage().heapUsed;
  let t = Date.now();
  const report = parseSiigoReport(buffer);
  const parseMs = Date.now() - t;
  const heapAfter = process.memoryUsage().heapUsed;

  console.log(`\n--- Interpretación ---`);
  console.log(`Tiempo            : ${parseMs} ms`);
  console.log(`Memoria (heap)    : ${mb(heapAfter - heapBefore)}`);
  console.log(`Memoria (rss)     : ${mb(process.memoryUsage().rss)}`);
  console.log(`Filas leídas      : ${report.stats.scannedRows}`);
  console.log(`Filas de datos   : ${report.stats.dataRows}`);
  console.log(
    `Rendimiento       : ${Math.round(
      (report.stats.dataRows / parseMs) * 1000
    ).toLocaleString("es-CO")} filas/s`
  );

  // ---------- Validación ----------
  t = Date.now();
  const validation = validateRows(report.rows);
  console.log(`\n--- Validación (${Date.now() - t} ms) ---`);
  console.log(`Admitidas  : ${validation.accepted.length}`);
  console.log(
    `Rechazadas : ${new Set(validation.rejections.map((r) => r.rowNumber)).size}`
  );
  console.log(`Advertencias: ${validation.warnings.length}`);

  // ---------- Saldos ----------
  t = Date.now();
  const computation = computeGroupBalances(validation.accepted);
  console.log(`\n--- Saldos (${Date.now() - t} ms) ---`);
  console.log(`Grupos             : ${computation.stats.groups}`);
  console.log(`Consistentes       : ${computation.stats.groupsConsistent}`);
  console.log(`En revisión        : ${computation.stats.groupsUnderReview}`);
  console.log(`Con saldo negativo : ${computation.stats.negativeGroups}`);

  if (dryRun) {
    console.log("\n[--dry-run] No se escribió nada en la base de datos.\n");
    return;
  }

  // ---------- Persistencia ----------
  const { createRun, saveBatch, finalizeRun } = await import(
    "../src/lib/services/siigo-import.service"
  );
  const { getDb } = await import("../src/lib/db/client");
  getDb();

  const run = await createRun(
    {
      fileSha256: sha256,
      fileName: path.basename(filePath),
      fileSize: buffer.length,
      source: "MANUAL",
      meta: {
        reportDate: report.meta.reportDate,
        periodFrom: report.meta.periodFrom,
        periodTo: report.meta.periodTo,
        generatedAt: report.meta.generatedAt,
      },
    },
    null
  );

  if (run.alreadyProcessed) {
    console.log(
      `\nEl archivo ya se había importado (corrida ${run.id}). No se procesa de nuevo.\n`
    );
    return;
  }

  const BATCH = 20_000;
  t = Date.now();
  let batches = 0;
  for (let i = 0; i < report.rows.length; i += BATCH) {
    const chunk = report.rows.slice(i, i + BATCH).map((row) => ({
      rowNumber: row.rowNumber,
      productCode: row.productCode,
      productName: row.productName,
      reference: row.reference,
      unit: row.unit,
      brand: row.brand,
      description: row.description,
      document: row.document,
      date: row.date,
      isOpening: row.isOpening,
      bodega: row.bodega,
      ubicacion: row.ubicacion,
      qtyBefore: row.qtyBefore,
      qtyIn: row.qtyIn,
      qtyOut: row.qtyOut,
      qtyNet: row.qtyNet,
      qtyAccum: row.qtyAccum,
      valueMovement: row.valueMovement,
      qty2In: row.qty2In,
      qty2Out: row.qty2Out,
      qty2Balance: row.qty2Balance,
    }));
    await saveBatch(run.id, batches, chunk);
    batches++;
  }
  const stagingMs = Date.now() - t;

  t = Date.now();
  const summary = await finalizeRun(run.id);
  const finalizeMs = Date.now() - t;

  console.log(`\n--- Persistencia ---`);
  console.log(`Staging   : ${(stagingMs / 1000).toFixed(1)} s (${batches} lotes)`);
  console.log(`Cierre    : ${(finalizeMs / 1000).toFixed(1)} s`);
  console.log(`TOTAL     : ${((parseMs + stagingMs + finalizeMs) / 1000).toFixed(1)} s`);
  console.log(
    `Rendimiento: ${Math.round(
      (report.stats.dataRows / (parseMs + stagingMs + finalizeMs)) * 1000
    ).toLocaleString("es-CO")} filas/s`
  );
  console.log(`\nEstado: ${summary.status} · ${summary.processedRows} procesadas`);
  console.log(
    `Productos ${summary.productsCount} · Saldos ${summary.balancesCount} · ` +
      `Movimientos ${summary.movementsCount} · Revisión ${summary.groupsReview}`
  );
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
