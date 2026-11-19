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
 * La huella también evita importar dos veces el mismo archivo: el backend
 * reconoce la corrida y la marca como ya procesada.
 */

import { apiSend } from "@/lib/api/client";

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
 * @returns el resumen de la corrida, o `null` si el archivo ya se había
 *          importado antes (en ese caso se informa por `onResultado`).
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
    });

    if ((run as { alreadyProcessed?: boolean }).alreadyProcessed) {
      onResultado?.(run);
      onProgress?.("Este archivo ya se había importado.");
      return null;
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
      { path: signed.path }
    );

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
