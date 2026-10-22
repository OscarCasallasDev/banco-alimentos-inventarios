/**
 * Servicio de terceros — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Entidades que entregan productos al Banco: proveedores, donantes,
 * clientes y parroquias. El módulo de Entradas permite buscar por NIT,
 * cédula, nombre o sucursal y completar automáticamente los datos.
 */

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { thirdParties } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import type { ThirdPartyType } from "@/types/database";

export interface ThirdPartyInput {
  nit: string;
  branch?: string | null;
  name: string;
  type?: ThirdPartyType;
  address?: string | null;
  phone?: string | null;
  city?: string | null;
}

/**
 * Lista los terceros, con filtro opcional por texto libre.
 * La búsqueda cubre NIT, sucursal, razón social y ciudad.
 */
export async function listThirdParties(
  executor: DbExecutor,
  search?: string,
  limit = 50
) {
  const conditions = [eq(thirdParties.status, "ACTIVE")];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(thirdParties.nit, term),
        ilike(thirdParties.branch, term),
        ilike(thirdParties.name, term),
        ilike(thirdParties.city, term)
      )!
    );
  }

  return executor
    .select({
      id: thirdParties.id,
      nit: thirdParties.nit,
      branch: thirdParties.branch,
      name: thirdParties.name,
      type: thirdParties.type,
      address: thirdParties.address,
      phone: thirdParties.phone,
      city: thirdParties.city,
      status: thirdParties.status,
    })
    .from(thirdParties)
    .where(and(...conditions))
    .orderBy(asc(thirdParties.name))
    .limit(limit);
}

/**
 * Busca un tercero exacto por NIT y sucursal.
 */
export async function findThirdParty(
  executor: DbExecutor,
  nit: string,
  branch?: string | null
) {
  const [thirdParty] = await executor
    .select()
    .from(thirdParties)
    .where(
      and(
        eq(thirdParties.nit, nit),
        eq(thirdParties.branch, branch ?? "")
      )
    )
    .limit(1);

  return thirdParty ?? null;
}

/**
 * Obtiene un tercero por su identificador.
 */
export async function getThirdParty(executor: DbExecutor, id: string) {
  const [thirdParty] = await executor
    .select()
    .from(thirdParties)
    .where(eq(thirdParties.id, id))
    .limit(1);

  if (!thirdParty) {
    throw notFoundError("Tercero");
  }

  return thirdParty;
}

/**
 * Crea (o actualiza) un tercero. La llave natural es NIT + sucursal.
 */
export async function upsertThirdParty(
  executor: DbExecutor,
  input: ThirdPartyInput
) {
  const branch = (input.branch ?? "").trim();
  const existing = await findThirdParty(executor, input.nit, branch);

  if (existing) {
    const [updated] = await executor
      .update(thirdParties)
      .set({
        name: input.name,
        type: input.type ?? existing.type,
        address: input.address ?? existing.address,
        phone: input.phone ?? existing.phone,
        city: input.city ?? existing.city,
        updatedAt: new Date(),
      })
      .where(eq(thirdParties.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await executor
    .insert(thirdParties)
    .values({
      nit: input.nit,
      branch,
      name: input.name,
      type: input.type ?? "CLIENTE",
      address: input.address ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
    })
    .returning();

  return created;
}

/**
 * Verifica que el tercero exista y esté activo.
 */
export async function assertActiveThirdParty(
  executor: DbExecutor,
  id: string
) {
  const thirdParty = await getThirdParty(executor, id);

  if (thirdParty.status !== "ACTIVE") {
    throw conflictError(`El tercero ${thirdParty.name} está inactivo`);
  }

  return thirdParty;
}

/**
 * Búsqueda exacta por NIT: devuelve el nombre para autocompletar.
 */
export async function findByNit(executor: DbExecutor, nit: string) {
  const [row] = await executor
    .select({
      id: thirdParties.id,
      nit: thirdParties.nit,
      name: thirdParties.name,
      branch: thirdParties.branch,
      type: thirdParties.type,
    })
    .from(thirdParties)
    .where(eq(thirdParties.nit, nit))
    .orderBy(asc(thirdParties.branch))
    .limit(1);

  return row ?? null;
}
