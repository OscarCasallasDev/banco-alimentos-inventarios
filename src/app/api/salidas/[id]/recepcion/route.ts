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
import { confirmReception } from "@/lib/services/exit.service";
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
    return jsonOk(
      await confirmReception(id, input.receiverName, input.receiverDocument)
    );
  } catch (error) {
    return handleRouteError(error, "salidas:recepcion");
  }
}
