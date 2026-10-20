import { NextResponse } from "next/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/api/response";
import { exportToExcel } from "@/lib/siigo/exporter";
import { buildSiigoPayload, SIIGO_FORMATS } from "@/lib/services/siigo.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";

const exportSchema = z.object({
  format: z.enum(SIIGO_FORMATS),
  documentId: z.string().uuid("Documento inválido").optional(),
});

/**
 * API Route: Exportar a ExcelSiigo
 *
 * Genera el archivo Excel con el formato indicado, tomados los datos de la
 * base de datos del sistema. Si no se indica `documentId`, se exporta el
 * documento más reciente de ese formato.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const { format, documentId } = exportSchema.parse(body);

    const db = getDb();
    const payload = await buildSiigoPayload(db, format, documentId);

    const workbook = exportToExcel(payload, format);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    await recordAuditLog(db, {
      userId: user.id,
      action: "EXPORT",
      entity: "siigo",
      entityId: documentId ?? null,
      details: `Exportación ExcelSiigo formato ${format}`,
    });

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Siigo_${format}_${timestamp}`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (error) {
    return handleRouteError(error, "siigo:export");
  }
}
