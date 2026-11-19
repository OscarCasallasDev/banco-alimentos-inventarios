import { getDb } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { suggestUsername } from "@/lib/auth/username";

/**
 * Propone el nombre de usuario que se generará al crear un usuario.
 *
 * Se consulta antes de confirmar el formulario para que el superadmin vea
 * de antemano con qué nombre de usuario se creará la cuenta.
 */
export async function GET(request: Request) {
  try {
    await requireSuperAdmin();

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
    return handleRouteError(error, "usuarios:username");
  }
}
