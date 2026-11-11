/**
 * API de un destino concreto (desactivación / eliminación de demo).
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  deactivateDestination,
  deleteDemoDestination,
} from "@/lib/services/destination.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

/** Desactiva el destino (las órdenes históricas lo conservan). */
export async function DELETE(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const { id } = await context.params;
    return jsonOk(await deactivateDestination(id));
  } catch (error) {
    return handleRouteError(error, "destinos:deactivate");
  }
}

/** Elimina un destino de demostración sin órdenes associated. */
export async function PURGE(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const { id } = await context.params;
    await deleteDemoDestination(id);
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "destinos:purge");
  }
}
