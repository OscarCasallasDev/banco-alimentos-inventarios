/**
 * Cliente de base de datos — Drizzle ORM sobre PostgreSQL (Supabase)
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Esta es la ÚNICA capa de acceso a datos de la aplicación.
 *
 * - `getDb()`   → instancia de Drizzle (inicialización perezosa).
 * - `DbExecutor` → tipo que permite ejecutar la misma lógica dentro o fuera
 *   de una transacción, de modo que los servicios no dependan del contexto.
 *
 * Convenciones:
 * - La base de datos usa nombres snake_case (`min_stock`, `created_at`).
 * - Drizzle expone las filas en camelCase (`minStock`, `createdAt`).
 * - A partir de ese punto, toda la aplicación habla camelCase.
 */

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Tipo de la unidad de trabajo dentro de una transacción.
 * Se obtiene de la propia firma de `db.transaction` para no duplicar tipos.
 */
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/**
 * Cualquier ejecutor de consultas: la base de datos completa o una transacción.
 * Los servicios reciben siempre este tipo, nunca una conexión concreta.
 */
export type DbExecutor = Database | DbTransaction;

let database: Database | null = null;
let postgresClient: postgres.Sql | null = null;

/**
 * Obtiene (y crea en la primera llamada) el cliente de base de datos.
 */
export function getDb(): Database {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no está definida. Configura la variable de entorno en .env.local"
    );
  }

  postgresClient = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 15,
    // El pooler transaccional de Supabase no admite prepared statements.
    prepare: false,
  });

  database = drizzle(postgresClient, { schema });

  return database;
}

/**
 * Ejecuta una operación dentro de una transacción.
 * Si cualquier operación lanza, se revierte todo el bloque.
 */
export async function withTransaction<T>(
  callback: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();
  return db.transaction(callback);
}

/**
 * Cierra el pool de conexiones (solo para scripts de línea de comandos).
 */
export async function closeDb(): Promise<void> {
  if (postgresClient) {
    await postgresClient.end({ timeout: 5 });
    postgresClient = null;
    database = null;
  }
}

export { schema };
