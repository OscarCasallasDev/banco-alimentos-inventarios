import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/api/response";
import { listLotsForExport } from "@/lib/services/lot.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { lotReportQuerySchema } from "@/lib/validations/schemas";
import { formatDateOnly, todayIsoDate } from "@/lib/utils/dates";

/**
 * Exporta el reporte de lotes por vencimiento a Excel.
 *
 * Usa EXACTAMENTE el mismo constructor de filtros que la consulta en
 * pantalla: lo que el usuario ve es lo que se exporta, sin duplicar la
 * lógica de cálculo.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();

    const { searchParams } = new URL(request.url);
    const filters = lotReportQuerySchema.parse(
      Object.fromEntries(searchParams.entries())
    );

    const db = getDb();
    const rows = await listLotsForExport(db, filters);

    const data = rows.map((lot) => ({
      "Código de lote": lot.code,
      "Código externo": lot.externalCode ?? "",
      Producto: lot.productName,
      "Código producto": lot.productCode,
      Presentación: lot.presentation ?? "",
      "Fecha de ingreso": formatDateOnly(
        lot.receivedAt ? new Date(lot.receivedAt) : null
      ),
      "Fecha de vencimiento": formatDateOnly(lot.expirationDate),
      "Días para vencer": lot.daysToExpire ?? "",
      Estado: lot.expirationLabel,
      "Cantidad recibida": lot.quantityReceived,
      "Cantidad disponible": lot.quantityAvailable,
      Unidad: lot.stockUnit,
      "Peso unitario (g)": lot.netWeightGrams ?? "",
      "Peso recibido (kg)": lot.weightReceivedKg ?? "",
      "Peso disponible (kg)": lot.weightAvailableKg ?? "",
      "Volumen disponible (L)": lot.volumeAvailableL ?? "",
      Bodega: lot.warehouseName,
      "Código bodega": lot.warehouseCode,
      "Estado del lote": lot.status,
      Trazabilidad: lot.traceability,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lotes por vencimiento");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    await recordAuditLog(db, {
      userId: user.id,
      action: "EXPORT",
      entity: "lots",
      entityId: null,
      details: `Exportación del reporte de lotes por vencimiento (${rows.length} fila(s))`,
    });

    const filename = `lotes-vencimiento-${todayIsoDate()}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleRouteError(error, "reportes:lotes:export");
  }
}
