/** Notificaciones del usuario autenticado (el superadmin ve todas). */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notification.service";

export const runtime = "nodejs";

const readSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(params.get("limit") ?? 30), 1), 100);
    const offset = Math.max(Number(params.get("offset") ?? 0), 0);

    const result = await listNotifications(getDb(), {
      userId: user.id,
      isSuperAdmin: user.role === "SUPERADMIN",
      limit,
      offset,
    });

    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, "notificaciones:list");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = readSchema.parse(await request.json());
    const db = getDb();

    if (input.all) {
      await markAllNotificationsRead(db, {
        userId: user.id,
        isSuperAdmin: user.role === "SUPERADMIN",
      });
      return jsonOk({ ok: true });
    }

    if (!input.id) {
      return jsonOk({ error: "Indique la notificación a marcar." }, 400);
    }

    await markNotificationRead(db, {
      userId: user.id,
      isSuperAdmin: user.role === "SUPERADMIN",
      auditLogId: input.id,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "notificaciones:read");
  }
}
