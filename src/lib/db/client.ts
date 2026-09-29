/**
 * Cliente de base de datos — Supabase
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Este módulo proporciona el cliente de Supabase para acceder a la base de datos.
 * Se utiliza el cliente de Supabase (API REST) en lugar de conexión directa a PostgreSQL.
 */

import { supabase } from "./supabase-client";

/**
 * Obtiene el cliente de Supabase
 */
export function getDb() {
  return supabase;
}

export { supabase };
