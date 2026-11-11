/**
 * Bodegas disponibles para un producto concreto.
 *
 * El formulario de la orden necesita saber, para un producto, en qué
 * bodegas existe realmente (y cuánta disponibilidad hay en cada una) para
 * ofrecer al almacenista únicamente las bodegas desde las que puede
 * despachar ese producto.
 *
 * GET /api/existencias/producto/[productId]
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { listWarehouseOptionsForProduct } from "@/lib/services/stock.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ productId: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("inventario", "inventory.read");
    const { productId } = await context.params;
    const items = await listWarehouseOptionsForProduct(productId);
    return jsonOk({ items });
  } catch (error) {
    return handleRouteError(error, "existencias:producto");
  }
}
