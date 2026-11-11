/**
 * API de importaciones desde Siigo Pyme.
 *
 * POST  → crea (o recupera) la corrida de importación.
 * GET   → historial de importaciones.
 *
 * La idempotencia está garantizada por el hash SHA-256 del archivo: si el
 * mismo archivo ya se importó con éxito, la API devuelve la corrida previa
 * y NO vuelve a procesar nada.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { readJsonBody } from "@/lib/api/request-body";
import { requireImportAccess, requireModulePermission } from "@/lib/auth/guard";
import {
  createRun,
  getLastSuccessfulRun,
  listRuns,
} from "@/lib/services/siigo-import.service";
import { createSiigoRunSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Historial de importaciones + estado de la última sincronización. */
export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("integracion_siigo", "siigo.import.read");

    const params = request.nextUrl.searchParams;
    const limit = Math.min(Number(params.get("limit") ?? 20), 100);
    const offset = Math.max(Number(params.get("offset") ?? 0), 0);

    const [history, lastSuccessful] = await Promise.all([
      listRuns(limit, offset),
      getLastSuccessfulRun(),
    ]);

    const staleMinutes = Number(process.env.SYNC_STALE_MINUTES ?? 60);
    const lastSyncAt = lastSuccessful?.finishedAt ?? null;
    const minutesSinceSync = lastSyncAt
      ? (Date.now() - lastSyncAt.getTime()) / 60000
      : null;

    return jsonOk({
      items: history.items,
      total: history.total,
      lastSuccessful,
      staleMinutes,
      minutesSinceSync,
      isStale:
        minutesSinceSync === null ? true : minutesSinceSync > staleMinutes,
    });
  } catch (error) {
    return handleRouteError(error, "siigo:historial");
  }
}

/** Crea la corrida de importación. */
export async function POST(request: NextRequest) {
  try {
    await requireImportAccess(request);
    const input = createSiigoRunSchema.parse(await readJsonBody(request));
    const run = await createRun(input, null);
    return jsonOk(run, run.alreadyProcessed ? 200 : 201);
  } catch (error) {
    return handleRouteError(error, "siigo:create-run");
  }
}
