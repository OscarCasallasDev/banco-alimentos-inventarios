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
import { createSignedUploadUrl } from "@/lib/supabase/storage";
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

    const signed = await createSignedUploadUrl(input.fileName ?? "reporte.xlsx");
    if (!signed) {
      return jsonOk(
        {
          error:
            "El almacenamiento de archivos no está disponible. Configure SUPABASE_URL y SUPABASE_SECRET_KEY, o use el agente local de sincronización.",
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
