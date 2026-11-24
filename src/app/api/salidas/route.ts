/**
 * API de salidas de almacén.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import {
  createSalida,
  getSalidasSummary,
  listSalidas,
} from "@/lib/services/exit.service";
import {
  orderSnapshot,
  recordOrderAudit,
} from "@/lib/services/order-audit.service";
import { createSalidaSchema, salidaQuerySchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

/** Lista de salidas con filtros. */
export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("salidas_almacen", "salidas.read");

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = salidaQuerySchema.parse(params);

    const result = await listSalidas({
      status: query.status,
      programId: query.programId,
      search: query.search,
      userId: query.userId,
      page: query.page - 1,
      pageSize: query.pageSize,
    });

    const summary = await getSalidasSummary();

    return jsonOk({
      items: result.items,
      summary,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    });
  } catch (error) {
    return handleRouteError(error, "salidas:list");
  }
}

/** Crea una salida en borrador. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireModulePermission("salidas_almacen", "salidas.create");
    const input = createSalidaSchema.parse(await request.json());
    const salida = await createSalida(input, user);

    const actorName = `${user.firstName} ${user.lastName}`.trim();
    await recordOrderAudit(getDb(), {
      userId: user.id,
      action: "CREO",
      orderId: salida.id,
      orderNumber: salida.number,
      actorName,
      summary: `${actorName} creó la orden ${salida.number}`,
      snapshot: orderSnapshot(salida),
    });

    return jsonOk(salida, 201);
  } catch (error) {
    return handleRouteError(error, "salidas:create");
  }
}
