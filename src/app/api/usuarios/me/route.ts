import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { updateOwnProfile } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateProfileSchema } from "@/lib/validations/schemas";
import { checkPasswordStrength } from "@/lib/auth/password";
import { validationError } from "@/lib/utils/errors";

/**
 * Cuenta propia del usuario.
 *
 * Aquí el usuario cambia SU nombre de usuario y SU contraseña. No puede
 * tocar su rol, su estado ni sus permisos: eso es del superadmin.
 */
export async function GET() {
  try {
    const user = await requireUser();

    return jsonOk({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      cedula: user.cedula,
      role: user.role,
      modules: user.modules,
    });
  } catch (error) {
    return handleRouteError(error, "usuarios:me:GET");
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireUser();

    const body = await request.json();
    const input = updateProfileSchema.parse(body);

    if (input.password !== undefined) {
      const strength = checkPasswordStrength(input.password);
      if (!strength.valid) {
        throw validationError({ password: strength.errors });
      }
    }

    if (
      input.username === undefined &&
      input.password === undefined &&
      input.cedula === undefined
    ) {
      throw validationError({
        username: ["Indique la cédula, el nombre de usuario o la contraseña."],
      });
    }

    const db = getDb();

    const updated = await updateOwnProfile(db, sessionUser.id, {
      username: input.username,
      cedula: input.cedula,
      password: input.password,
    });

    const changes = [
      input.cedula !== undefined ? "cédula" : null,
      input.password !== undefined ? "contraseña" : null,
      input.username !== undefined ? "nombre de usuario" : null,
    ].filter(Boolean);

    await recordAuditLog(db, {
      userId: sessionUser.id,
      action: "USER_UPDATE",
      entity: "users",
      entityId: sessionUser.id,
      details: `El usuario actualizó su ${changes.join(", ")}`,
    });

    return jsonOk({
      id: updated.id,
      username: updated.username,
      firstName: updated.firstName,
      lastName: updated.lastName,
      cedula: updated.cedula,
      role: updated.role,
    });
  } catch (error) {
    return handleRouteError(error, "usuarios:me:PATCH");
  }
}
