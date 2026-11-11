import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listProductLots } from "@/lib/services/lot.service";

/**
 * Lotes de un producto: cada fila es un ingreso distinto, con su cantidad,
 * su peso y su fecha de vencimiento.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await params;
    const db = getDb();
    const data = await listProductLots(db, id);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "productos:lotes:GET");
  }
}
