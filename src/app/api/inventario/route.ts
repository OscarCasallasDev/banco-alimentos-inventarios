import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listInventory } from "@/lib/services/inventory.service";
import { inventoryQuerySchema } from "@/lib/validations/schemas";

/**
 * Inventario con existencias reales por producto, bodega y lote.
 *
 * La respuesta incluye, para cada fila, la cantidad de la caché agregada,
 * la suma de los lotes activos, el peso disponible y la diferencia de
 * conciliación: la agenda muestra siempre las dos cifras.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const filters = inventoryQuerySchema.parse(
      Object.fromEntries(searchParams.entries())
    );

    const db = getDb();
    const data = await listInventory(db, filters);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "inventario:GET");
  }
}
