import { getDb, withTransaction } from "@/lib/db/client";
import { requireAdmin, requireUser } from "@/lib/auth/session";
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

/**
 * Estado del sistema para la pantalla de configuración.
 * No expone credenciales: solo el host y el estado de la conexión.
 */
export async function GET() {
  try {
    await requireUser();

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
 * Actualiza los parámetros operativos del Banco. Solo ADMIN.
 */
export async function PUT(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const input = updateExpirationSettingsSchema.parse(body);

    const thresholds = await withTransaction(async (tx) =>
      updateExpirationSettings(tx, input)
    );

    return jsonOk(thresholds);
  } catch (error) {
    return handleRouteError(error, "configuracion:PUT");
  }
}
