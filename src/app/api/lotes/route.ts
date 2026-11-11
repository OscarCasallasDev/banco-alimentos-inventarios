import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listLots } from "@/lib/services/lot.service";
import { lotQuerySchema } from "@/lib/validations/schemas";

/**
 * Lista de lotes con filtros de vencimiento, producto, bodega y paginación.
 *
 * Cada fila es un LOTE individual: nunca un producto agrupado.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const filters = lotQuerySchema.parse(
      Object.fromEntries(searchParams.entries())
    );

    const db = getDb();
    const data = await listLots(db, filters);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "lotes:GET");
  }
}
