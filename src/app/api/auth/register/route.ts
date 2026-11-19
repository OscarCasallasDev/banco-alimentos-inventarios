import { getDb } from "@/lib/db/client";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createUser } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { registerSchema } from "@/lib/validations/schemas";
import { checkPasswordStrength } from "@/lib/auth/password";
import { validationError } from "@/lib/utils/errors";
import { normalizeRole } from "@/lib/auth/permissions";

/**
 * Registro público de usuarios.
 *
 * El nombre de usuario NO lo escribe la persona: lo genera el servidor con
 * el nombre y el apellido (en minúsculas, sin tildes ni espacios) y añade
 * un sufijo numérico si ya existe.
 *
 * El usuario se crea con el rol RECEPCION y SIN permisos administrativos:
 * el superadmin es quien decide a qué módulos entra cada persona.
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
      role: normalizeRole("recepcion") ?? "RECEPCION",
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
