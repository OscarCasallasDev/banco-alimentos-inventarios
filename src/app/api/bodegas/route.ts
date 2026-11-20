import { NextRequest, type NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { requireModulePermission } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { listWarehouses } from "@/lib/services/warehouse.service";
import { listWarehouseSummary } from "@/lib/services/warehouse.service";
import { forbiddenError } from "@/lib/utils/errors";

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

export async function POST(): Promise<NextResponse> {
  try {
    await requireUser();

    // El catálogo de bodegas se alimenta del reporte de Siigo Pyme: cada
    // bodega se identifica por su código numérico (columna B) y se actualiza
    // en cada importación, sin duplicarse. La creación manual queda
    // deshabilitada: se pediría al administrador que la crease desde el
    // reporte.
    throw forbiddenError(
      "Las bodegas se crean automáticamente al importar el reporte de Siigo Pyme."
    );
  } catch (error) {
    return handleRouteError(error, "bodegas:POST");
  }
}
