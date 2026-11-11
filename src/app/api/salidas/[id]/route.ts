/**
 * API de una salida concreta.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { getSalida, updateSalidaDraft } from "@/lib/services/exit.service";
import { updateSalidaSchema } from "@/lib/validations/schemas";
import { getDb } from "@/lib/db/client";

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
    await requireModulePermission("salidas_almacen", "salidas.edit");
    const { id } = await context.params;
    const input = updateSalidaSchema.parse(await request.json());
    return jsonOk(await updateSalidaDraft(id, input));
  } catch (error) {
    return handleRouteError(error, "salidas:update");
  }
}
