/**
 * API del mapeo entre bodegas de Siigo Pyme y bodegas de la aplicación.
 *
 * Las bodegas de Siigo llegan como códigos numéricos (1..7 en el reporte
 * real). La aplicación tiene bodegas lógicas con nombres. El mapeo es
 * CONFIGURABLE: hasta que el Banco lo defina, las existencias se muestran
 * con su código de Siigo y la bodega de la aplicación queda vacía.
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import {
  createWarehouseFromSiigoCode,
  listWarehouseMap,
  setWarehouseMap,
} from "@/lib/services/siigo-import.service";
import {
  siigoCreateWarehouseSchema,
  siigoWarehouseMapSchema,
} from "@/lib/validations/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireModulePermission("integracion_siigo", "siigo.import.read");
    const items = await listWarehouseMap();
    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "siigo:warehouse-map");
  }
}

/** Asigna (o cambia) la bodega de la aplicación para un código de Siigo. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireModulePermission(
      "integracion_siigo",
      "siigo.map_warehouses"
    );
    const input = siigoWarehouseMapSchema.parse(await request.json());
    await setWarehouseMap(
      input.siigoBodegaCode,
      input.warehouseId ?? null,
      input.label ?? null,
      input.isActive,
      user.id
    );
    const items = await listWarehouseMap();
    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "siigo:warehouse-map-update");
  }
}

/**
 * Crea una bodega de la aplicación a partir de un código de Siigo.
 * No inventa nombres: el administrador escribe el nombre.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireModulePermission(
      "integracion_siigo",
      "siigo.map_warehouses"
    );
    const input = siigoCreateWarehouseSchema.parse(await request.json());
    const warehouseId = await createWarehouseFromSiigoCode(
      input.siigoBodegaCode,
      input.name,
      user.id
    );
    const items = await listWarehouseMap();
    return jsonOk({ warehouseId, items }, 201);
  } catch (error) {
    return handleRouteError(error, "siigo:warehouse-create");
  }
}
