import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listUnits } from "@/lib/services/catalog.service";

/**
 * Catálogo de unidades de medida.
 */
export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listUnits(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "unidades:GET");
  }
}
