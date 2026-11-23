/**
 * Importación manual de un reporte de Siigo Pyme (archivo Excel).
 *
 * Es el MISMO proceso que ya usa el agente local y la pantalla de
 * Integración Siigo: no hay reglas nuevas ni cálculos nuevos.
 *
 * Pasos:
 *   1. Huella SHA-256 del archivo (en el navegador: es local y rápido).
 *   2. Crear (o recuperar) la corrida de importación.
 *   3. Pedir una URL firmada y subir el binario DIRECTO a Supabase Storage
 *      (el reporte real pesa 8 MB y Vercel limita a 4.5 MB el cuerpo de
 *      una petición, así que no puede pasar por la API).
 *   4. Pedir al backend que interprete el archivo y actualice los datos.
 *
 * La huella identifica el archivo. La importación manual siempre reprocesa
 * el archivo elegido (`force`) para que una nueva carga actualice la fecha y
 * la hora de la última importación, incluso si el Excel es el mismo.
 */

import { apiSend } from "@/lib/api/client";

/**
 * La importación actualiza miles de existencias en la base de datos y puede
 * tardar más que una petición normal. El cliente debe esperar a que el
 * backend confirme el cierre de la corrida, no abortar a los 20 segundos.
 */
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;

export interface ImportarExcelCallbacks<T> {
  /** Mensaje de progreso para la interfaz. */
  onProgress?: (mensaje: string) => void;
  /** Resultado de la importación. */
  onResultado?: (resumen: T) => void;
  /** Error legible para el usuario. */
  onError?: (mensaje: string) => void;
}

/** Extensiones que acepta el importador. */
export const IMPORT_EXCEL_EXTENSIONS = [".xlsx"];

/** ¿Es un archivo que el importador admite? */
export function esArchivoImportable(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMPORT_EXCEL_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Ejecuta la importación completa de un archivo Excel.
 *
 * El tipo del resultado lo decide quien llama: la API devuelve las fechas
 * como texto, mientras que el servicio interno las maneja como `Date`.
 *
 * @returns el resumen de la corrida cerrada, o `null` si ocurrió un error
 *          (el detalle se informa por `onError`).
 */
export async function importarArchivoExcel<T>(
  file: File,
  callbacks: ImportarExcelCallbacks<T> = {}
): Promise<T | null> {
  const { onProgress, onResultado, onError } = callbacks;

  try {
    // 1. Huella del archivo.
    onProgress?.("Calculando la huella del archivo…");
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const fileSha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    // 2. Crear (o recuperar) la corrida.
    onProgress?.("Registrando la importación…");
    const run = await apiSend<T>("/api/siigo/importaciones", "POST", {
      fileSha256,
      fileName: file.name,
      fileSize: file.size,
      source: "MANUAL",
      force: true,
    });

    if ((run as { alreadyProcessed?: boolean }).alreadyProcessed) {
      onResultado?.(run);
      onProgress?.("Este archivo ya se había importado.");
      return run;
    }

    // 3. URL firmada para subir el binario a Storage.
    onProgress?.("Preparando la carga segura…");
    const signed = await apiSend<{
      uploadUrl: string;
      token: string;
      path: string;
    }>("/api/siigo/importaciones/archivo", "POST", {
      fileSha256,
      fileName: file.name,
      fileSize: file.size,
    });

    // 4. Subida directa a Supabase Storage.
    onProgress?.("Subiendo el archivo…");
    const upload = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });

    if (!upload.ok) {
      throw new Error(
        `No se pudo subir el archivo (${upload.status}). Verifique que el bucket de almacenamiento esté disponible.`
      );
    }

    // 5. El backend interpreta el archivo y actualiza los datos.
    onProgress?.(
      "Estamos importando la información del archivo Excel. Por favor, espera mientras actualizamos los datos"
    );
    const finished = await apiSend<T>(
      `/api/siigo/importaciones/${(run as { id: string }).id}/procesar-archivo`,
      "POST",
      { path: signed.path },
      { timeoutMs: IMPORT_TIMEOUT_MS }
    );

    // Solo se informa éxito cuando el backend confirmó el cierre de la
    // corrida y los datos quedaron guardados.
    const status = (finished as { status?: string }).status;
    if (status !== "COMPLETED") {
      throw new Error(
        "La importación no terminó correctamente. Los datos no se actualizaron."
      );
    }

    onResultado?.(finished);
    onProgress?.("Importación completada");
    return finished;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al importar el archivo";
    onError?.(message);
    return null;
  }
}
