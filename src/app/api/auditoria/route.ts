import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createAudit, listAudits } from "@/lib/services/audit.service";
import { createAuditSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listAudits(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "auditoria:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createAuditSchema.parse(body);

    // La auditoría compara el conteo físico contra la existencia real del
    // sistema y, al completarse, ajusta el inventario.
    const audit = await withTransaction(async (tx) =>
      createAudit(tx, input, user.id)
    );

    return jsonOk(audit, 201);
  } catch (error) {
    return handleRouteError(error, "auditoria:POST");
  }
}
