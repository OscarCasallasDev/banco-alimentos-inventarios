/**
 * Estado de la conexión a Supabase — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Utilidades para verificar el estado de la base de datos en tiempo de
 * ejecución y para exponer información de conexión (sin secretos) en la
 * pantalla de configuración.
 */

import { getDb } from "./client";

export interface ConnectionStatus {
  connected: boolean;
  latencyMs: number | null;
  databaseUrlHost: string | null;
  error: string | null;
}

/**
 * Extrae el host de la URL de conexión (sin credenciales) para mostrarla
 * en la interfaz de configuración.
 */
export function getDatabaseHost(): string | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  try {
    return new URL(connectionString).host;
  } catch {
    return null;
  }
}

/**
 * Verifica la conexión ejecutando una consulta trivial.
 */
export async function checkDatabaseConnection(): Promise<ConnectionStatus> {
  const startedAt = Date.now();

  try {
    const db = getDb();
    await db.execute("SELECT 1");

    return {
      connected: true,
      latencyMs: Date.now() - startedAt,
      databaseUrlHost: getDatabaseHost(),
      error: null,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: null,
      databaseUrlHost: getDatabaseHost(),
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
