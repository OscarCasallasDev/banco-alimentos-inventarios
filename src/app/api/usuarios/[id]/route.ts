import { getDb, withTransaction } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  deactivateUser,
  getUser,
  updateUser,
} from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateUserSchema } from "@/lib/validations/schemas";
import { normalizeRole } from "@/lib/auth/permissions";
import { validationError } from "@/lib/utils/errors";
import { MODULES } from "@/lib/config/modules";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();

    const { id } = await params;
    const db = getDb();
    const user = await getUser(db, id);

    return jsonOk(user);
  } catch (error) {
    return handleRouteError(error, "usuarios:GET:id");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireSuperAdmin();

    const { id } = await params;
    const body = await request.json();
    const input = updateUserSchema.parse(body);

    const role = input.role !== undefined ? normalizeRole(input.role) : undefined;
    if (input.role !== undefined && !role) {
      throw validationError({
        role: [
          `Rol desconocido: "${input.role}". Ejemplos: almacenista, coordinador, despacho, administrador.`,
        ],
      });
    }

    if (input.modules !== undefined) {
      const ignorados = input.modules.filter((key) => !(key in MODULES));
      if (ignorados.length > 0) {
        throw validationError({
          modules: [`Módulos no reconocidos: ${ignorados.join(", ")}`],
        });
      }
    }

    const updated = await withTransaction(async (tx) => {
      const user = await updateUser(tx, id, {
        firstName: input.firstName,
        lastName: input.lastName,
        cedula: input.cedula,
        role: role ?? undefined,
        status: input.status,
        modules: input.modules,
      });

      await recordAuditLog(tx, {
        userId: currentUser.id,
        action: "USER_UPDATE",
        entity: "users",
        entityId: id,
        details: `Usuario ${user.username} actualizado`,
      });

      return user;
    });

    return jsonOk(updated);
  } catch (error) {
    return handleRouteError(error, "usuarios:PUT");
  }
}

/**
 * Baja lógica del usuario (regla 4: no se eliminan datos históricos).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireSuperAdmin();

    const { id } = await params;

    if (currentUser.id === id) {
      throw new Error("No puedes desactivar tu propio usuario");
    }

    const user = await withTransaction(async (tx) => {
      const deactivated = await deactivateUser(tx, id);

      await recordAuditLog(tx, {
        userId: currentUser.id,
        action: "USER_DEACTIVATE",
        entity: "users",
        entityId: id,
        details: `Usuario ${deactivated.username} desactivado`,
      });

      return deactivated;
    });

    return jsonOk({
      id: user.id,
      username: user.username,
      status: user.status,
      message: "El usuario se desactivó. Su historial se conserva.",
    });
  } catch (error) {
    return handleRouteError(error, "usuarios:DELETE");
  }
}
