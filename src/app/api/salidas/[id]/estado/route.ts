/**
 * Transiciones de estado de una salida de almacén.
 *
 *   generar          → asigna el número único, toma la foto de los datos y
 *                      activa las reservas.
 *   entregar         → registra la recepción por parte de despacho.
 *   confirmar_siigo  → registra que la salida ya se anot�� en Siigo Pyme.
 *                      NO libera la reserva: eso ocurre cuando una
 *                      importación demuestra que Siigo ya descontó.
 *   anular           → anula la salida y libera sus reservas.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  cancelSalida,
  confirmInSiigo,
  deliverSalida,
  generateSalida,
} from "@/lib/services/exit.service";
import { salidaEstadoSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = salidaEstadoSchema.parse(body);

    switch (input.action) {
      case "generar": {
        const user = await requireModulePermission(
          "salidas_almacen",
          "salidas.generate"
        );
        return jsonOk(await generateSalida(id, user.id));
      }
      case "entregar": {
        await requireModulePermission("salidas_almacen", "salidas.receive");
        // La hora de recepción la registra el sistema: no se recibe del
        // cliente para que el almacenista no pueda escribirla a mano.
        return jsonOk(
          await deliverSalida(
            id,
            input.receiverName,
            input.receiverDocument
          )
        );
      }
      case "confirmar_siigo": {
        await requireModulePermission(
          "salidas_almacen",
          "salidas.confirm_siigo"
        );
        return jsonOk(await confirmInSiigo(id, input.siigoDocumentRef));
      }
      case "anular": {
        await requireModulePermission("salidas_almacen", "salidas.cancel");
        return jsonOk(
          await cancelSalida(id, input.reason ?? "Anulada por el usuario")
        );
      }
      default:
        return jsonOk(null, 400);
    }
  } catch (error) {
    return handleRouteError(error, "salidas:estado");
  }
}
