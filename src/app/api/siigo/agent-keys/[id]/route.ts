/**
 * Revocación de una clave del agente local.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { revokeAgentKey } from "@/lib/services/siigo-import.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission(
      "integracion_siigo",
      "siigo.map_warehouses"
    );
    const { id } = await context.params;
    await revokeAgentKey(id);
    return jsonOk({ revoked: true });
  } catch (error) {
    return handleRouteError(error, "siigo:agent-key-revoke");
  }
}
