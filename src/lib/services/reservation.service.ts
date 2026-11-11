/**
 * Reservas: cantidades comprometidas en documentos operativos pendientes.
 *
 * PROBLEMA QUE RESUELVE
 *
 *   Siigo informa 100 unidades. El almacenista genera una salida de 50. La
 *   persona de despacho registra el movimiento en Siigo. La siguiente
 *   importación informa 50.
 *
 *   Si la aplicación descontara las 50 al crear la salida Y aceptara el nuevo
 *   saldo de 50, el resultado sería 0 en vez de 50: un doble descuento.
 *
 * SOLUCIÓN
 *
 *   - `siigo_balances.quantity` es el saldo INFORMADO por Siigo. La aplicación
 *     nunca lo modifica.
 *   - `siigo_reservations` son las cantidades COMPROMETIDAS en salidas que
 *     todavía no se han reflejado en Siigo.
 *   - La disponibilidad operativa es: saldo informado − comprometidas.
 *
 *   Cuando una importación muestra que el saldo de Siigo bajó, se libera la
 *   reserva que explica ese descenso (la aplicación NO vuelve a descontar:
 *   el saldo ya bajó en Siigo).
 *
 *   La reserva se libera cuando una importación lo demuestra, no cuando
 *   alguien afirma que se registró en Siigo. Eso evita la ventana de doble
 *   gasto entre "confirmado en Siigo" y "la próxima importación".
 */

import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import {
  salidas,
  siigoReservations,
  salidaItems,
} from "@/lib/db/schema";
import type { BalanceDiff } from "@/lib/services/siigo-import.service";
import { round3 } from "@/lib/siigo/import/parser";

/** Tolerancia de comparación de cantidades. */
const EPSILON = 0.0005;

export interface ReconciliationResult {
  released: number;
  partiallyReleased: number;
  unmatchedDiffs: number;
  matchedSalidas: string[];
}

/**
 * Libera las reservas que una importación demuestra.
 *
 * Se recorre cada diferencia con delta negativo (Siigo Cesar) y se cubren las
 * reservas PENDIENTES del mismo producto y bodega, de la más antigua a la más
 * reciente (FIFO). Si el descenso no alcanza para cubrir una reserva, se
 * libera parcialmente y la salida queda marcada para revisión.
 */
export async function reconcileReservations(
  tx: DbExecutor,
  runId: string,
  diffs: BalanceDiff[]
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    released: 0,
    partiallyReleased: 0,
    unmatchedDiffs: 0,
    matchedSalidas: [],
  };

  const descending = diffs
    .filter((diff) => diff.delta < 0)
    .sort((a, b) => a.delta - b.delta);

  if (descending.length === 0) {
    await markFullyReconciled(tx);
    return result;
  }

  // ---------- Carga ÚNICA de las reservas pendientes ----------
  //
  // Antes esta operación consultaba las reservas una vez por cada
  // diferencia: con 800 diferencias eso eran 800 viajes a la base de datos
  // (más de un minuto). Ahora se trae todo en una sola consulta y el
  // emparejamiento se hace en memoria.
  const reservationRows = await tx
    .select()
    .from(siigoReservations)
    .where(eq(siigoReservations.state, "PENDING"))
    .orderBy(siigoReservations.createdAt);

  const byKey = new Map<string, typeof reservationRows>();
  for (const reservation of reservationRows) {
    // La reserva se identifica por el grupo consolidado; si no lo tuviera
    // (datos anteriores), se usa producto + bodega.
    const key =
      reservation.groupKey ??
      `${reservation.productId}|${reservation.siigoBodegaCode}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(reservation);
  }

  // ---------- Emparejamiento en memoria ----------
  interface Release {
    reservationId: string;
    salidaId: string;
    quantity: number;
    releasedQuantity: number;
    state: "RELEASED" | "PARTIAL";
    note: string;
  }
  const releases: Release[] = [];
  const salidaUpdates = new Map<
    string,
    { status: "MATCHED" | "PARTIAL"; note: string }
  >();

  for (const diff of descending) {
    let remaining = Math.abs(diff.delta);
    const key =
      diff.groupKey ?? `${diff.productId}|${diff.siigoBodegaCode}`;
    const candidates = byKey.get(key) ?? [];

    if (candidates.length === 0) {
      result.unmatchedDiffs++;
      continue;
    }

    for (const reservation of candidates) {
      if (remaining <= EPSILON) break;

      const reserved = Number(reservation.reservedQuantity);
      if (reserved <= EPSILON) continue;

      if (remaining >= reserved - EPSILON) {
        // La salida completa se refleja en Siigo: se libera la reserva.
        releases.push({
          reservationId: reservation.id,
          salidaId: reservation.salidaId,
          quantity: reserved,
          releasedQuantity: reserved,
          state: "RELEASED",
          note:
            "Confirmada en Siigo Pyme: la siguiente importación reflejó el descuento.",
        });
        salidaUpdates.set(reservation.salidaId, {
          status: "MATCHED",
          note:
            "Confirmada en Siigo Pyme: la siguiente importación reflejó el descuento.",
        });
        result.released++;
        result.matchedSalidas.push(reservation.salidaId);
        remaining = round3(remaining - reserved);
        reservation.reservedQuantity = 0;
      } else {
        // Descenso parcial: se libera lo que corresponde y el resto queda
        // pendiente de revisión.
        releases.push({
          reservationId: reservation.id,
          salidaId: reservation.salidaId,
          quantity: reserved,
          releasedQuantity: remaining,
          state: "PARTIAL",
          note:
            `Siigo Pyme reflejó solo ${remaining} de las ${reserved} unidades comprometidas. Revisar.`,
        });
        salidaUpdates.set(reservation.salidaId, {
          status: "PARTIAL",
          note:
            `Siigo Pyme reflejó solo ${remaining} de las ${reserved} unidades comprometidas. Revisar.`,
        });
        result.partiallyReleased++;
        remaining = 0;
        break;
      }
    }
  }

  // ---------- Aplicación en bloque ----------
  if (releases.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < releases.length; i += CHUNK) {
      const chunk = releases.slice(i, i + CHUNK);
      const values = sql.join(
        chunk.map(
          (release) => sql`(
            ${release.reservationId}::uuid,
            ${release.state}::reservation_state,
            ${release.releasedQuantity}::numeric,
            ${release.quantity}::numeric
          )`
        ),
        sql`, `
      );

      await tx.execute(sql`
        UPDATE siigo_reservations r
        SET
          state = v.state,
          released_quantity = v.released_quantity,
          reserved_quantity = CASE WHEN v.state = 'RELEASED' THEN 0
                                  ELSE r.reserved_quantity - v.released_quantity END,
          released_at = now(),
          released_run_id = ${runId}::uuid
        FROM (VALUES ${values}) AS v(id, state, released_quantity, quantity)
        WHERE r.id = v.id
      `);
    }

    // Estado de reconciliación de las salidas afectadas.
    const salidaIds = [...salidaUpdates.keys()];
    for (const [salidaId, update] of salidaUpdates) {
      await tx
        .update(salidas)
        .set({
          reconciliationStatus: update.status,
          reconciliationNote: update.note,
          reconciledRunId: runId,
          updatedAt: new Date(),
        })
        .where(eq(salidas.id, salidaId));
    }
    void salidaIds;
  }

  await markFullyReconciled(tx);

  return result;
}

/**
 * Marca como reconciliadas las salidas que ya no tienen reservas pendientes
 * y que hicieron falta al menos una reserva liberada.
 */
async function markFullyReconciled(tx: DbExecutor): Promise<void> {
  await tx.execute(sql`
    UPDATE salidas s
    SET reconciliation_status = 'MATCHED', updated_at = now()
    WHERE s.reconciliation_status = 'PENDING'
      AND NOT EXISTS (
        SELECT 1 FROM siigo_reservations r
        WHERE r.salida_id = s.id AND r.state = 'PENDING'
      )
      AND s.status IN ('GENERATED', 'DELIVERED', 'CONFIRMED_SIIGO')
      AND EXISTS (
        SELECT 1 FROM siigo_reservations r
        WHERE r.salida_id = s.id AND r.state = 'RELEASED'
      )
  `);
}

/**
 * Suma de las cantidades reservadas por producto/bodega/ubicación.
 * Se usa para calcular la disponibilidad operativa.
 */
export async function reservedByKey(
  executor: DbExecutor,
  productId: string,
  siigoBodegaCode: number,
  locationCode: number
): Promise<number> {
  const rows = await executor.execute<{ reserved: string }>(sql`
    SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved
    FROM siigo_reservations
    WHERE product_id = ${productId}::uuid
      AND siigo_bodega_code = ${siigoBodegaCode}
      AND location_code = ${locationCode}
      AND state = 'PENDING'
  `);
  const list = (rows as unknown as { reserved: string }[]) ?? [];
  return Number(list[0]?.reserved ?? 0);
}

/**
 * Crea la reserva de una línea de salida.
 * La cantidad reservada es la cantidad de la línea (todo el documento queda
 * comprometido mientras no se confirme en Siigo).
 */
export async function createReservation(
  executor: DbExecutor,
  input: {
    salidaId: string;
    salidaItemId: string;
    productId: string;
    siigoBodegaCode: number;
    locationCode: number;
    quantity: number;
    /** Clave del grupo consolidado (descripci?n|unidad|bodega). */
    groupKey?: string | null;
  }
): Promise<void> {
  await executor
    .insert(siigoReservations)
    .values({
      salidaId: input.salidaId,
      salidaItemId: input.salidaItemId,
      productId: input.productId,
      siigoBodegaCode: input.siigoBodegaCode,
      locationCode: input.locationCode,
      quantity: input.quantity,
      reservedQuantity: input.quantity,
      releasedQuantity: 0,
      state: "PENDING",
      groupKey: input.groupKey ?? null,
    })
    .onConflictDoUpdate({
      target: siigoReservations.salidaItemId,
      set: {
        quantity: input.quantity,
        reservedQuantity: input.quantity,
        releasedQuantity: 0,
        state: "PENDING",
        releasedAt: null,
      },
    });
}

/** Libera (cancela) todas las reservas de una salida. */
export async function releaseReservations(
  executor: DbExecutor,
  salidaId: string,
  reason: string
): Promise<void> {
  await executor
    .update(siigoReservations)
    .set({ state: "CANCELLED", reservedQuantity: 0, releasedAt: new Date() })
    .where(
      and(
        eq(siigoReservations.salidaId, salidaId),
        eq(siigoReservations.state, "PENDING")
      )
    );

  await executor
    .update(salidas)
    .set({
      reconciliationStatus: "NOT_APPLICABLE",
      reconciliationNote: reason,
      updatedAt: new Date(),
    })
    .where(eq(salidas.id, salidaId));
}

/** Detalle de las reservas de una salida. */
export async function listReservationsOfSalida(
  executor: DbExecutor,
  salidaId: string
): Promise<
  {
    id: string;
    productId: string;
    quantity: number;
    reservedQuantity: number;
    releasedQuantity: number;
    state: string;
  }[]
> {
  const rows = await executor
    .select({
      id: siigoReservations.id,
      productId: siigoReservations.productId,
      quantity: siigoReservations.quantity,
      reservedQuantity: siigoReservations.reservedQuantity,
      releasedQuantity: siigoReservations.releasedQuantity,
      state: siigoReservations.state,
    })
    .from(siigoReservations)
    .where(eq(siigoReservations.salidaId, salidaId));

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    quantity: Number(row.quantity),
    reservedQuantity: Number(row.reservedQuantity),
    releasedQuantity: Number(row.releasedQuantity),
    state: row.state,
  }));
}

/** Salidas pendientes de confirmación (para el tablero y la lista de despacho). */
export async function countPendingSalidas(
  executor: DbExecutor
): Promise<{ generated: number; delivered: number; pendingReconciliation: number }> {
  const rows = await executor.execute<{
    generated: number;
    delivered: number;
    pending_reconciliation: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'GENERATED')::int AS generated,
      COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
      COUNT(*) FILTER (
        WHERE status IN ('GENERATED','DELIVERED','CONFIRMED_SIIGO')
          AND reconciliation_status IN ('PENDING','PARTIAL')
      )::int AS pending_reconciliation
    FROM salidas
  `);
  const list = (rows as unknown as {
    generated: number;
    delivered: number;
    pending_reconciliation: number;
  }[]) ?? [];
  return {
    generated: Number(list[0]?.generated ?? 0),
    delivered: Number(list[0]?.delivered ?? 0),
    pendingReconciliation: Number(list[0]?.pending_reconciliation ?? 0),
  };
}

/** Salidas que tienen reservas pendientes, para el módulo de despacho. */
export async function listSalidasWithPendingReservations(
  executor: DbExecutor,
  limit = 50
): Promise<{ salidaId: string; number: string; status: string; reserved: number }[]> {
  const rows = await executor.execute<{
    salida_id: string;
    number: string;
    status: string;
    reserved: string;
  }>(sql`
    SELECT s.id AS salida_id, s.number, s.status,
           SUM(r.reserved_quantity) AS reserved
    FROM siigo_reservations r
    JOIN salidas s ON s.id = r.salida_id
    WHERE r.state = 'PENDING'
    GROUP BY s.id, s.number, s.status
    ORDER BY MIN(r.created_at) ASC
    LIMIT ${limit}
  `);

  return (rows as unknown as {
    salida_id: string;
    number: string;
    status: string;
    reserved: string;
  }[]).map((row) => ({
    salidaId: row.salida_id,
    number: row.number,
    status: row.status,
    reserved: Number(row.reserved ?? 0),
  }));
}

/** Recalcula el estado de reconciliación de una salida concreta. */
export async function refreshSalidaReconciliation(
  executor: DbExecutor,
  salidaId: string
): Promise<void> {
  const reservations = await listReservationsOfSalida(executor, salidaId);
  const pending = reservations.filter((r) => r.state === "PENDING");

  if (pending.length === 0 && reservations.length > 0) {
    await executor
      .update(salidas)
      .set({ reconciliationStatus: "MATCHED", updatedAt: new Date() })
      .where(eq(salidas.id, salidaId));
  }
}

/** Verifica que las líneas de una salida siguen teniendo salidaItems. */
export async function countSalidaItems(
  executor: DbExecutor,
  salidaId: string
): Promise<number> {
  const rows = await executor.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM salida_items WHERE salida_id = ${salidaId}::uuid
  `);
  return Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
}

export { salidaItems };
