/**
 * Auditoría de órdenes de pedido.
 *
 * Reutiliza `audit_logs`, que ya es persistente y no tiene FK hacia las
 * órdenes: eliminar una orden nunca borra su registro de auditoría.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import type { SalidaDetail } from "@/lib/services/exit.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import type { AuditLogAction } from "@/types/database";

export type OrderAuditAction = "CREO" | "EDITO" | "ELIMINO";

export interface OrderAuditChange {
  field: string;
  before: string;
  after: string;
}

export interface OrderAuditDetails {
  actorName: string;
  orderNumber: string;
  summary: string;
  changes?: OrderAuditChange[];
  snapshot?: Record<string, unknown>;
}

const ACTION_TO_DB: Record<OrderAuditAction, AuditLogAction> = {
  CREO: "ORDER_CREATE",
  EDITO: "ORDER_UPDATE",
  ELIMINO: "ORDER_DELETE",
};

const DB_TO_ACTION: Partial<Record<AuditLogAction, OrderAuditAction>> = {
  ORDER_CREATE: "CREO",
  ORDER_UPDATE: "EDITO",
  ORDER_DELETE: "ELIMINO",
};

const ORDER_ACTIONS: AuditLogAction[] = [
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "ORDER_DELETE",
];

/** Datos mínimos y estables de una orden para la auditoría. */
export function orderSnapshot(salida: SalidaDetail): Record<string, unknown> {
  return {
    orderId: salida.id,
    orderNumber: salida.number,
    status: salida.status,
    delivererName: salida.delivererName,
    delivererDocument: salida.delivererDocument,
    program: salida.programName,
    destination: salida.destinationName,
    notes: salida.notes,
    totalQuantity: salida.totalQuantity,
    itemCount: salida.itemCount,
    items: salida.items.map((item) => ({
      product: item.productName,
      code: item.productCode,
      quantity: item.quantity,
      unit: item.unitCode,
      bodega: item.siigoBodegaCode,
      expirationDate: item.expirationDate,
    })),
  };
}

/** Diferencias legibles entre dos versiones de una orden. */
export function diffSalida(
  before: SalidaDetail,
  after: SalidaDetail
): OrderAuditChange[] {
  const changes: OrderAuditChange[] = [];

  function compare(field: string, previous: unknown, next: unknown) {
    const a = previous === null || previous === undefined ? "" : String(previous);
    const b = next === null || next === undefined ? "" : String(next);
    if (a !== b) changes.push({ field, before: a || "—", after: b || "—" });
  }

  compare("Programa", before.programName, after.programName);
  compare("Destino", before.destinationName, after.destinationName);
  compare("Observaciones", before.notes, after.notes);

  const beforeItems = new Map(
    before.items.map((item) => [item.productId, item])
  );
  const afterItems = new Map(after.items.map((item) => [item.productId, item]));

  for (const [productId, item] of afterItems) {
    const previous = beforeItems.get(productId);
    if (!previous) {
      changes.push({
        field: "Producto agregado",
        before: "—",
        after: `${item.productName} (${item.quantity} ${item.unitCode ?? ""})`,
      });
      continue;
    }
    if (previous.quantity !== item.quantity) {
      changes.push({
        field: `Cantidad de ${item.productName}`,
        before: String(previous.quantity),
        after: String(item.quantity),
      });
    }
    if (previous.siigoBodegaCode !== item.siigoBodegaCode) {
      changes.push({
        field: `Bodega de ${item.productName}`,
        before: String(previous.siigoBodegaCode),
        after: String(item.siigoBodegaCode),
      });
    }
    if (previous.expirationDate !== item.expirationDate) {
      changes.push({
        field: `Vencimiento de ${item.productName}`,
        before: previous.expirationDate ?? "—",
        after: item.expirationDate ?? "—",
      });
    }
  }

  for (const [productId, item] of beforeItems) {
    if (!afterItems.has(productId)) {
      changes.push({
        field: "Producto eliminado",
        before: `${item.productName} (${item.quantity} ${item.unitCode ?? ""})`,
        after: "—",
      });
    }
  }

  return changes;
}

/** Registra una acción de auditoría de una orden ya ejecutada con éxito. */
export async function recordOrderAudit(
  executor: DbExecutor,
  input: {
    userId: string;
    action: OrderAuditAction;
    orderId: string;
    orderNumber: string;
    actorName: string;
    summary: string;
    changes?: OrderAuditChange[];
    snapshot?: Record<string, unknown>;
  }
): Promise<void> {
  const details: OrderAuditDetails = {
    actorName: input.actorName,
    orderNumber: input.orderNumber,
    summary: input.summary,
    changes: input.changes,
    snapshot: input.snapshot,
  };

  await recordAuditLog(executor, {
    userId: input.userId,
    action: ACTION_TO_DB[input.action],
    entity: "salidas",
    entityId: input.orderId,
    details: JSON.stringify(details),
  });
}

/**
 * Completa el número definitivo (OP-…) en el registro de creación.
 *
 * La orden nace como borrador y recibe su número al generarse. El registro
 * de auditoría no se duplica: solo se actualiza su referencia.
 */
export async function updateOrderAuditNumber(
  executor: DbExecutor,
  orderId: string,
  orderNumber: string
): Promise<void> {
  await executor.execute(sql`
    UPDATE audit_logs
    SET details = jsonb_set(
      jsonb_set(
        jsonb_set(details::jsonb, '{orderNumber}', to_jsonb(${orderNumber}::text)),
        '{summary}',
        to_jsonb(regexp_replace(details::jsonb->>'summary', 'BORRADOR-[0-9]+', ${orderNumber}, 'g'))
      ),
      '{snapshot,orderNumber}',
      to_jsonb(${orderNumber}::text)
    )::text
    WHERE entity = 'salidas'
      AND action = 'ORDER_CREATE'
      AND entity_id = ${orderId}::uuid
      AND details IS NOT NULL
  `);
}

export interface OrderAuditItem {
  id: string;
  action: OrderAuditAction;
  createdAt: Date;
  userId: string;
  username: string;
  details: OrderAuditDetails;
}

export interface OrderAuditFilters {
  userId?: string;
  action?: OrderAuditAction;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/** Consulta la auditoría de órdenes, del movimiento más reciente al más antiguo. */
export async function listOrderAudit(
  executor: DbExecutor,
  filters: OrderAuditFilters
): Promise<{ items: OrderAuditItem[]; total: number }> {
  const conditions = [
    eq(auditLogs.entity, "salidas"),
    inArray(auditLogs.action, ORDER_ACTIONS),
  ];

  if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  if (filters.action) {
    conditions.push(eq(auditLogs.action, ACTION_TO_DB[filters.action]));
  }
  if (filters.dateFrom) {
    conditions.push(sql`${auditLogs.createdAt} >= ${filters.dateFrom}::date`);
  }
  if (filters.dateTo) {
    conditions.push(
      sql`${auditLogs.createdAt} < (${filters.dateTo}::date + interval '1 day')`
    );
  }

  const where = and(...conditions);

  const rows = await executor
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      userId: auditLogs.userId,
      username: users.username,
      details: auditLogs.details,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  const [countRow] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(where);

  const items = rows.map((row) => {
    let details: OrderAuditDetails = {
      actorName: row.username,
      orderNumber: "—",
      summary: "Movimiento de orden",
    };
    try {
      if (row.details) details = JSON.parse(row.details) as OrderAuditDetails;
    } catch {
      details.summary = row.details ?? details.summary;
    }

    return {
      id: row.id,
      action: DB_TO_ACTION[row.action] ?? "EDITO",
      createdAt: row.createdAt,
      userId: row.userId,
      username: row.username,
      details,
    };
  });

  return { items, total: Number(countRow?.count ?? 0) };
}
