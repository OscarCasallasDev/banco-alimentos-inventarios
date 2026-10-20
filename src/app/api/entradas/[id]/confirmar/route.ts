import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { confirmEntry, getEntry } from "@/lib/services/entry.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await params;
    const db = getDb();
    const entry = await getEntry(db, id);

    return jsonOk(entry);
  } catch (error) {
    return handleRouteError(error, "entradas:GET:id");
  }
}

/**
 * Confirma una entrada en estado DRAFT: aplica sus ítems al inventario.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;

    const entry = await withTransaction(async (tx) => confirmEntry(tx, id, user.id));

    return jsonOk(entry);
  } catch (error) {
    return handleRouteError(error, "entradas:confirmar");
  }
}
