/**
 * Alertas de conciliación entre importaciones consecutivas de Siigo Pyme.
 *
 * La importación NO se bloquea por una diferencia: el inventario nuevo se
 * actualiza normalmente y aquí quedan las diferencias que requieren revisión.
 */

import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import { notFoundError } from "@/lib/utils/errors";

export interface ReconciliationOrder {
  id: string;
  number: string;
  status: string;
  userName: string;
  createdAt: string | Date;
  quantity: number;
}

export interface ReconciliationAlert {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  siigoBodegaCode: number;
  previousQuantity: number;
  newQuantity: number;
  expectedQuantity: number;
  difference: number;
  committedQuantity: number;
  status: string;
  reviewStatus: string;
  note: string | null;
  createdAt: string | Date;
  previousRunId: string | null;
  previousRunFinishedAt: string | Date | null;
  currentRunFinishedAt: string | Date | null;
  reviewedByName: string | null;
  reviewedAt: string | Date | null;
  reviewNote: string | null;
  relatedOrders: ReconciliationOrder[];
}

export interface ReconciliationAlertList {
  items: ReconciliationAlert[];
  pending: number;
  lastImportAt: string | Date | null;
}

function parseOrders(value: unknown): ReconciliationOrder[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ReconciliationOrder[];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as ReconciliationOrder[]) : [];
}

export async function listReconciliationAlerts(
  executor: DbExecutor,
  limit = 50
): Promise<ReconciliationAlertList> {
  const rows = await executor.execute<Record<string, unknown>>(sql`
    WITH pending AS (
      SELECT
        d.*,
        p.code AS product_code,
        p.name AS product_name,
        prev.finished_at AS previous_run_finished_at,
        cur.finished_at AS current_run_finished_at,
        trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS reviewed_by_name
      FROM siigo_balance_diffs d
      JOIN products p ON p.id = d.product_id
      LEFT JOIN siigo_import_runs prev ON prev.id = d.previous_run_id
      LEFT JOIN siigo_import_runs cur ON cur.id = d.import_run_id
      LEFT JOIN users u ON u.id = d.reviewed_by
      WHERE d.review_status = 'PENDING'
      ORDER BY d.created_at DESC
      LIMIT ${limit}
    )
    SELECT
      pending.*,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', s.id,
          'number', s.number,
          'status', s.status,
          'userName', trim(coalesce(us.first_name, '') || ' ' || coalesce(us.last_name, '')),
          'createdAt', s.created_at,
          'quantity', si.quantity
        ) ORDER BY s.created_at)
        FROM salida_items si
        JOIN salidas s ON s.id = si.salida_id
        JOIN users us ON us.id = s.user_id
        WHERE si.product_id = pending.product_id
          AND si.siigo_bodega_code = pending.siigo_bodega_code
          AND s.created_at > pending.previous_run_finished_at
          AND s.created_at <= pending.current_run_finished_at
          AND s.deleted_at IS NULL
          AND s.status IN ('GENERATED', 'DELIVERED', 'CONFIRMED_SIIGO')
      ), '[]'::json) AS related_orders
    FROM pending
  `);

  const [countRow] = (await executor.execute<{ pending: number }>(sql`
    SELECT COUNT(*)::int AS pending
    FROM siigo_balance_diffs
    WHERE review_status = 'PENDING'
  `)) as unknown as { pending: number }[];

  const [lastRun] = (await executor.execute<{ finished_at: Date | null }>(sql`
    SELECT finished_at
    FROM siigo_import_runs
    WHERE status = 'COMPLETED'
    ORDER BY finished_at DESC
    LIMIT 1
  `)) as unknown as { finished_at: Date | null }[];

  const items = ((rows as unknown as Record<string, unknown>[]) ?? []).map(
    (row) => ({
      id: String(row.id),
      productId: String(row.product_id),
      productCode: String(row.product_code ?? ""),
      productName: String(row.product_name ?? ""),
      siigoBodegaCode: Number(row.siigo_bodega_code),
      previousQuantity: Number(row.previous_quantity ?? 0),
      newQuantity: Number(row.new_quantity ?? 0),
      expectedQuantity: Number(row.expected_quantity ?? 0),
      difference: Number(row.difference ?? 0),
      committedQuantity: Number(row.committed_quantity ?? 0),
      status: String(row.status ?? ""),
      reviewStatus: String(row.review_status ?? ""),
      note: (row.note as string | null) ?? null,
      createdAt: (row.created_at as string | Date) ?? new Date(),
      previousRunId: (row.previous_run_id as string | null) ?? null,
      previousRunFinishedAt:
        (row.previous_run_finished_at as string | Date | null) ?? null,
      currentRunFinishedAt:
        (row.current_run_finished_at as string | Date | null) ?? null,
      reviewedByName: (row.reviewed_by_name as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | Date | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
      relatedOrders: parseOrders(row.related_orders).map((order) => ({
        ...order,
        quantity: Number(order.quantity ?? 0),
      })),
    })
  );

  return {
    items,
    pending: Number(countRow?.pending ?? items.length),
    lastImportAt: lastRun?.finished_at ?? null,
  };
}

/** Marca una alerta como válida o la mantiene pendiente con una observación. */
export async function reviewReconciliationAlert(
  executor: DbExecutor,
  alertId: string,
  userId: string,
  action: "validate" | "review",
  note?: string | null
): Promise<void> {
  const [existing] = (await executor.execute<{ id: string }>(sql`
    SELECT id FROM siigo_balance_diffs WHERE id = ${alertId}::uuid LIMIT 1
  `)) as unknown as { id: string }[];

  if (!existing) throw notFoundError("Alerta de conciliación");

  if (action === "validate") {
    await executor.execute(sql`
      UPDATE siigo_balance_diffs
      SET review_status = 'VALIDATED',
          reviewed_by = ${userId}::uuid,
          reviewed_at = now(),
          review_note = ${note ?? null}
      WHERE id = ${alertId}::uuid
    `);
    return;
  }

  await executor.execute(sql`
    UPDATE siigo_balance_diffs
    SET review_note = ${note ?? null}
    WHERE id = ${alertId}::uuid
      AND review_status = 'PENDING'
  `);
}
