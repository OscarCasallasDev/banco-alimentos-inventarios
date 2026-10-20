import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getUser } from "@/lib/services/user.service";
import { unauthorizedError } from "@/lib/utils/errors";

/**
 * Obtiene la información del usuario de la sesión activa.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = verifySessionToken(
      cookieStore.get(SESSION_COOKIE_NAME)?.value
    );

    if (!userId) {
      throw unauthorizedError("No autenticado");
    }

    const db = getDb();
    const user = await getUser(db, userId);

    if (user.status !== "ACTIVE") {
      throw unauthorizedError("El usuario está inactivo o suspendido");
    }

    return jsonOk(user);
  } catch (error) {
    return handleRouteError(error, "auth:me");
  }
}
