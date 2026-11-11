/**
 * Importación del archivo de vencimientos.
 *
 * ESTADO: preparada. El Banco todavía no ha entregado el archivo, por lo que
 * no se conoce su estructura y NO se debe suponer. Este endpoint acepta las
 * filas YA NORMALIZADAS (código de producto, lote, bodega, ubicación,
 * cantidad, unidad y fecha). Cuando llegue el archivo, solo hay que añadir el
 * lector de sus columnas y enviar esas filas aquí.
 *
 * Si se llama sin filas, responde con una explicación clara en vez de simular
 * una importación exitosa.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { readJsonBody } from "@/lib/api/request-body";
import { importVencimientos } from "@/lib/services/vencimiento.service";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  fileName: z.string().max(300).optional(),
  rows: z
    .array(
      z.object({
        productCode: z.string().min(1).max(60),
        productName: z.string().max(255).nullish(),
        lotCode: z.string().max(120).nullish(),
        siigoBodegaCode: z.number().int().nullable().optional(),
        locationCode: z.number().int().nullable().optional(),
        quantity: z.number().nullable().optional(),
        unit: z.string().max(20).nullish(),
        expirationDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD"),
      })
    )
    .min(1, "No hay filas para importar"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireModulePermission(
      "vencimientos",
      "siigo.import.run"
    );

    const input = bodySchema.parse(await readJsonBody(request));
    const result = await importVencimientos(input.rows, {
      fileName: input.fileName ?? null,
      userId: user.id,
    });

    return jsonOk(result, 201);
  } catch (error) {
    return handleRouteError(error, "vencimientos:import");
  }
}
