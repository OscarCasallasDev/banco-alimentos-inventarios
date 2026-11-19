import { getDb } from "@/lib/db/client";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { suggestUsername } from "@/lib/auth/username";

/**
 * Propone el nombre de usuario que se generará al registrarse.
 *
 * Es público porque se usa en el formulario de registro, antes de que la
 * persona tenga cuenta. Solo devuelve el nombre que se generaría; no
 * permite crear usuarios ni consultar datos del sistema.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const firstName = (searchParams.get("firstName") ?? "").trim();
    const lastName = (searchParams.get("lastName") ?? "").trim();

    if (!firstName || !lastName) {
      return jsonOk({ username: null });
    }

    const db = getDb();
    const username = await suggestUsername(db, firstName, lastName);

    return jsonOk({ username });
  } catch (error) {
    return handleRouteError(error, "auth:username");
  }
}
