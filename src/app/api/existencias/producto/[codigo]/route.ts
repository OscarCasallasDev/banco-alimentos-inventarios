/**
 * Bodegas disponibles para un producto concreto.
 *
 * El formulario de la orden necesita saber, para un producto, en qué
 * bodegas existe realmente (y cuánta disponibilidad hay en cada una) para
 * ofrecer al almacenista únicamente las bodegas desde las que puede
 * despachar ese producto.
 *
 * Se identifica el producto por su código de Siigo (que es la clave de la
 * consolidación: descripción + bodega).
 *
 * GET /api/existencias/producto/[codigo]
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { listWarehouseOptionsForProduct } from "@/lib/services/stock.service";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ codigo: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireModulePermission("inventario", "inventory.read");
    const { codigo } = await context.params;
    const items = await listWarehouseOptionsForProduct(decodeURIComponent(codigo));
    return jsonOk({ items });
  } catch (error) {
    return handleRouteError(error, "existencias:producto");
  }
}
