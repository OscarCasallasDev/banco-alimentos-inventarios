/**
 * Consecutivos documentales — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El consecutivo de un documento se asigna con un contador en la tabla
 * `document_sequences`, actualizado de forma atómica. Así, si dos usuarios
 * registran entradas al mismo tiempo, ambos reciben números distintos.
 *
 * El número completo tiene la forma `E-003-28`:
 *   E-003 → tipo de documento (ver `src/lib/entries/entry-types.ts`)
 *   28    → consecutivo de ese tipo
 */

import { sql } from "drizzle-orm";
import { documentSequences } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { formatDocumentCode, type EntryTypeCode } from "@/lib/entries/entry-types";
import {
  DOCUMENT_PREFIX,
  formatDocumentNumber,
  type DocumentPrefix,
} from "@/lib/utils/numbers";

/**
 * Asigna el siguiente consecutivo para un tipo de documento.
 *
 * La operación es atómica: `INSERT ... ON CONFLICT DO UPDATE` sobre la
 * fila del tipo. Dos llamadas simultáneas nunca devuelven el mismo número.
 */
export async function nextDocumentSequence(
  executor: DbExecutor,
  type: EntryTypeCode | string
): Promise<number> {
  const [row] = await executor
    .insert(documentSequences)
    .values({ type, lastNumber: 1 })
    .onConflictDoUpdate({
      target: documentSequences.type,
      set: {
        lastNumber: sql`${documentSequences.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastNumber: documentSequences.lastNumber });

  return row?.lastNumber ?? 1;
}

/**
 * Genera el código documental completo de una entrada.
 * Ejemplo: `E-003-28`.
 */
export async function nextEntryDocumentCode(
  executor: DbExecutor,
  type: EntryTypeCode
): Promise<string> {
  const sequence = await nextDocumentSequence(executor, type);
  return formatDocumentCode(type, sequence);
}

/**
 * Genera el número de despacho con un consecutivo atómico.
 * Ejemplo: `DES-2026-0001`.
 */
export async function nextDispatchDocumentCode(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  return nextYearlyDocumentCode(executor, DOCUMENT_PREFIX.DISPATCH, date);
}

/**
 * Genera el número de una salida de almacén con un consecutivo atómico.
 * Ejemplo: `SAL-2026-0001`.
 *
 * El número es único y no se reutiliza: vive en `document_sequences` con el
 * ámbito `SAL-<AÑO>` y se asigna con `INSERT ... ON CONFLICT DO UPDATE`.
 */
export async function nextSalidaDocumentCode(
  executor: DbExecutor,
  date: Date
): Promise<string> {
  return nextYearlyDocumentCode(executor, DOCUMENT_PREFIX.ORDEN_PEDIDO, date);
}

/**
 * Genera el número de un documento cuyo formato incluye el año
 * (PED-2026-0001, FAC-2026-0001, REC-2026-0001, DES-2026-0001).
 *
 * El contador vive en `document_sequences` con el ámbito `PREFIJO-AÑO`, de
 * modo que dos registros simultáneos nunca reciben el mismo número.
 */
export async function nextYearlyDocumentCode(
  executor: DbExecutor,
  prefix: DocumentPrefix,
  date: Date
): Promise<string> {
  const year = date.getFullYear();
  const sequence = await nextDocumentSequence(executor, `${prefix}-${year}`);
  return formatDocumentNumber(prefix, date, sequence);
}
