import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getLot } from "@/lib/services/lot.service";

/**
 * Detalle de un lote: existencias, peso, vencimiento, movimientos y
 * asignaciones a salidas y auditorías.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await params;
    const db = getDb();
    const data = await getLot(db, id);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "lotes:GET:id");
  }
}
