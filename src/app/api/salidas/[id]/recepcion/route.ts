/**
 * Datos de quién recibe en despacho.
 *
 * Solo la identificación de la persona que recibe (nombre y cédula).
 *
 * NO existe un campo para escribir la hora de recepción: la fecha y la
 * hora las registra el sistema automáticamente y no son editables. El
 * almacenista no decide cuándo se "registra" una recepción.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { updateReceiver } from "@/lib/services/exit.service";
import { recepcionSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    await requireModulePermission("salidas_almacen", "salidas.receive");
    const { id } = await context.params;
    const input = recepcionSchema.parse(await request.json());
    return jsonOk(await updateReceiver(id, input.receiverName, input.receiverDocument));
  } catch (error) {
    return handleRouteError(error, "salidas:recepcion");
  }
}
