/**
 * API de programas / destinos.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  createProgram,
  listPrograms,
} from "@/lib/services/program.service";
import { programSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

/** Lista de programas. */
export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("programas", "inventory.read");
    const onlyActive =
      request.nextUrl.searchParams.get("all") !== "true" &&
      request.nextUrl.searchParams.get("status") !== "INACTIVE";
    const items = await listPrograms(onlyActive);
    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "programas:list");
  }
}

/** Crea un programa. */
export async function POST(request: NextRequest) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const body = await request.json();
    const input = programSchema.parse(body);
    const program = await createProgram(input);
    return jsonOk(program, 201);
  } catch (error) {
    return handleRouteError(error, "programas:create");
  }
}
