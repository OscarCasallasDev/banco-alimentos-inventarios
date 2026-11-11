/**
 * API del catálogo de destinos (parroquias / grupos de familia).
 *
 * Alimenta el autocompletado del campo «Destino» de la orden de pedido.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  createDestination,
  listDestinations,
  updateDestination,
} from "@/lib/services/destination.service";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().max(30).nullish(),
  name: z.string().min(2).max(150),
  type: z.string().max(30).optional(),
  isDemo: z.boolean().optional(),
  status: z.string().max(20).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/**
 * Lista de destinos.
 *
 * `?search=` filtra por coincidencias parciales (autocompletado).
 * `?all=true` incluye los destinos inactivos (administración).
 */
export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("programas", "inventory.read");
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const all = request.nextUrl.searchParams.get("all") === "true";
    const items = await listDestinations({
      search,
      onlyActive: !all,
      limit: all ? 200 : 30,
    });
    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "destinos:list");
  }
}

/** Crea un destino. */
export async function POST(request: NextRequest) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const input = bodySchema.parse(await request.json());
    const destino = await createDestination({
      code: input.code ?? null,
      name: input.name,
      type: input.type,
      isDemo: input.isDemo ?? false,
      status: input.status,
      sortOrder: input.sortOrder,
    });
    return jsonOk(destino, 201);
  } catch (error) {
    return handleRouteError(error, "destinos:create");
  }
}

/** Actualiza un destino. */
export async function PUT(request: NextRequest) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const input = bodySchema.parse(await request.json());
    const search = request.nextUrl.searchParams.get("id");
    if (!search) {
      return jsonOk({ error: "Falta el identificador del destino." }, 400);
    }
    return jsonOk(await updateDestination(search, input));
  } catch (error) {
    return handleRouteError(error, "destinos:update");
  }
}
