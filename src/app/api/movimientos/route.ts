import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listMovements } from "@/lib/services/inventory.service";
import { movementQuerySchema } from "@/lib/validations/schemas";

/**
 * Libro de movimientos de inventario con filtros y paginación.
 *
 * Cada movimiento conserva el lote afectado y el saldo que dejó en el lote.
 * Los movimientos anteriores al modelo de lotes se identifican con
 * `isHistorical: true`: no se les inventa una relación.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const filters = movementQuerySchema.parse(
      Object.fromEntries(searchParams.entries())
    );

    const db = getDb();
    const data = await listMovements(db, filters);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "movimientos:GET");
  }
}
