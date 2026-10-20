import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  deactivateWarehouse,
  getWarehouse,
  updateWarehouse,
} from "@/lib/services/warehouse.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateWarehouseSchema } from "@/lib/validations/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await params;
    const db = getDb();
    const warehouse = await getWarehouse(db, id);

    return jsonOk(warehouse);
  } catch (error) {
    return handleRouteError(error, "bodegas:GET:id");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;
    const body = await request.json();
    const input = updateWarehouseSchema.parse(body);

    const warehouse = await withTransaction(async (tx) => {
      const updated = await updateWarehouse(tx, id, input);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "WAREHOUSE_UPDATE",
        entity: "warehouses",
        entityId: id,
        details: `Bodega ${updated.code} actualizada`,
      });

      return updated;
    });

    return jsonOk(warehouse);
  } catch (error) {
    return handleRouteError(error, "bodegas:PUT");
  }
}

/**
 * Baja lógica de la bodega (regla 4: no se eliminan datos históricos).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;

    const warehouse = await withTransaction(async (tx) => {
      const deactivated = await deactivateWarehouse(tx, id);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "WAREHOUSE_DEACTIVATE",
        entity: "warehouses",
        entityId: id,
        details: `Bodega ${deactivated.code} desactivada`,
      });

      return deactivated;
    });

    return jsonOk({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      status: warehouse.status,
      message: "La bodega se desactivó. Su historial se conserva.",
    });
  } catch (error) {
    return handleRouteError(error, "bodegas:DELETE");
  }
}
