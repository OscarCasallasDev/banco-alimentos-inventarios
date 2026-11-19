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
 *
 * DIAGNÓSTICO:
 *
 *   Hay dos motivos habituales por los que este módulo no funciona, y ambos
 *   se confunden con «el almacenamiento no está disponible»:
 *
 *   1. `SUPABASE_SECRET_KEY` no está definida o no es válida para el
 *      proyecto. Supabase responde «Unregistered API key» y la URL firmada
 *      nunca se genera.
 *   2. El bucket `siigo-imports` no existe. Supabase responde
 *      «Bucket not found».
 *
 *   `getStorageStatus()` distingue los tres casos para que el mensaje de
 *   error indique exactamente qué corregir.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SIIGO_IMPORT_BUCKET = "siigo-imports";

/** Causa por la que el almacenamiento no está disponible. */
export type StorageIssue =
  | "not-configured"
  | "invalid-key"
  | "bucket-missing"
  | "unknown";

export interface StorageStatus {
  available: boolean;
  issue: StorageIssue | null;
  /** Mensaje listo para mostrar al usuario. */
  message: string;
}

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
 * Comprueba el estado del almacenamiento y precisa la causa del fallo.
 */
export async function getStorageStatus(): Promise<StorageStatus> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return {
      available: false,
      issue: "not-configured",
      message:
        "El almacenamiento de archivos no está configurado. Define SUPABASE_URL y SUPABASE_SECRET_KEY en las variables de entorno (en Vercel: Settings → Environment Variables).",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      available: false,
      issue: "not-configured",
      message:
        "El almacenamiento de archivos no está configurado. Define SUPABASE_URL y SUPABASE_SECRET_KEY en las variables de entorno.",
    };
  }

  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    // «Unregistered API key» / «Invalid Compact JWS»: la clave existe pero no
    // es válida para este proyecto.
    const invalidKey =
      /unregistered api key|invalid compact jws|invalid claim|jwt/i.test(
        error.message
      );

    return {
      available: false,
      issue: invalidKey ? "invalid-key" : "unknown",
      message: invalidKey
        ? "La clave SUPABASE_SECRET_KEY no es válida para este proyecto de Supabase. Genera una nueva en Supabase → Project Settings → API Keys → Secret keys (o usa la clave «service_role» de Legacy API Keys) y actualiza la variable de entorno."
        : `No se pudo consultar el almacenamiento de Supabase: ${error.message}`,
    };
  }

  const exists = (data ?? []).some(
    (bucket) => bucket.name === SIIGO_IMPORT_BUCKET
  );

  if (!exists) {
    return {
      available: false,
      issue: "bucket-missing",
      message: `El bucket de Supabase «${SIIGO_IMPORT_BUCKET}» no existe. Créalo en Supabase → Storage → New bucket (privado) o ejecuta el script de creación incluido en el repositorio.`,
    };
  }

  return {
    available: true,
    issue: null,
    message: "El almacenamiento de archivos está disponible.",
  };
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
