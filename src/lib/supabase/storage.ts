/**
 * Cliente de Supabase Storage para la carga de archivos de Siigo.
 *
 * POR QUÉ NO SE SUBE EL .XLSX DIRECTAMENTE A LA API:
 *
 *   El reporte real del Banco pesa 8.08 MB y Vercel limita el cuerpo de una
 *   petición a 4.5 MB. Subirlo como `multipart/form-data` fallaría.
 *
 *   La solución es que el navegador suba el archivo al bucket privado de
 *   Supabase con una URL firmada de corta duración y que el backend lo
 *   descargue desde allí. El servidor nunca recibe el binario en el cuerpo
 *   de la petición.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SIIGO_IMPORT_BUCKET = "siigo-imports";

let client: SupabaseClient | null = null;

/** Cliente de Supabase con la clave secreta (solo servidor). */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Genera una URL firmada para subir un archivo al bucket de importaciones.
 * @param fileName Nombre original del archivo (se sanea).
 */
export async function createSignedUploadUrl(
  fileName: string
): Promise<{ uploadUrl: string; token: string; path: string } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const path = `pendientes/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(SIIGO_IMPORT_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) return null;

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
  };
}

/** Descarga un archivo del bucket (usada por el backend para procesar). */
export async function downloadFile(path: string): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(SIIGO_IMPORT_BUCKET)
    .download(path);

  if (error || !data) return null;

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Elimina un archivo del bucket tras procesarlo. */
export async function removeFile(path: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.storage.from(SIIGO_IMPORT_BUCKET).remove([path]);
}

/**
 * Verifica que el bucket exista. Si no, devuelve false para que la interfaz
 * informe que la carga manual requiere crear el bucket.
 */
export async function bucketExists(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase.storage.listBuckets();
  if (error) return false;
  return (data ?? []).some((bucket) => bucket.name === SIIGO_IMPORT_BUCKET);
}
