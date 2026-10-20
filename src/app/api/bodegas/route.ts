import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  createWarehouse,
  listWarehouses,
} from "@/lib/services/warehouse.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { createWarehouseSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listWarehouses(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "bodegas:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createWarehouseSchema.parse(body);

    const warehouse = await withTransaction(async (tx) => {
      const created = await createWarehouse(tx, input);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "WAREHOUSE_CREATE",
        entity: "warehouses",
        entityId: created.id,
        details: `Bodega ${created.code} — ${created.name}`,
      });

      return created;
    });

    return jsonOk(warehouse, 201);
  } catch (error) {
    return handleRouteError(error, "bodegas:POST");
  }
}
