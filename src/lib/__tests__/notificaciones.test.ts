/** Pruebas específicas de notificaciones persistentes y permisos. */

import { describe, it, expect, afterAll } from "vitest";
import { getDb, closeDb, type DbTransaction } from "@/lib/db/client";
import { createUser } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notification.service";

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

class RollbackSignal extends Error {
  constructor(public readonly result: unknown) {
    super("rollback");
  }
}

async function enTransaccion<T>(
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const result = await fn(tx);
      throw new RollbackSignal(result);
    });
  } catch (error) {
    if (error instanceof RollbackSignal) return error.result as T;
    throw error;
  }
}

describeDb("Notificaciones", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("cada usuario ve solo sus notificaciones y el superadmin ve todas", async () => {
    await enTransaccion(async (tx) => {
      const normal = await createUser(tx, {
        firstName: "Pepito",
        lastName: "Pérez",
        cedula: "555555555",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: [],
      });
      const otro = await createUser(tx, {
        firstName: "Oscar",
        lastName: "Casallas",
        cedula: "666666666",
        password: "Banco2026!",
        role: "SUPERADMIN",
        modules: [],
      });

      await recordAuditLog(tx, {
        userId: normal.id,
        action: "ORDER_RECEIVE",
        entity: "salidas",
        entityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        details: JSON.stringify({
          actorName: "Pepito Pérez",
          orderNumber: "OP-2026-0054",
          summary:
            "Pepito Pérez registró la información de recepción de la orden OP-2026-0054",
        }),
      });
      await recordAuditLog(tx, {
        userId: otro.id,
        action: "USER_UPDATE",
        entity: "users",
        details: "Oscar Casallas actualizó su cédula",
      });

      const propias = await listNotifications(tx, {
        userId: normal.id,
        isSuperAdmin: false,
        limit: 20,
        offset: 0,
      });
      expect(propias.total).toBe(1);
      expect(propias.items[0].message).toContain("OP-2026-0054");
      expect(propias.items[0].href).toContain("/salidas-almacen/");

      const global = await listNotifications(tx, {
        userId: otro.id,
        isSuperAdmin: true,
        limit: 20,
        offset: 0,
      });
      expect(global.total).toBeGreaterThanOrEqual(2);
      expect(global.unreadCount).toBeGreaterThanOrEqual(2);
      expect(
        global.items.some((item) => item.message.includes("Oscar Casallas"))
      ).toBe(true);
      expect(
        global.items.some((item) => item.message.includes("Pepito Pérez"))
      ).toBe(true);
      expect(global.items.every((item) => !item.message.includes("Banco2026!"))).toBe(
        true
      );
    });
  });

  it("marca una o todas las notificaciones como leídas", async () => {
    await enTransaccion(async (tx) => {
      const usuario = await createUser(tx, {
        firstName: "Laura",
        lastName: "Gómez",
        cedula: "777777777",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: [],
      });

      await recordAuditLog(tx, {
        userId: usuario.id,
        action: "ORDER_CREATE",
        entity: "salidas",
        entityId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        details: JSON.stringify({
          summary: "Laura Gómez creó la orden OP-2026-0055",
          orderNumber: "OP-2026-0055",
        }),
      });
      await recordAuditLog(tx, {
        userId: usuario.id,
        action: "USER_UPDATE",
        entity: "users",
        details: "Laura Gómez actualizó su contraseña",
      });

      const inicial = await listNotifications(tx, {
        userId: usuario.id,
        isSuperAdmin: false,
        limit: 20,
        offset: 0,
      });
      expect(inicial.unreadCount).toBe(2);

      await markNotificationRead(tx, {
        userId: usuario.id,
        isSuperAdmin: false,
        auditLogId: inicial.items[0].id,
      });
      const unaLeida = await listNotifications(tx, {
        userId: usuario.id,
        isSuperAdmin: false,
        limit: 20,
        offset: 0,
      });
      expect(unaLeida.unreadCount).toBe(1);

      await markAllNotificationsRead(tx, {
        userId: usuario.id,
        isSuperAdmin: false,
      });
      const todas = await listNotifications(tx, {
        userId: usuario.id,
        isSuperAdmin: false,
        limit: 20,
        offset: 0,
      });
      expect(todas.unreadCount).toBe(0);
      expect(todas.items.every((item) => item.read)).toBe(true);
    });
  });
});
