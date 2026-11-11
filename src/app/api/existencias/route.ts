/**
 * API de existencias CONSOLIDADAS.
 *
 * Agrupa por descripción exacta + unidad + bodega, sumando las ubicaciones.
 * Los registros originales por ubicación se conservan intactos en
 * `siigo_balances` (la consolidación es una vista derivada).
 *
 * Devuelve TODOS los productos que existan en el inventario importado,
 * incluidos los que tienen cantidad cero o negativa. Cada fila indica si se
 * puede agregar a una orden (`canAdd`: disponibilidad > 0).
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { listConsolidatedStock } from "@/lib/services/stock.service";
import { existenciasQuerySchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("inventario", "inventory.read");

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = existenciasQuerySchema.parse(params);

    const result = await listConsolidatedStock({
      search: query.search,
      siigoBodegaCode: query.siigoBodegaCode,
      warehouseId: query.warehouseId,
      availability: query.availability,
      page: query.page - 1,
      pageSize: query.pageSize,
    });

    return jsonOk({
      items: result.items,
      totals: result.totals,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    });
  } catch (error) {
    return handleRouteError(error, "existencias:list");
  }
}
