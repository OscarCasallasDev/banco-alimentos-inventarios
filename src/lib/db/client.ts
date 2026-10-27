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
 * ROBUSTEZ DE CONEXIÓN
 * El host directo de Supabase (`db.<ref>.supabase.co`) resuelve por DNS de
 * forma intermitente: cuando falla, la aplicación se caía con
 * "getaddrinfo ENOTFOUND" y el usuario quedaba sin poder usar el sistema.
 * El *pooler* (`aws-0-<region>.pooler.supabase.com`) tiene direcciones fijas
 * y es estable.
 *
 * Por eso el cliente:
 *   1. Mantiene una lista de URLs candidatas (`DATABASE_URL` y
 *      `DATABASE_FALLBACK_URLS`).
 *   2. Reintenta automáticamente ante un fallo de conexión, cambiando a la
 *      siguiente candidata.
 *   3. Si todas fallan, lanza un error con un mensaje accionable.
 *
 * Convenciones:
 * - La base de datos usa nombres snake_case (`min_stock`, `created_at`).
 * - Drizzle expone las filas en camelCase (`minStock`, `createdAt`).
 * - A partir de ese punto, toda la aplicación habla camelCase.
 */

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { isConnectionError } from "@/lib/utils/connection";

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

type SqlClient = ReturnType<typeof postgres>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Obtiene la lista de URLs candidatas, en orden de preferencia.
 */
function getCandidateUrls(): string[] {
  const urls: string[] = [];

  if (process.env.DATABASE_URL) {
    urls.push(process.env.DATABASE_URL);
  }

  const fallbacks = (process.env.DATABASE_FALLBACK_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  for (const url of fallbacks) {
    if (!urls.includes(url)) urls.push(url);
  }

  if (urls.length === 0) {
    throw new Error(
      "DATABASE_URL no está definida. Configura la variable de entorno en .env.local"
    );
  }

  return urls;
}

/**
 * Pool de conexiones con capacidad de failover entre candidatas.
 */
class ConnectionPool {
  private readonly urls: string[];
  private readonly clients: (SqlClient | null)[];
  private activeIndex = 0;

  constructor(urls: string[]) {
    this.urls = urls;
    this.clients = urls.map(() => null);
  }

  get currentUrl(): string {
    return this.urls[this.activeIndex];
  }

  /** Número de candidatas disponibles. */
  get size(): number {
    return this.urls.length;
  }

  /**
   * Devuelve el cliente de la candidata activa, creándolo si hace falta.
   */
  getClient(): SqlClient {
    if (!this.clients[this.activeIndex]) {
      const client = postgres(this.currentUrl, {
        max: Number(process.env.DATABASE_POOL_MAX ?? 10),
        // El handshake TLS con Supabase cuesta ~1 s. Mantener las conexiones
        // vivas evita pagar ese coste en cada petición.
        idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 120),
        connect_timeout: 15,
        max_lifetime: 60 * 30,
        // El pooler en modo transacción no admite prepared statements.
        prepare: false,
        onnotice: () => {},
      });

      // Precalentamiento: abre la conexión en segundo plano para que la
      // primera petición del usuario no espere el handshake.
      void client.unsafe("select 1").catch(() => {});

      this.clients[this.activeIndex] = client;
    }

    return this.clients[this.activeIndex]!;
  }

  /**
   * Rota a la siguiente candidata y devuelve su cliente.
   */
  rotate(): void {
    this.activeIndex = (this.activeIndex + 1) % this.urls.length;
  }

  /**
   * Cierra todos los clientes (solo para scripts de línea de comandos).
   */
  async close(): Promise<void> {
    await Promise.all(
      this.clients.map(async (client) => {
        if (client) await client.end({ timeout: 5 }).catch(() => {});
      })
    );
    this.clients.fill(null);
  }
}

/**
 * Envuelve una consulta (Query de postgres.js) para reintentarla con otra
 * conexión cuando falla por un problema de red.
 *
 * `rebuild` reconstruye la consulta sobre el cliente indicado.
 */
function resilientQuery(
  target: unknown,
  pool: ConnectionPool,
  rebuild: (client: SqlClient) => unknown
): unknown {
  /**
   * Ejecuta la consulta reintentando con otra candidata si hay fallo de red.
   */
  const attempt = async <T>(
    run: (client: SqlClient) => Promise<T>
  ): Promise<T> => {
    let lastError: unknown;

    for (let tryIndex = 0; tryIndex < pool.size; tryIndex += 1) {
      try {
        return await run(pool.getClient());
      } catch (error) {
        lastError = error;

        if (!isConnectionError(error) || tryIndex === pool.size - 1) {
          throw error;
        }

        console.warn(
          `[db] Fallo de conexión: ${(error as Error).message}. ` +
            `Reintentando con la siguiente conexión disponible…`
        );

        // Un corte de red o una resolución DNS lenta se recupera en unos ms.
        await sleep(700 * (tryIndex + 1));
        pool.rotate();
      }
    }

    throw lastError;
  };

  return new Proxy(target as object, {
    get(object, property) {
      if (property === "then") {
        return (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          attempt((client) =>
            Promise.resolve(rebuild(client))
          ).then(onFulfilled, onRejected);
      }

      if (property === "catch") {
        return (onRejected?: (reason: unknown) => unknown) =>
          attempt((client) => Promise.resolve(rebuild(client))).catch(
            onRejected
          );
      }

      if (property === "finally") {
        return (onFinally?: () => void) =>
          attempt((client) => Promise.resolve(rebuild(client))).finally(
            onFinally
          );
      }

      if (property === "values" || property === "execute") {
        return (...args: unknown[]) =>
          attempt((client) => {
            const query = rebuild(client) as Record<string, unknown>;
            const method = query[property];
            if (typeof method !== "function") {
              throw new Error(`postgres.js: método ${String(property)} no disponible`);
            }
            return (method as (...inner: unknown[]) => Promise<unknown>).apply(
              query,
              args
            );
          });
      }

      const value = Reflect.get(object, property, object);
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

/**
 * Envuelve el cliente de postgres.js con la capacidad de failover.
 */
function createResilientClient(pool: ConnectionPool): SqlClient {
  const base = pool.getClient();

  /**
   * Reconstruye una consulta con texto y parámetros en un cliente concreto.
   */
  const buildQuery = (client: SqlClient, text: string, values: unknown[]) =>
    client.unsafe(text, values as never[]);

  return new Proxy(base, {
    get(target, property) {
      if (property === "unsafe") {
        return (text: string, values?: unknown[]) => {
          const params = Array.isArray(values) ? values : [];
          return resilientQuery(
            pool.getClient().unsafe(text, params as never[]),
            pool,
            (client) => buildQuery(client, text, params)
          );
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },

    apply(target, thisArg, argsList) {
      const [strings, ...values] = argsList as [TemplateStringsArray, ...unknown[]];

      // Invocación como template: sql`select ...`
      if (Array.isArray(strings) && "raw" in strings) {
        let index = 0;
        const text = strings.reduce(
          (accumulator, chunk, position) =>
            accumulator +
            chunk +
            (position < values.length ? `$${++index}` : ""),
          ""
        );

        return resilientQuery(
          pool.getClient().unsafe(text, values as never[]),
          pool,
          (client) => buildQuery(client, text, values)
        );
      }

      return Reflect.apply(target, thisArg, argsList);
    },
  });
}

let pool: ConnectionPool | null = null;
let database: Database | null = null;

/**
 * Obtiene (y crea en la primera llamada) el cliente de base de datos.
 */
export function getDb(): Database {
  if (database) return database;

  pool = new ConnectionPool(getCandidateUrls());
  database = drizzle(createResilientClient(pool), { schema });

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
  if (pool) {
    await pool.close();
    pool = null;
    database = null;
  }
}

export { schema };
