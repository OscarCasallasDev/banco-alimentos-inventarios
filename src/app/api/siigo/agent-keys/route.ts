/**
 * API de claves del agente local de sincronización.
 *
 * La clave se guarda SOLO hasheada (SHA-256). El valor en texto plano se
 * devuelve una única vez, al crearla, para que el administrador lo copie en
 * el `config.json` del agente.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  createAgentKey,
  listAgentKeys,
} from "@/lib/services/siigo-import.service";
import { agentKeySchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireModulePermission("integracion_siigo", "siigo.import.read");
    const items = await listAgentKeys();
    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "siigo:agent-keys");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireModulePermission(
      "integracion_siigo",
      "siigo.map_warehouses"
    );
    const input = agentKeySchema.parse(await request.json());
    const created = await createAgentKey(input.label, user.id);
    return jsonOk(created, 201);
  } catch (error) {
    return handleRouteError(error, "siigo:agent-key-create");
  }
}
