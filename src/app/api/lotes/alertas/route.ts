import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getExpiryAlerts } from "@/lib/services/lot.service";

/**
 * Alertas de vencimiento calculadas con la fecha local del Banco.
 *
 * Solo incluye lotes con existencia: un lote agotado no genera alerta
 * operativa de mercancía por vencer.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const horizon = Number(searchParams.get("horizon") ?? "");
    const limit = Number(searchParams.get("limit") ?? "");
    const includeMissingExpiry =
      searchParams.get("includeMissingExpiry") === "true";

    const db = getDb();
    const data = await getExpiryAlerts(db, {
      horizonDays: Number.isFinite(horizon) && horizon > 0 ? horizon : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      includeMissingExpiry,
    });

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "lotes:alertas:GET");
  }
}
