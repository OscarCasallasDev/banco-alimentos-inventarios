/** Gestión de una alerta de conciliación (solo superadministrador). */

import { z } from "zod";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { reviewReconciliationAlert } from "@/lib/services/reconciliation-alert.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["validate", "review"]),
  note: z.string().max(1000).nullish(),
});

interface Context {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { id } = await context.params;
    const input = bodySchema.parse(await request.json());

    await reviewReconciliationAlert(
      getDb(),
      id,
      user.id,
      input.action,
      input.note ?? null
    );

    return jsonOk({ id, action: input.action });
  } catch (error) {
    return handleRouteError(error, "conciliacion:alertas:PATCH");
  }
}
