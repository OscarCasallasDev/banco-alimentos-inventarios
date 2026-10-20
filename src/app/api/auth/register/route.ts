import { getDb } from "@/lib/db/client";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createUser } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { registerSchema } from "@/lib/validations/schemas";

/**
 * Registro público de usuarios.
 * Los usuarios creados por esta vía quedan con el rol RECEPCION.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);

    const db = getDb();
    const user = await createUser(db, {
      ...input,
      role: "RECEPCION",
      status: "ACTIVE",
    });

    await recordAuditLog(db, {
      userId: user.id,
      action: "USER_CREATE",
      entity: "users",
      entityId: user.id,
      details: `Registro público de ${user.username}`,
    });

    return jsonOk(
      {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      201
    );
  } catch (error) {
    return handleRouteError(error, "auth:register");
  }
}
