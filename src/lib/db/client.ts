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
import { MissingEnvError } from "@/lib/utils/env";

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
    // `MissingEnvError` permite que la API responda 503 con un mensaje
    // accionable en vez de un 500 genérico que oculta la causa.
    throw new MissingEnvError(
      "DATABASE_URL",
      "Configúrala en el panel de Vercel (Settings → Environment Variables) o en .env.local para desarrollo local."
    );
  }

  return urls;
}

/**
 * Tamaño del pool de cada candidata.
 *
 * La principal y las de respaldo necesitan valores distintos, y no es
 * cosmético: cada modo del pooler de Supabase tiene una limitación distinta.
 *
 * MODO TRANSACCIÓN (puerto 6543) — principal:
 *   No tiene el techo de 15 conexiones de Supabase (multiplexa), así que
 *   aguanta cualquier número de instancias de Vercel. A cambio NO admite
 *   el pipelining de postgres.js: dos consultas en la misma conexión dejan la
 *   petición colgada. El semáforo de `ConnectionPool` lo evita.
 *
 * MODO SESIÓN (puerto 5432) — respaldo:
 *   Admite el pipelining, pero Supabase limita su pool a 15 conexiones PARA
 *   TODO EL PROYECTO. Solo se usa si la principal falla, así que su pool es
 *   pequeño.
 */
function getPoolMaxes(count: number): number[] {
  const primary = Number(process.env.DATABASE_POOL_MAX ?? 15);
  const fallback = Number(process.env.DATABASE_FALLBACK_POOL_MAX ?? 2);

  return Array.from({ length: count }, (_, index) =>
    index === 0 ? primary : fallback
  );
}

/**
 * Pool de conexiones con capacidad de failover entre candidatas.
 *
 * La failover es POR INTENTO, no global: cada consulta que falla prueba la
 * siguiente candidata por su cuenta. Así, cuando el dashboard lanza 15
 * consultas en paralelo y todas chocan con el mismo problema, cada una
 * tiene su propia oportunidad de reintentar.
 *
 * El estado global (`activeIndex`) es solo una PREFERENCIA: se actualiza
 * hacia la candidata que funcionó, para que las consultas siguientes
 * empiecen por ahí.
 */
class ConnectionPool {
  private readonly urls: string[];
  private readonly maxes: number[];
  private readonly clients: (SqlClient | null)[];
  /** Consultas en vuelo por candidata (semáforo). */
  private readonly permits: number[];
  /** Consultas esperando permiso, por candidata. */
  private readonly waiters: Array<Array<() => void>>;
  private activeIndex = 0;

  constructor(urls: string[]) {
    this.urls = urls;
    this.maxes = getPoolMaxes(urls.length);
    this.clients = urls.map(() => null);
    this.permits = urls.map(() => 0);
    this.waiters = urls.map(() => []);
  }

  /** Número de candidatas disponibles. */
  get size(): number {
    return this.urls.length;
  }

  /** Índice absoluto de la candidata situada `offset` posiciones después de la activa. */
  indexAt(offset: number): number {
    return (this.activeIndex + offset) % this.urls.length;
  }

  /**
   * Índice de la candidata situada `offset` posiciones después de `start`.
   * Permite que un intento recorra todas las candidatas una sola vez, sin
   * que el estado global lo altere a mitad del recorrido.
   */
  indexFrom(start: number, offset: number): number {
    return (start + offset) % this.urls.length;
  }

  /** Índice de la candidata preferida en este momento. */
  get preferredIndex(): number {
    return this.activeIndex;
  }

  /**
   * Limita el número de consultas simultáneas por candidata.
   *
   * POR QUÉ: el pooler en MODO TRANSACCIÓN no admite que dos consultas
   * viajen por la misma conexión. postgres.js las canaliza en un solo envío
   * (pipelining) y el pooler se queda esperando: la petición se cuelga
   * hasta que expira el tiempo máximo de la función.
   *
   * Con este semáforo nunca hay más consultas en vuelo que conexiones, así
   * que cada conexión lleva una sola consulta. Además evita que las consultas
   * en cola se queden huérfanas cuando el failover cambia de candidata.
   */
  async acquire(index: number): Promise<void> {
    if (
      this.permits[index] < this.maxes[index] &&
      this.waiters[index].length === 0
    ) {
      this.permits[index] += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters[index].push(resolve);
    });
    // El permiso se transfiere: no hay que volver a contarlo.
  }

  /** Devuelve el permiso de una consulta que terminó. */
  release(index: number): void {
    const next = this.waiters[index].shift();

    if (next) {
      next();
      return;
    }

    this.permits[index] = Math.max(0, this.permits[index] - 1);
  }

  /**
   * Cliente de la candidata indicada por su índice absoluto.
   * Lo crea la primera vez que se usa.
   */
  clientAtIndex(index: number): SqlClient {
    if (!this.clients[index]) {
      const client = postgres(this.urls[index], {
        // El tamaño del pool depende del modo del pooler (ver `getPoolMaxes`).
        max: this.maxes[index],
        // Cierra las conexiones ociosas pronto: en Vercel las instancias se
        // congelan y el socket puede morir en silencio, dejando una
        // conexión "zombi" que la siguiente petición reutiliza.
        idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 30),
        connect_timeout: 15,
        max_lifetime: 60 * 30,
        // El pooler en modo transacción no admite prepared statements.
        prepare: false,
        // Nombre de la aplicación: permite identificar estas conexiones
        // en `pg_stat_activity` desde el panel de Supabase.
        connection: { application_name: "banco-alimentos-inventarios" },
        onnotice: () => {},
      });

      // Precalentamiento: abre la conexión en segundo plano para que la
      // primera petición del usuario no espere el handshake.
      void client.unsafe("select 1").catch(() => {});

      this.clients[index] = client;
    }

    return this.clients[index]!;
  }

  /**
   * Identificador legible (host:puerto) de una candidata, SIN credenciales,
   * para los registros.
   */
  labelAtIndex(index: number): string {
    try {
      const url = new URL(this.urls[index]);
      return `${url.hostname}:${url.port || 5432}`;
    } catch {
      return "desconocida";
    }
  }

  /**
   * Marca la candidata como preferida: la siguiente consulta empieza por
   * ella. Solo se llama cuando la candidata funcionó.
   */
  preferIndex(index: number): void {
    this.activeIndex = index;
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
   *
   * El reintento es POR CONSULTA: cada una prueba las candidatas por su
   * cuenta. Así, cuando el dashboard lanza 15 consultas en paralelo y todas
   * chocan con el mismo problema, cada una tiene su propia oportunidad.
   */
  const attempt = async <T>(
    run: (client: SqlClient) => Promise<T>
  ): Promise<T> => {
    const total = pool.size;
    // El punto de partida se captura aquí: cada candidata se prueba UNA VEZ,
    // aunque otra consulta cambie la preferencia mientras esta espera.
    const start = pool.preferredIndex;
    let lastError: unknown;

    for (let offset = 0; offset < total; offset++) {
      const index = pool.indexFrom(start, offset);
      const label = pool.labelAtIndex(index);
      const nextLabel = pool.labelAtIndex(pool.indexFrom(start, offset + 1));

      await pool.acquire(index);

      try {
        const result = await run(pool.clientAtIndex(index));

        // La candidata que funcionó pasa a ser la preferida: las consultas
        // siguientes empiezan por ella y evitan el mismo fallo.
        pool.preferIndex(index);

        return result;
      } catch (error) {
        lastError = error;

        if (!isConnectionError(error)) throw error;

        // Si no queda otra candidata, el error que se propaga es el de esta:
        // es el que explica el fallo de verdad.
        if (offset === total - 1) throw error;

        console.warn(
          `[db] Fallo de conexión en ${label}: ` +
            `${(error as Error).message}. ` +
            `Reintentando con ${nextLabel}…`
        );

        // Un corte de red o una resolución DNS lenta se recupera en unos ms.
        await sleep(700 * (offset + 1));
      } finally {
        pool.release(index);
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
 * Ejecuta una TRANSACCIÓN con failover entre candidatas.
 *
 * `begin` es lo que usa Drizzle por detrás de `db.transaction()`. Sin este
 * tratamiento, una transacción que empezaba mientras la candidata preferida
 * tenía su pool agotado fallaba sin reintentar: el proxy de consultas sí
 * hacía failover, pero las transacciones no.
 *
 * Reintentar la transacción completa es seguro: si la conexión se perdió,
 * PostgreSQL aborta la transacción y nada queda confirmado.
 */
function resilientBegin(pool: ConnectionPool, args: unknown[]): Promise<unknown> {
  const fn = typeof args[0] === "function" ? args[0] : args[1];
  const options = typeof args[0] === "function" ? undefined : args[0];

  const attempt = async (offset: number): Promise<unknown> => {
    const total = pool.size;
    const start = pool.preferredIndex;
    const index = pool.indexFrom(start, offset);
    const label = pool.labelAtIndex(index);
    const client = pool.clientAtIndex(index);

    await pool.acquire(index);

    try {
      const result = await (options
        ? client.begin(options as never, fn as never)
        : client.begin(fn as never));

      pool.preferIndex(index);
      return result;
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      if (offset === total - 1) throw error;

      console.warn(
        `[db] Fallo de conexión en ${label}: ` +
          `${(error as Error).message}. ` +
          `Reintentando con ${pool.labelAtIndex(pool.indexFrom(start, offset + 1))}…`
      );

      await sleep(700 * (offset + 1));
      return attempt(offset + 1);
    } finally {
      pool.release(index);
    }
  };

  return attempt(0);
}

/**
 * Envuelve el cliente de postgres.js con la capacidad de failover.
 *
 * El proxy NO guarda un cliente fijo: cada operación resuelve en ese momento
 * el de la candidata preferida. Así, si una consulta hace failover y cambia
 * la preferencia, las siguientes operaciones (incluidas las transacciones)
 * van directamente a la candidata que funciona.
 */
function createResilientClient(pool: ConnectionPool): SqlClient {
  /**
   * Reconstruye una consulta con texto y parámetros en un cliente concreto.
   */
  const buildQuery = (client: SqlClient, text: string, values: unknown[]) =>
    client.unsafe(text, values as never[]);

  /**
   * Cliente de la candidata preferida en este momento.
   */
  const current = () => pool.clientAtIndex(pool.preferredIndex);

  return new Proxy({} as SqlClient, {
    get(_target, property) {
      if (property === "unsafe") {
        return (text: string, values?: unknown[]) => {
          const params = Array.isArray(values) ? values : [];
          return resilientQuery(
            current().unsafe(text, params as never[]),
            pool,
            (client) => buildQuery(client, text, params)
          );
        };
      }

      if (property === "begin") {
        return (...args: unknown[]) => resilientBegin(pool, args);
      }

      const client = current();
      const value = Reflect.get(client, property, client);
      return typeof value === "function" ? value.bind(client) : value;
    },

    apply(_target, thisArg, argsList) {
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
          current().unsafe(text, values as never[]),
          pool,
          (client) => buildQuery(client, text, values)
        );
      }

      const client = current();
      return Reflect.apply(client, thisArg, argsList);
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
