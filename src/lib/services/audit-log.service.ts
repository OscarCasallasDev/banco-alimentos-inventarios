/**
 * Registro de auditoría (bitácora del sistema)
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Toda operación crítica queda registrada con usuario, fecha y resultado.
 */

import { auditLogs } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import type { AuditLogAction } from "@/types/database";

export interface AuditLogInput {
  userId: string;
  action: AuditLogAction;
  entity: string;
  entityId?: string | null;
  result?: "SUCCESS" | "FAILURE" | "ERROR";
  details?: string | null;
  ipAddress?: string | null;
}

/**
 * Registra una operación en la bitácora de auditoría.
 * Nunca lanza: un fallo en el log no debe tumbar la operación principal.
 */
export async function recordAuditLog(
  executor: DbExecutor,
  input: AuditLogInput
): Promise<void> {
  try {
    await executor.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      result: input.result ?? "SUCCESS",
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  } catch (error) {
    console.error("No se pudo registrar la bitácora de auditoría:", error);
  }
}
