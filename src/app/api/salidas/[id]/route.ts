/**
 * API de una salida concreta.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  deleteSalida,
  getSalida,
  updateSalidaDraft,
} from "@/lib/services/exit.service";
import { updateSalidaSchema } from "@/lib/validations/schemas";
import { getDb } from "@/lib/db/client";
import {
  diffSalida,
  orderSnapshot,
  recordOrderAudit,
} from "@/lib/services/order-audit.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("salidas_almacen", "salidas.read");
    const { id } = await context.params;
    return jsonOk(await getSalida(getDb(), id));
  } catch (error) {
    return handleRouteError(error, "salidas:get");
  }
}

/** Edita una salida en borrador. */
export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await requireModulePermission("salidas_almacen", "salidas.edit");
    const { id } = await context.params;
    const input = updateSalidaSchema.parse(await request.json());

    const db = getDb();
    const before = await getSalida(db, id);
    const updated = await updateSalidaDraft(id, input);
    const changes = diffSalida(before, updated);

    if (changes.length > 0) {
      const actorName = `${user.firstName} ${user.lastName}`.trim();
      await recordOrderAudit(db, {
        userId: user.id,
        action: "EDITO",
        orderId: updated.id,
        orderNumber: updated.number,
        actorName,
        summary: `${actorName} editó la orden ${updated.number}`,
        changes,
      });
    }

    return jsonOk(updated);
  } catch (error) {
    return handleRouteError(error, "salidas:update");
  }
}

/**
 * Elimina una salida.
 *
 * Las órdenes ya confirmadas en Siigo Pyme no se borran físicamente: se
 * ocultan del listado y conservan su historial (borrado lógico).
 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const user = await requireModulePermission("salidas_almacen", "salidas.edit");
    const { id } = await context.params;

    const db = getDb();
    const before = await getSalida(db, id);
    const result = await deleteSalida(id, user.id);

    if (!before.deletedAt) {
      const actorName = `${user.firstName} ${user.lastName}`.trim();
      await recordOrderAudit(db, {
        userId: user.id,
        action: "ELIMINO",
        orderId: before.id,
        orderNumber: before.number,
        actorName,
        summary: `${actorName} eliminó la orden ${before.number}`,
        snapshot: orderSnapshot(before),
      });
    }

    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, "salidas:delete");
  }
}
