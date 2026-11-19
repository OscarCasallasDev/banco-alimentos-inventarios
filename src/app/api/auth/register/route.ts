import { getDb } from "@/lib/db/client";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createUser } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { registerSchema } from "@/lib/validations/schemas";
import { checkPasswordStrength } from "@/lib/auth/password";
import { validationError } from "@/lib/utils/errors";

/**
 * Registro público de usuarios.
 *
 * Los usuarios creados por esta vía quedan con el rol RECEPCION y con los
 * módulos que ese rol tiene por defecto. El superadmin puede ajustarlos
 * después desde el módulo de usuarios.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);

    const strength = checkPasswordStrength(input.password);
    if (!strength.valid) {
      throw validationError({ password: strength.errors });
    }

    const db = getDb();
    const user = await createUser(db, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      password: input.password,
      role: "RECEPCION",
      modules: null,
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
