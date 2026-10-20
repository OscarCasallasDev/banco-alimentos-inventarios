import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listInventory } from "@/lib/services/inventory.service";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listInventory(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "inventario:GET");
  }
}
