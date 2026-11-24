import { getDb, withTransaction } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { checkDatabaseConnection } from "@/lib/db/connection";
import { products } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  getExpirationThresholds,
  listSystemSettings,
  updateExpirationSettings,
} from "@/lib/config/inventory";
import { updateExpirationSettingsSchema } from "@/lib/validations/schemas";
import { recordAuditLog } from "@/lib/services/audit-log.service";

/**
 * Estado del sistema para la pantalla de configuración.
 * No expone credenciales: solo el host y el estado de la conexión.
 *
 * Exclusivo del superadmin: la cuenta personal de cada usuario se gestiona
 * en `/api/usuarios/me`.
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    const status = await checkDatabaseConnection();
    const db = getDb();

    const [{ count: productCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products);

    const [thresholds, settings] = await Promise.all([
      getExpirationThresholds(db),
      listSystemSettings(db),
    ]);

    return jsonOk({
      database: {
        connected: status.connected,
        latencyMs: status.latencyMs,
        host: status.databaseUrlHost,
        error: status.error,
      },
      catalog: {
        products: productCount,
      },
      inventory: {
        expiryAlertDays: thresholds.alertDays,
        expiryCriticalDays: thresholds.criticalDays,
      },
      settings,
      security: {
        passwordHash: "SHA-256 (sin sal)",
        session: "Cookie firmada HMAC-SHA256 (HttpOnly)",
        rowLevelSecurity: "Control en servidor; RLS no configurada",
      },
    });
  } catch (error) {
    return handleRouteError(error, "configuracion:GET");
  }
}

/**
 * Actualiza los parámetros operativos del Banco. Solo el superadmin.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireSuperAdmin();

    const body = await request.json();
    const input = updateExpirationSettingsSchema.parse(body);

    const thresholds = await withTransaction(async (tx) => {
      const updated = await updateExpirationSettings(tx, input);
      await recordAuditLog(tx, {
        userId: user.id,
        action: "CONFIG_UPDATE",
        entity: "system",
        details: `Actualizó las alertas de vencimiento a ${input.alertDays} días (crítico: ${input.criticalDays}).`,
      });
      return updated;
    });

    return jsonOk(thresholds);
  } catch (error) {
    return handleRouteError(error, "configuracion:PUT");
  }
}
