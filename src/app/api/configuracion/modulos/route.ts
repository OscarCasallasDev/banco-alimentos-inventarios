/**
 * API de banderas de módulo.
 *
 * Permite activar o desactivar módulos de forma REVERSIBLE, sin tocar
 * código: las rutas, las tablas y los datos de los módulos en espera
 * permanecen intactos.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  listFeatureFlags,
  setFeatureFlag,
} from "@/lib/config/features";
import { MODULES, MODULE_ORDER } from "@/lib/config/modules";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  key: z.string().min(1).max(80),
  enabled: z.boolean(),
});

/** Lista las banderas con su estado y el módulo al que pertenecen. */
export async function GET() {
  try {
    await requireModulePermission("configuracion", "settings.manage");
    const flags = await listFeatureFlags();
    const map = new Map(flags.map((flag) => [flag.key, flag]));

    const items = MODULE_ORDER.map((key) => {
      const definition = MODULES[key];
      const flag = map.get(definition.flag);
      return {
        key: definition.flag,
        module: key,
        label: definition.label,
        description: definition.description,
        status: definition.status,
        roles: definition.roles,
        enabled: flag?.enabled ?? false,
      };
    });

    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "features:list");
  }
}

/** Activa o desactiva un módulo. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireModulePermission("configuracion", "modules.toggle");
    const input = bodySchema.parse(await request.json());

    const known = MODULE_ORDER.some(
      (key) => MODULES[key].flag === input.key
    );
    if (!known) {
      return jsonOk(
        { error: `La bandera "${input.key}" no corresponde a ningún módulo.` },
        400
      );
    }

    await setFeatureFlag(input.key, input.enabled, user.id);
    return jsonOk({ key: input.key, enabled: input.enabled });
  } catch (error) {
    return handleRouteError(error, "features:update");
  }
}
