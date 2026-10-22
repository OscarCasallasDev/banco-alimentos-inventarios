import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listCostCenters } from "@/lib/services/catalog.service";

/**
 * Catálogo de centros de costo.
 * El catálogo lo carga el Banco; mientras está vacío, el campo del
 * comprobante puede quedar en blanco.
 */
export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listCostCenters(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "centros-costo:GET");
  }
}
