/**
 * Procesa el reporte de Siigo previamente subido a Supabase Storage.
 *
 * Descarga el archivo, lo interpreta con el lector propio (12× más rápido que
 * SheetJS y 4× menos memoria), guarda las filas en el staging por lotes y
 * cierra la corrida calculando saldos, actualizando catálogo y existencias y
 * conciliando las reservas.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireImportAccess } from "@/lib/auth/guard";
import { downloadFile, removeFile } from "@/lib/supabase/storage";
import {
  normalizeReport,
  saveBatch,
  saveResumenRows,
  finalizeRun,
} from "@/lib/services/siigo-import.service";
import type { WireMovementRow } from "@/lib/services/siigo-import.service";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  path: z.string().min(1).max(400),
});

/** Filas por lote al guardar en el staging. */
const BATCH_SIZE = 5_000;

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireImportAccess(request);
    const { id } = await context.params;
    const { path } = bodySchema.parse(await request.json());

    const buffer = await downloadFile(path);
    if (!buffer) {
      return jsonOk(
        { error: "No se pudo descargar el archivo desde el almacenamiento." },
        404
      );
    }

    // ---------- Interpretación (detecta el tipo de reporte) ----------
    const report = normalizeReport(buffer);

    // Reporte «Resumen por bodega»: actualiza bodegas, ubicaciones y
    // productos. NO contiene saldos, así que no toca las existencias.
    if (report.format === "RESUMEN") {
      await saveResumenRows(id, report.resumen);
      const resumenSummary = await finalizeRun(id, report);
      await removeFile(path);

      return jsonOk({
        ...resumenSummary,
        reportFormat: "RESUMEN",
        parsed: {
          scannedRows: report.stats.scannedRows,
          dataRows: report.stats.dataRows,
          warehouses: report.stats.warehouses,
          locations: report.stats.locations,
          products: report.stats.products,
          meta: report.meta,
        },
      });
    }

    // ---------- Guardado por lotes ----------
    const wireRows: WireMovementRow[] = report.movements.map((row) => ({
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

    let batchIndex = 0;
    for (let i = 0; i < wireRows.length; i += BATCH_SIZE) {
      const chunk = wireRows.slice(i, i + BATCH_SIZE);
      await saveBatch(id, batchIndex, chunk);
      batchIndex++;
    }

    // ---------- Cierre ----------
    const summary = await finalizeRun(id, report);

    // El archivo ya se procesó: se retira del almacenamiento.
    await removeFile(path);

    return jsonOk({
      ...summary,
      reportFormat: "DETAILED",
      parsed: {
        scannedRows: report.stats.scannedRows,
        dataRows: report.stats.dataRows,
        warehouses: report.stats.warehouses,
        locations: report.stats.locations,
        products: report.stats.products,
        meta: report.meta,
      },
      batches: batchIndex,
    });
  } catch (error) {
    return handleRouteError(error, "siigo:process-file");
  }
}
