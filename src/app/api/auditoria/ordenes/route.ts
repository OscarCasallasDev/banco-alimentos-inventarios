/** Auditoría de órdenes de pedido — exclusiva del superadministrador. */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { listOrderAudit } from "@/lib/services/order-audit.service";
import { orderAuditQuerySchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = orderAuditQuerySchema.parse(params);

    const result = await listOrderAudit(getDb(), {
      userId: query.userId,
      action: query.action,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });

    return jsonOk({
      items: result.items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    });
  } catch (error) {
    return handleRouteError(error, "auditoria:ordenes");
  }
}
