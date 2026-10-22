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

/**
 * Asigna el siguiente consecutivo para un tipo de documento.
 *
 * La operación es atómica: `INSERT ... ON CONFLICT DO UPDATE` sobre la
 * fila del tipo. Dos llamadas simultáneas nunca devuelven el mismo número.
 */
export async function nextDocumentSequence(
  executor: DbExecutor,
  type: EntryTypeCode
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
