import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getDashboardSummary } from "@/lib/services/dashboard.service";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await getDashboardSummary(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "dashboard:GET");
  }
}
