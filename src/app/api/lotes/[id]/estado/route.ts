import { withTransaction } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { applyLotStatusChange } from "@/lib/services/lot.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateLotStatusSchema } from "@/lib/validations/schemas";

/**
 * Bloquea o descarta un lote.
 *
 * Solo ADMIN. La mercancía sale del pool disponible y queda registrada en
 * el libro de movimientos; la cantidad recibida del lote se conserva.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();

    const { id } = await params;
    const body = await request.json();
    const input = updateLotStatusSchema.parse(body);

    const result = await withTransaction(async (tx) => {
      const changed = await applyLotStatusChange(tx, {
        lotId: id,
        newStatus: input.status,
        reason: input.reason,
        userId: user.id,
      });

      await recordAuditLog(tx, {
        userId: user.id,
        action:
          input.status === "BLOCKED" ? "LOT_BLOCK" : "LOT_DISPOSE",
        entity: "lots",
        entityId: id,
        details:
          `Lote ${changed.code}: ${changed.previousStatus} → ${changed.newStatus}. ` +
          `Cantidad retirada: ${changed.quantityRemoved}. Motivo: ${input.reason}`,
      });

      return changed;
    });

    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, "lotes:estado:PATCH");
  }
}
