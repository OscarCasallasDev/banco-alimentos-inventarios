/**
 * Importación del reporte «RESUMEN DE MOVIMIENTO POR BODEGA» de Siigo Pyme.
 *
 * Uso:
 *   npm run siigo:import -- "tests\fixtures\siigo-reporte-resumido.xlsx"
 *
 * Este reporte actualiza el catálogo de bodegas, ubicaciones y productos, y
 * guarda los MOVIMIENTOS agregados del periodo. NO contiene saldos: por eso
 * no toca las existencias (esas vienen del reporte detallado).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { normalizeReport } from "../src/lib/services/siigo-import.service";
import {
  createRun,
  saveResumenRows,
  finalizeRun,
} from "../src/lib/services/siigo-import.service";
import { getDb } from "../src/lib/db/client";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!fileArg) {
    console.error("Uso: npm run siigo:import -- <archivo.xlsx>");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const buffer = fs.readFileSync(filePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  console.log(`\n=== Importación de Siigo Pyme ===\n`);
  console.log(`Archivo : ${path.basename(filePath)} (${(buffer.length / 1048576).toFixed(2)} MB)`);
  console.log(`SHA-256 : ${sha256}`);

  const t0 = Date.now();
  const report = normalizeReport(buffer);
  console.log(`\nFormato detectado : ${report.format}`);
  console.log(`Filas leídas      : ${report.stats.scannedRows}`);
  console.log(`Filas de datos   : ${report.stats.dataRows}`);
  console.log(`Bodegas          : ${report.stats.warehouses}`);
  console.log(`Ubicaciones      : ${report.stats.locations}`);
  console.log(`Productos        : ${report.stats.products}`);
  console.log(`Interpretación   : ${Date.now() - t0} ms`);
  console.log(
    `Periodo          : ${report.meta.periodFrom ?? "?"} → ${report.meta.periodTo ?? "?"}`
  );
  console.log(`Reporte del      : ${report.meta.reportDate ?? "?"}`);

  if (report.format === "RESUMEN") {
    console.log(
      "\n⚠  Este reporte es un RESUMEN DE MOVIMIENTOS: no contiene saldos.\n" +
        "   Se actualizan bodegas, ubicaciones y productos; las existencias\n" +
        "   NO se modifican (vienen del reporte detallado)."
    );
  }

  getDb();

  const run = await createRun(
    {
      fileSha256: sha256,
      fileName: path.basename(filePath),
      fileSize: buffer.length,
      source: "MANUAL",
      reportFormat: report.format,
      force: process.argv.includes("--force"),
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
    console.log(`\nEl archivo ya se había importado (corrida ${run.id}).\n`);
    return;
  }

  if (report.format === "RESUMEN") {
    await saveResumenRows(run.id, report.resumen);
  } else {
    const { saveBatch } = await import("../src/lib/services/siigo-import.service");
    const BATCH = 20_000;
    let index = 0;
    for (let i = 0; i < report.movements.length; i += BATCH) {
      await saveBatch(
        run.id,
        index,
        report.movements.slice(i, i + BATCH).map((row) => ({
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
        }))
      );
      index++;
    }
  }

  const t1 = Date.now();
  const summary = await finalizeRun(run.id, report);

  console.log(`\n--- Resultado ---`);
  console.log(`Estado      : ${summary.status}`);
  console.log(`Productos   : ${summary.productsCount}`);
  console.log(`Saldos      : ${summary.balancesCount}`);
  console.log(`Movimientos : ${summary.movementsCount}`);
  console.log(`Duración    : ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
