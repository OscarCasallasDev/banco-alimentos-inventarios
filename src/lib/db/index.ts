/**
 * Capa de acceso a datos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Punto de entrada único a la base de datos. Reexporta el cliente Drizzle,
 * el esquema y las utilidades de conexión.
 */

export { getDb, withTransaction, closeDb, schema } from "./client";
export type { Database, DbExecutor, DbTransaction } from "./client";
export {
  checkDatabaseConnection,
  getDatabaseHost,
} from "./connection";
export type { ConnectionStatus } from "./connection";
