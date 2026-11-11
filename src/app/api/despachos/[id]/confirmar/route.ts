import { withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { confirmDispatch } from "@/lib/services/dispatch.service";
import { createDispatchSchema, type CreateDispatchInput } from "@/lib/validations/schemas";

/**
 * Confirma un despacho preparado: descuenta los lotes y el inventario.
 *
 * El cuerpo puede traer la asignación manual de lotes; si no, el servidor
 * aplica FEFO. Los lotes vencidos no se despachan.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;

    let allocations: CreateDispatchInput["allocations"];

    try {
      const body = await request.json();
      const parsed = createDispatchSchema
        .pick({ allocations: true })
        .parse(body ?? {});
      allocations = parsed.allocations;
    } catch {
      allocations = undefined;
    }

    const dispatch = await withTransaction(async (tx) =>
      confirmDispatch(tx, id, user.id, allocations)
    );

    return jsonOk(dispatch);
  } catch (error) {
    return handleRouteError(error, "despachos:confirmar:POST");
  }
}
