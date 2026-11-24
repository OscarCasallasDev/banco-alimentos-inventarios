/**
 * Notificaciones derivadas de la auditoría existente.
 *
 * No se duplican mensajes: `audit_logs` es la fuente del evento y
 * `notification_reads` guarda el estado de lectura de cada usuario.
 */

import { and, eq, sql } from "drizzle-orm";
import { auditLogs, notificationReads } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { forbiddenError, notFoundError } from "@/lib/utils/errors";

const ACTIONS = [
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "ORDER_DELETE",
  "ORDER_RECEIVE",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DEACTIVATE",
  "CONFIG_UPDATE",
  "MODULE_TOGGLE",
];

const ORDER_ACTIONS = new Set([
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "ORDER_DELETE",
  "ORDER_RECEIVE",
]);

const ACTION_FALLBACK: Record<string, string> = {
  ORDER_CREATE: "Se creó una orden de pedido",
  ORDER_UPDATE: "Se modificó una orden de pedido",
  ORDER_DELETE: "Se eliminó una orden de pedido",
  ORDER_RECEIVE: "Se registró la recepción en despacho",
  USER_CREATE: "Se registró un usuario nuevo",
  USER_UPDATE: "Se actualizó la información del usuario",
  USER_DEACTIVATE: "Se desactivó un usuario",
  CONFIG_UPDATE: "Se actualizó la configuración del sistema",
  MODULE_TOGGLE: "Se cambió el estado de un módulo",
};

export interface NotificationItem {
  id: string;
  message: string;
  actorName: string;
  createdAt: string;
  read: boolean;
  href: string;
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

function buildMessage(action: string, details: string | null): string {
  if (details) {
    try {
      const parsed = JSON.parse(details) as { summary?: unknown };
      if (typeof parsed.summary === "string" && parsed.summary.trim()) {
        return parsed.summary.trim();
      }
    } catch {
      // El detalle puede ser texto plano (por ejemplo, cambios de usuario).
    }
    if (!details.trim().startsWith("{")) return details.trim();
  }

  return ACTION_FALLBACK[action] ?? "Actividad registrada";
}

function buildHref(action: string, entityId: string | null): string {
  if (ORDER_ACTIONS.has(action) && entityId) {
    return `/salidas-almacen/${entityId}`;
  }
  return "/configuracion";
}

export async function listNotifications(
  executor: DbExecutor,
  options: {
    userId: string;
    isSuperAdmin: boolean;
    limit: number;
    offset: number;
  }
): Promise<NotificationList> {
  const { userId, isSuperAdmin, limit, offset } = options;
  const visible = isSuperAdmin
    ? sql`TRUE`
    : sql`l.user_id = ${userId}::uuid`;

  const rows = await executor.execute<{
    id: string;
    action: string;
    entity_id: string | null;
    details: string | null;
    created_at: string | Date;
    actor_name: string;
    username: string;
    read: boolean;
  }>(sql`
    SELECT
      l.id,
      l.action::text AS action,
      l.entity_id,
      l.details,
      l.created_at,
      (u.first_name || ' ' || u.last_name) AS actor_name,
      u.username,
      (r.id IS NOT NULL) AS read
    FROM audit_logs l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN notification_reads r
      ON r.audit_log_id = l.id AND r.user_id = ${userId}::uuid
    WHERE l.action::text IN (${sql.raw(ACTIONS.map((a) => `'${a}'`).join(", "))})
      AND ${visible}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const [countRow] = await executor.execute<{
    total: number;
    unread: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE r.id IS NULL)::int AS unread
    FROM audit_logs l
    LEFT JOIN notification_reads r
      ON r.audit_log_id = l.id AND r.user_id = ${userId}::uuid
    WHERE l.action::text IN (${sql.raw(ACTIONS.map((a) => `'${a}'`).join(", "))})
      AND ${visible}
  `);

  const list = (rows as unknown as {
    id: string;
    action: string;
    entity_id: string | null;
    details: string | null;
    created_at: string | Date;
    actor_name: string;
    username: string;
    read: boolean;
  }[]) ?? [];

  return {
    items: list.map((row) => ({
      id: row.id,
      message: buildMessage(row.action, row.details),
      actorName: row.actor_name?.trim() || row.username,
      createdAt: new Date(row.created_at).toISOString(),
      read: Boolean(row.read),
      href: buildHref(row.action, row.entity_id),
    })),
    total: Number((countRow as unknown as { total: number })?.total ?? 0),
    unreadCount: Number((countRow as unknown as { unread: number })?.unread ?? 0),
  };
}

export async function markNotificationRead(
  executor: DbExecutor,
  input: {
    userId: string;
    isSuperAdmin: boolean;
    auditLogId: string;
  }
): Promise<void> {
  const [log] = await executor
    .select({ id: auditLogs.id, userId: auditLogs.userId })
    .from(auditLogs)
    .where(and(eq(auditLogs.id, input.auditLogId)))
    .limit(1);

  if (!log) throw notFoundError("Notificación");
  if (!input.isSuperAdmin && log.userId !== input.userId) {
    throw forbiddenError("No puede consultar las notificaciones de otro usuario.");
  }

  await executor
    .insert(notificationReads)
    .values({ userId: input.userId, auditLogId: input.auditLogId })
    .onConflictDoNothing();
}

export async function markAllNotificationsRead(
  executor: DbExecutor,
  input: { userId: string; isSuperAdmin: boolean }
): Promise<void> {
  const visible = input.isSuperAdmin
    ? sql`TRUE`
    : sql`l.user_id = ${input.userId}::uuid`;

  await executor.execute(sql`
    INSERT INTO notification_reads (user_id, audit_log_id)
    SELECT ${input.userId}::uuid, l.id
    FROM audit_logs l
    WHERE l.action::text IN (${sql.raw(ACTIONS.map((a) => `'${a}'`).join(", "))})
      AND ${visible}
      AND NOT EXISTS (
        SELECT 1 FROM notification_reads r
        WHERE r.audit_log_id = l.id AND r.user_id = ${input.userId}::uuid
      )
    ON CONFLICT (user_id, audit_log_id) DO NOTHING
  `);
}
