/**
 * Cliente de base de datos — Drizzle ORM + Supabase
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Para desarrollo, mantener un pool global
const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

const sql = globalForDb.sql ?? (connectionString
  ? postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null);

if (process.env.NODE_ENV !== "production" && sql) {
  globalForDb.sql = sql;
}

// Cliente de base de datos con manejo de errores
export const db = sql ? drizzle(sql, { schema }) : null;

/**
 * Obtiene el cliente de base de datos o lanza un error
 * si no está configurado.
 */
export function getDb() {
  if (!db) {
    throw new Error(
      "DATABASE_URL no está definida. Configura la variable de entorno."
    );
  }
  return db;
}

export { schema };
