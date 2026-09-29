/**
 * Cliente de Supabase — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Este módulo proporciona una interfaz unificada para acceder a la base de datos
 * usando el cliente de Supabase (API REST) en lugar de conexión directa a PostgreSQL.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL no está definida. Configura la variable de entorno.");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_SECRET_KEY no está definida. Configura la variable de entorno.");
}

// Cliente de Supabase para el servidor (con permisos de servicio)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Verifica la conexión a Supabase
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Obtiene el cliente de Supabase
 */
export function getSupabase(): SupabaseClient {
  return supabase;
}
