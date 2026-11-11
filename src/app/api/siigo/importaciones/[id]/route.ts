/**
 * Detalle de una corrida de importación.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  getRun,
  getRunRejections,
} from "@/lib/services/siigo-import.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("integracion_siigo", "siigo.import.read");
    const { id } = await context.params;
    const run = await getRun(id);
    if (!run) {
      return jsonOk(null, 404);
    }
    const rejections = await getRunRejections(id, 200);
    return jsonOk({ run, rejections });
  } catch (error) {
    return handleRouteError(error, "siigo:run-detail");
  }
}
