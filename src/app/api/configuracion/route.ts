import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { checkDatabaseConnection } from "@/lib/db/connection";
import { products } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

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
