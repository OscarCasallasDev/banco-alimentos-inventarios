import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getReportSummary } from "@/lib/services/report.service";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await getReportSummary(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "reportes:GET");
  }
}
