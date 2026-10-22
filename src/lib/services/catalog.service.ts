/**
 * Servicio de catálogos auxiliares — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Catálogos controlados usados por el módulo de Entradas:
 *   • Unidades de medida (evita que cada usuario escriba "GR", "gr", "Gr").
 *   • Centros de costo (puede quedar vacío).
 */

import { asc, eq } from "drizzle-orm";
import { costCenters, units } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";

/**
 * Lista las unidades de medida activas.
 */
export async function listUnits(executor: DbExecutor) {
  return executor
    .select({
      id: units.id,
      code: units.code,
      name: units.name,
      status: units.status,
    })
    .from(units)
    .where(eq(units.status, "ACTIVE"))
    .orderBy(asc(units.name));
}

/**
 * Lista los centros de costo activos.
 */
export async function listCostCenters(executor: DbExecutor) {
  return executor
    .select({
      id: costCenters.id,
      code: costCenters.code,
      name: costCenters.name,
      status: costCenters.status,
    })
    .from(costCenters)
    .where(eq(costCenters.status, "ACTIVE"))
    .orderBy(asc(costCenters.code));
}
