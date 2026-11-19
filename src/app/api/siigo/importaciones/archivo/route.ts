/**
 * Carga manual del reporte de Siigo.
 *
 * Paso 1 de 2: el servidor genera una URL firmada de corta duración y crea
 * la corrida de importación con el hash del archivo.
 *
 * El navegador sube el binario directamente a Supabase Storage (el archivo
 * real pesa 8.08 MB y Vercel limita el cuerpo de una petición a 4.5 MB).
 */

import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { requireModulePermission } from "@/lib/auth/guard";
import { createSignedUploadUrl, getStorageStatus } from "@/lib/supabase/storage";
import { createSiigoRunSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireModulePermission(
      "integracion_siigo",
      "siigo.import.run"
    );
    const body = await request.json();
    const input = createSiigoRunSchema.parse(body);

    // Diagnóstico previo: distingue «falta la clave», «la clave no es
    // válida» y «no existe el bucket», en lugar de un mensaje genérico.
    const status = await getStorageStatus();
    if (!status.available) {
      console.error("[siigo:upload-url] Almacenamiento no disponible:", status.issue);
      return jsonOk({ error: status.message }, 503);
    }

    const signed = await createSignedUploadUrl(input.fileName ?? "reporte.xlsx");
    if (!signed) {
      return jsonOk(
        {
          error:
            "No se pudo generar la URL de carga en Supabase Storage. Revisa la clave SUPABASE_SECRET_KEY y el bucket «siigo-imports».",
        },
        503
      );
    }

    return jsonOk({
      uploadUrl: signed.uploadUrl,
      token: signed.token,
      path: signed.path,
      bucket: "siigo-imports",
      userId: user.id,
    });
  } catch (error) {
    return handleRouteError(error, "siigo:upload-url");
  }
}
