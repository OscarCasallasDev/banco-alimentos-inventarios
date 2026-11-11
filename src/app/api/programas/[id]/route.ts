/**
 * API de un programa concreto.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  deactivateProgram,
  getProgram,
  updateProgram,
} from "@/lib/services/program.service";
import { updateProgramSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("programas", "inventory.read");
    const { id } = await context.params;
    return jsonOk(await getProgram(id));
  } catch (error) {
    return handleRouteError(error, "programas:get");
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const { id } = await context.params;
    const input = updateProgramSchema.parse(await request.json());
    return jsonOk(await updateProgram(id, input));
  } catch (error) {
    return handleRouteError(error, "programas:update");
  }
}

/** Desactiva el programa (no se borra: el histórico lo referencia). */
export async function DELETE(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("programas", "programs.manage");
    const { id } = await context.params;
    return jsonOk(await deactivateProgram(id));
  } catch (error) {
    return handleRouteError(error, "programas:deactivate");
  }
}
