import { getDb } from "@/lib/db/client";
import { requireModuleAccess } from "@/lib/auth/guard";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getDashboardSummary } from "@/lib/services/dashboard.service";

export async function GET() {
  try {
    await requireModuleAccess("dashboard");

    const db = getDb();
    const data = await getDashboardSummary(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "dashboard:GET");
  }
}
