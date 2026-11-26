/** Alertas de conciliación de inventario (solo superadministrador). */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { listReconciliationAlerts } from "@/lib/services/reconciliation-alert.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") ?? 50),
      100
    );
    const data = await listReconciliationAlerts(getDb(), limit);
    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "conciliacion:alertas:GET");
  }
}
