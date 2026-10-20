import { getDb } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { buildSessionCookie } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { getUserByUsername, touchLastLogin } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { loginSchema } from "@/lib/validations/schemas";
import { invalidCredentialsError, unauthorizedError } from "@/lib/utils/errors";

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

    const cookie = buildSessionCookie(user.id);
    const response = jsonOk({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
    });

    response.cookies.set(cookie);

    return response;
  } catch (error) {
    return handleRouteError(error, "auth:login");
  }
}
