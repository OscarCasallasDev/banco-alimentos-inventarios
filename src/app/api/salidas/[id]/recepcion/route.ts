/**
 * Confirmación de la recepción en despacho.
 *
 * Registra quién recibe la orden (nombre y cédula) y deja constancia de
 * que la firma quedó hecha sobre el documento impreso.
 *
 * La FECHA y la HORA las genera el sistema de forma automática: no existe
 * ningún campo editable para escribirlas a mano.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { confirmReception } from "@/lib/services/exit.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { recepcionSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await requireModulePermission("salidas_almacen", "salidas.receive");
    const { id } = await context.params;
    const input = recepcionSchema.parse(await request.json());
    const salida = await confirmReception(
      id,
      input.receiverName,
      input.receiverDocument
    );

    const actorName = `${user.firstName} ${user.lastName}`.trim();
    await recordAuditLog(getDb(), {
      userId: user.id,
      action: "ORDER_RECEIVE",
      entity: "salidas",
      entityId: salida.id,
      details: JSON.stringify({
        actorName,
        orderNumber: salida.number,
        summary: `${actorName} registró la información de recepción de la orden ${salida.number}`,
      }),
    });

    return jsonOk(salida);
  } catch (error) {
    return handleRouteError(error, "salidas:recepcion");
  }
}
