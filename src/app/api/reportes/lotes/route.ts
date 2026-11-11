import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listLots } from "@/lib/services/lot.service";
import { lotReportQuerySchema } from "@/lib/validations/schemas";

/**
 * Reporte de lotes por fecha de vencimiento.
 *
 * Cada fila es un LOTE individual con su propia cantidad y su propio peso.
 * Los filtros se aplican en el backend y la consulta está paginada.
 *
 * El filtro "mañana" devuelve exactamente los lotes cuyo vencimiento
 * corresponde a mañana, no el producto agrupado.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const filters = lotReportQuerySchema.parse(
      Object.fromEntries(searchParams.entries())
    );

    const db = getDb();
    const data = await listLots(db, filters);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "reportes:lotes:GET");
  }
}
