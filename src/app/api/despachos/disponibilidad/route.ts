import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getDispatchAvailability } from "@/lib/services/dispatch.service";

/**
 * Vista previa de la salida: ítems del recibo y lotes disponibles con la
 * propuesta FEFO. El usuario confirma antes de que se descuente el stock.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const receiptId = searchParams.get("receiptId");

    if (!receiptId) {
      return jsonOk([]);
    }

    const db = getDb();
    const data = await getDispatchAvailability(db, receiptId);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "despachos:disponibilidad:GET");
  }
}
