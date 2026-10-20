/**
 * Detección de errores de conexión — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Distingue un problema de RED (DNS, socket, pool cerrado) de un error de
 * SQL o de lógica. Solo los primeros pueden resolverse cambiando de
 * conexión o reintentando.
 */

/**
 * Códigos de error que indican un problema de CONEXIÓN (no de SQL).
 */
export const CONNECTION_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EAI_AGAIN",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08006", // connection_failure
]);

const CONNECTION_MESSAGE_PATTERN =
  /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|connection terminated|terminating connection|server closed the connection/i;

/**
 * Revisa un error y toda su cadena de `cause`.
 *
 * Los ORM envuelven el error original: Drizzle lanza
 * "Failed query: ..." con el error de red en `cause`. Por eso hay que
 * mirar la cadena completa, no solo el error de superficie.
 */
function matches(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;

  const code = (error as { code?: string }).code;
  if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;

  const message = (error as { message?: string }).message ?? "";
  if (CONNECTION_MESSAGE_PATTERN.test(message)) return true;

  return matches((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Determina si un error es de conexión a la base de datos.
 */
export function isConnectionError(error: unknown): boolean {
  return matches(error);
}
