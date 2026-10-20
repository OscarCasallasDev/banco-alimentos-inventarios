import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createUser, listUsers } from "@/lib/services/user.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { createUserSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listUsers(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "usuarios:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createUserSchema.parse(body);

    const created = await withTransaction(async (tx) => {
      const newUser = await createUser(tx, input);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "USER_CREATE",
        entity: "users",
        entityId: newUser.id,
        details: `Usuario ${newUser.username} creado con rol ${newUser.role}`,
      });

      return newUser;
    });

    return jsonOk(created, 201);
  } catch (error) {
    return handleRouteError(error, "usuarios:POST");
  }
}
