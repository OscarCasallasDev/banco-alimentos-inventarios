import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { todayIsoDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/siigo/exporter";
import { buildSiigoPayload, SIIGO_FORMATS } from "@/lib/services/siigo.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { entries, invoices, receipts } from "@/lib/db/schema";

const exportSchema = z.object({
  format: z.enum(SIIGO_FORMATS),
  documentId: z.string().uuid("Documento inválido").optional(),
});

/**
 * Consulta cuántos documentos existen por formato.
 *
 * La interfaz usa esta información para no ofrecer botones que terminarían
 * en un 404 cuando todavía no hay documentos de ese formato.
 */
export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const [entryRows, invoiceRows, receiptRows] = await Promise.all([
      db
        .select({
          format: entries.format,
          total: sql<number>`count(*)::int`,
        })
        .from(entries)
        .groupBy(entries.format),
      db
        .select({
          format: invoices.format,
          total: sql<number>`count(*)::int`,
        })
        .from(invoices)
        .groupBy(invoices.format),
      db
        .select({
          format: receipts.format,
          total: sql<number>`count(*)::int`,
        })
        .from(receipts)
        .groupBy(receipts.format),
    ]);

    const totals = new Map<string, number>();
    for (const row of [...entryRows, ...invoiceRows, ...receiptRows]) {
      totals.set(row.format, Number(row.total));
    }

    return jsonOk(
      SIIGO_FORMATS.map((format) => ({
        format,
        documents: totals.get(format) ?? 0,
      }))
    );
  } catch (error) {
    return handleRouteError(error, "siigo:export:GET");
  }
}


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

    const timestamp = todayIsoDate();
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
