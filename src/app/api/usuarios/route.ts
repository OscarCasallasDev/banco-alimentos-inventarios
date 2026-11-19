import { getDb, withTransaction } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createUser, listUsers } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { createUserSchema } from "@/lib/validations/schemas";
import { normalizeRole } from "@/lib/auth/permissions";
import { checkPasswordStrength } from "@/lib/auth/password";
import { validationError } from "@/lib/utils/errors";
import { MODULES } from "@/lib/config/modules";

/**
 * Gestión de usuarios (exclusiva del superadmin).
 */
export async function GET() {
  try {
    await requireSuperAdmin();

    const db = getDb();
    const data = await listUsers(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "usuarios:GET");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireSuperAdmin();

    const body = await request.json();
    const input = createUserSchema.parse(body);

    // El rol se escribe a mano: se normaliza antes de guardarlo.
    const role = normalizeRole(input.role);
    if (!role) {
      throw validationError({
        role: [
          `Rol desconocido: "${input.role}". Ejemplos: almacenista, coordinador, despacho, administrador.`,
        ],
      });
    }

    // La contraseña se valida con la misma política del formulario.
    const strength = checkPasswordStrength(input.password);
    if (!strength.valid) {
      throw validationError({ password: strength.errors });
    }

    // Solo se aceptan módulos que existen en el catálogo.
    const modules = input.modules.filter((key) => key in MODULES);
    const ignorados = input.modules.filter((key) => !(key in MODULES));
    if (ignorados.length > 0) {
      throw validationError({
        modules: [`Módulos no reconocidos: ${ignorados.join(", ")}`],
      });
    }

    const created = await withTransaction(async (tx) => {
      const newUser = await createUser(tx, {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        password: input.password,
        role,
        modules,
      });
      await recordAuditLog(tx, {
        userId: admin.id,
        action: "USER_CREATE",
        entity: "users",
        entityId: newUser.id,
        details: `Usuario ${newUser.username} creado con rol ${newUser.role} y módulos: ${
          modules.join(", ") || "ninguno"
        }`,
      });

      return newUser;
    });

    return jsonOk(created, 201);
  } catch (error) {
    return handleRouteError(error, "usuarios:POST");
  }
}
