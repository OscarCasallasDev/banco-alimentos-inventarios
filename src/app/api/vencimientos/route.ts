/**
 * API de Vencimientos y Alertas.
 *
 * GET  → resumen de alertas, rangos calculados y listado filtrado.
 * POST → importación de filas normalizadas de vencimientos.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  getAlertsSummary,
  getDiscrepancies,
  listVencimientoImports,
  listVencimientos,
  vencimientoRanges,
} from "@/lib/services/vencimiento.service";

export const runtime = "nodejs";

const querySchema = z.object({
  category: z
    .enum(["next_week", "current_week", "expired", "next_15", "next_30", "all"])
    .optional()
    .default("next_week"),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("vencimientos", "inventory.read");

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = querySchema.parse(params);

    const [summary, discrepancies, items, imports] = await Promise.all([
      getAlertsSummary(),
      getDiscrepancies(),
      listVencimientos({
        category: query.category,
        search: query.search,
        page: query.page - 1,
        pageSize: query.pageSize,
      }),
      listVencimientoImports(),
    ]);

    return jsonOk({
      summary,
      discrepancies,
      ranges: vencimientoRanges(),
      items: items.items,
      total: items.total,
      range: items.range,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: items.total,
        totalPages: Math.ceil(items.total / query.pageSize),
      },
      imports,
    });
  } catch (error) {
    return handleRouteError(error, "vencimientos:list");
  }
}
