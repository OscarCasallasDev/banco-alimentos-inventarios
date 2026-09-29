import { NextResponse } from "next/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { exportToExcel } from "@/lib/siigo/exporter";
import type {
  E1Entry,
  E3Entry,
  N3Entry,
  N5Entry,
  SF1Invoice,
  F2Invoice,
  R1Receipt,
  R2Receipt,
  R3Receipt,
  R4Receipt,
} from "@/lib/siigo/formats";

const exportSchema = z.object({
  format: z.enum(["E1", "E3", "N3", "N5", "SF1", "F2", "R1", "R2", "R3", "R4"]),
  data: z.unknown(),
});

/**
 * API Route: Exportar a ExcelSiigo
 * Genera un archivo Excel con el formato especificado para Siigo Pyme.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { format, data } = exportSchema.parse(body);

    // Generar el archivo Excel
    const wb = exportToExcel(data, format);

    // Convertir a buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Generar nombre de archivo
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Siigo_${format}_${timestamp}`;

    // Retornar el archivo como descarga
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Datos inválidos",
            details: error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }
    console.error("Error exportando a ExcelSiigo:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error al exportar archivo",
        },
      },
      { status: 500 }
    );
  }
}
