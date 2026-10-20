import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  deactivateUser,
  getUser,
  updateUser,
} from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateUserSchema } from "@/lib/validations/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

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
    const currentUser = await requireUser();

    const { id } = await params;
    const body = await request.json();
    const input = updateUserSchema.parse(body);

    const updated = await withTransaction(async (tx) => {
      const user = await updateUser(tx, id, input);

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
    const currentUser = await requireUser();

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
