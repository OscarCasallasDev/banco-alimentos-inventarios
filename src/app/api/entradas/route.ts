import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createEntry, listEntries } from "@/lib/services/entry.service";
import { createEntrySchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listEntries(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "entradas:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createEntrySchema.parse(body);

    // Regla 6: la entrada, sus ítems y el movimiento de inventario se
    // guardan en una sola transacción (o se revierte todo).
    const entry = await withTransaction(async (tx) =>
      createEntry(tx, input, user.id)
    );

    return jsonOk(entry, 201);
  } catch (error) {
    return handleRouteError(error, "entradas:POST");
  }
}
