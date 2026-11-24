import { getDb } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { buildSessionCookie } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  getUserByUsername,
  listUserModules,
  touchLastLogin,
} from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { loginSchema } from "@/lib/validations/schemas";
import { invalidCredentialsError, unauthorizedError } from "@/lib/utils/errors";
import { getFeatureFlags } from "@/lib/config/features";
import { MODULES, MODULE_ORDER } from "@/lib/config/modules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);

    const db = getDb();
    const user = await getUserByUsername(db, username);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw invalidCredentialsError();
    }

    if (user.status !== "ACTIVE") {
      throw unauthorizedError("El usuario está inactivo o suspendido");
    }

    await touchLastLogin(db, user.id);

    await recordAuditLog(db, {
      userId: user.id,
      action: "LOGIN",
      entity: "users",
      entityId: user.id,
      details: `Inicio de sesión de ${user.username}`,
    });

    // Módulos autorizados: se cargan con la sesión para que la navegación
    // muestre solo lo que le corresponde.
    const modules =
      user.role === "SUPERADMIN"
        ? MODULE_ORDER.filter((key) => key !== "configuracion")
        : await listUserModules(db, user.id);

    // A dónde entra: el primer módulo al que tiene acceso. Así nadie aterriza
    // en una pantalla de «acceso restringido» por escribir bien su clave.
    const flags = await getFeatureFlags();
    const destino =
      MODULE_ORDER.find((key) => {
        if (key === "configuracion") return false;
        if (!flags[MODULES[key].flag]) return false;
        return modules.includes(key);
      }) ?? null;

    const cookie = buildSessionCookie(user.id);
    const response = jsonOk({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      cedula: user.cedula,
      role: user.role,
      status: user.status,
      modules,
      defaultPath: destino ? MODULES[destino].href : "/configuracion",
    });

    response.cookies.set(cookie);

    return response;
  } catch (error) {
    return handleRouteError(error, "auth:login");
  }
}
