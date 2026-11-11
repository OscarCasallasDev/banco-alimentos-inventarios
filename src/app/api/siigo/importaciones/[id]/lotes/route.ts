/**
 * Recepción de un lote de filas normalizadas del reporte de Siigo.
 *
 * Es idempotente: reenviar el mismo lote actualiza las filas en vez de
 * duplicarlas (restricción UNIQUE sobre `run_id` + `row_number`).
 *
 * El agente local envía los lotes en este formato para no tener que cargar
 * 75.000 filas en memoria de una sola vez.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { readJsonBody } from "@/lib/api/request-body";
import { requireImportAccess } from "@/lib/auth/guard";
import { saveBatch } from "@/lib/services/siigo-import.service";
import { siigoBatchSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireImportAccess(request);
    const { id } = await context.params;
    const input = siigoBatchSchema.parse(await readJsonBody(request));
    const result = await saveBatch(id, input.batchIndex, input.rows);
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, "siigo:save-batch");
  }
}
