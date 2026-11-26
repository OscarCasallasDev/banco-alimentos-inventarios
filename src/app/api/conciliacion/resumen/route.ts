/** Resumen de la última comparación entre importaciones (solo superadmin). */

import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { getLatestReconciliationSummary } from "@/lib/services/reconciliation-alert.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdmin();
    const data = await getLatestReconciliationSummary(getDb());
    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "conciliacion:resumen:GET");
  }
}
