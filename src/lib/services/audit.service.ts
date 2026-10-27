/**
 * Servicio de auditorías de inventario — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * La auditoría concilia la existencia del sistema con el conteo físico.
 * La cantidad del sistema SIEMPRE se toma de la base de datos: el cliente
 * solo reporta el conteo físico verificado.
 *
 * Al completarse, el inventario se ajusta y queda el movimiento de ajuste
 * registrado (regla 10: la información histórica siempre es trazable).
 */

import { desc, eq } from "drizzle-orm";
import { auditItems, audits, users, warehouses } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { notFoundError } from "@/lib/utils/errors";
import { toIsoDate } from "@/lib/utils";
import type { CreateAuditInput } from "@/lib/validations/schemas";
import { adjustStockToPhysical, getStock } from "./inventory.service";
import { recordAuditLog } from "./audit-log.service";

/**
 * Lista las auditorías con el nombre de la bodega.
 */
export async function listAudits(executor: DbExecutor) {
  const rows = await executor
    .select({
      id: audits.id,
      date: audits.date,
      warehouseId: audits.warehouseId,
      responsible: audits.responsible,
      status: audits.status,
      notes: audits.notes,
      userId: audits.userId,
      createdAt: audits.createdAt,
      updatedAt: audits.updatedAt,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(audits)
    .innerJoin(warehouses, eq(audits.warehouseId, warehouses.id))
    .innerJoin(users, eq(audits.userId, users.id))
    .orderBy(desc(audits.date));

  const items = await executor.select().from(auditItems);

  return rows.map((row) => ({
    ...row,
    items: items.filter((item) => item.auditId === row.id),
  }));
}

/**
 * Obtiene una auditoría con su detalle.
 */
export async function getAudit(executor: DbExecutor, id: string) {
  const [audit] = await executor
    .select()
    .from(audits)
    .where(eq(audits.id, id))
    .limit(1);

  if (!audit) {
    throw notFoundError("Auditoría");
  }

  const items = await executor
    .select()
    .from(auditItems)
    .where(eq(auditItems.auditId, id));

  return { ...audit, items };
}

/**
 * Crea una auditoría y, si queda COMPLETED, ajusta el inventario al
 * conteo físico verificado.
 */
export async function createAudit(
  executor: DbExecutor,
  input: CreateAuditInput,
  userId: string
) {
  const [warehouse] = await executor
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
    })
    .from(warehouses)
    .where(eq(warehouses.id, input.warehouseId))
    .limit(1);

  if (!warehouse) {
    throw notFoundError("Bodega");
  }

  const [audit] = await executor
    .insert(audits)
    .values({
      date: toIsoDate(input.date),
      warehouseId: input.warehouseId,
      responsible: input.responsible,
      status: input.status,
      userId,
      notes: input.notes || null,
    })
    .returning();

  const itemRows: {
    productId: string;
    systemQuantity: number;
    physicalQuantity: number;
    difference: number;
    observation: string | null;
  }[] = [];

  for (const item of input.items) {
    // La existencia del sistema es la real, no la que envía el cliente.
    const systemQuantity = await getStock(
      executor,
      item.productId,
      input.warehouseId
    );
    const difference = item.physicalQuantity - systemQuantity;

    itemRows.push({
      productId: item.productId,
      systemQuantity,
      physicalQuantity: item.physicalQuantity,
      difference,
      observation: item.observation || null,
    });
  }

  await executor.insert(auditItems).values(
    itemRows.map((item) => ({ ...item, auditId: audit.id }))
  );

  if (input.status === "COMPLETED") {
    for (const item of itemRows) {
      await adjustStockToPhysical(executor, {
        productId: item.productId,
        warehouseId: input.warehouseId,
        physicalQuantity: item.physicalQuantity,
        documentId: audit.id,
        userId,
        notes: `Auditoría ${warehouse.code} — responsable: ${input.responsible}`,
      });
    }
  }

  await recordAuditLog(executor, {
    userId,
    action: "AUDIT_CREATE",
    entity: "audits",
    entityId: audit.id,
    details: `Auditoría en ${warehouse.name} con ${itemRows.length} item(s)`,
  });

  const createdItems = await executor
    .select()
    .from(auditItems)
    .where(eq(auditItems.auditId, audit.id));

  return { ...audit, items: createdItems };
}
