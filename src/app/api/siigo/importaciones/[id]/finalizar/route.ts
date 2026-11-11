/**
 * Cierre de la corrida de importación.
 *
 * Calcula los saldos, actualiza catálogo, existencias y movimientos, registra
 * las diferencias y libera las reservas que la importación demuestra.
 *
 * Todo ocurre dentro de una única transacción: si algo falla, el inventario
 * anterior queda intacto.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireImportAccess } from "@/lib/auth/guard";
import { finalizeRun } from "@/lib/services/siigo-import.service";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireImportAccess(request);
    const { id } = await context.params;
    const summary = await finalizeRun(id);
    return jsonOk(summary);
  } catch (error) {
    return handleRouteError(error, "siigo:finalize");
  }
}
