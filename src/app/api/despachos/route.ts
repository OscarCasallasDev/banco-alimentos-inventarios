import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  createDispatch,
  listDispatches,
} from "@/lib/services/dispatch.service";
import { createDispatchSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listDispatches(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "despachos:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createDispatchSchema.parse(body);

    // Regla 7: el despacho descuenta el inventario dentro de la misma
    // transacción que crea el documento.
    const dispatch = await withTransaction(async (tx) =>
      createDispatch(tx, input, user.id)
    );

    return jsonOk(dispatch, 201);
  } catch (error) {
    return handleRouteError(error, "despachos:POST");
  }
}
