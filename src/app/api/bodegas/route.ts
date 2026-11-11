import { NextRequest } from "next/server";
import { getDb, withTransaction } from "@/lib/db/client";
import { requireModulePermission } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  createWarehouse,
  invalidateWarehousesCache,
  listWarehouses,
} from "@/lib/services/warehouse.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { listWarehouseSummary } from "@/lib/services/warehouse.service";
import { createWarehouseSchema } from "@/lib/validations/schemas";

export async function GET(request: NextRequest) {
  try {
    await requireModulePermission("bodegas", "inventory.read");

    const db = getDb();
    const includeInactive = request.nextUrl.searchParams.get("all") === "true";
    const data = await listWarehouses(db, includeInactive);

    // Se mantiene el formato array (compatibilidad con el m?dulo existente)
    // y se a?ade el resumen de existencias importadas de Siigo.
    const resumen = await listWarehouseSummary(db);
    const porId = new Map<string, (typeof resumen)[number]>(
      resumen.map((r) => [r.id, r])
    );

    return jsonOk(
      data.map((row) => ({
        ...row,
        siigoSummary: porId.get(row.id) ?? null,
      }))
    );
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

    invalidateWarehousesCache();

    return jsonOk(warehouse, 201);
  } catch (error) {
    return handleRouteError(error, "bodegas:POST");
  }
}
