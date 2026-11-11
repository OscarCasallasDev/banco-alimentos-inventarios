/**
 * Bodegas del catálogo oficial importado desde Siigo Pyme.
 *
 * Es la ÚNICA fuente que usa el formulario de órdenes de pedido: no
 * aparecen bodegas manuales, de prueba ni las que no vienen en el
 * reporte importado. Las demás bodegas siguen existiendo en la base y
 * se conservan en las órdenes históricas.
 */

import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireModulePermission("bodegas", "inventory.read");
    const db = getDb();

    const rows = await db.execute<{
      id: string;
      code: string;
      name: string;
      siigo_code: number | null;
      product_count: number;
      location_count: number;
      last_synced_at: Date | null;
    }>(sql`
      SELECT id, code, name, siigo_code, product_count, location_count,
             last_synced_at
      FROM v_imported_warehouses
      WHERE status = 'ACTIVE'
      ORDER BY siigo_code NULLS LAST, code
    `);

    const items = (rows as unknown as {
      id: string;
      code: string;
      name: string;
      siigo_code: number | null;
      product_count: number;
      location_count: number;
      last_synced_at: Date | null;
    }[]).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      source: "SIIGO",
      siigoCode: row.siigo_code === null ? null : Number(row.siigo_code),
      status: "ACTIVE",
      productCount: Number(row.product_count ?? 0),
      locationCount: Number(row.location_count ?? 0),
      lastSyncedAt: row.last_synced_at,
    }));

    return jsonOk({ items, total: items.length });
  } catch (error) {
    return handleRouteError(error, "bodegas:importadas");
  }
}
