/**
 * Caché en memoria del proceso — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Los catálogos (productos, bodegas, unidades, centros de costo y terceros)
 * se leen en cada pantalla y casi nunca cambian. Sin caché, cada pantalla
 * paga el viaje completo a Supabase (~155 ms por consulta desde Colombia).
 *
 * El caché vive en la memoria del proceso: es instantáneo y no necesita
 * ninguna dependencia externa. Cada entrada tiene su propio tiempo de vida
 * (TTL) y se invalida explícitamente cuando alguien modifica el catálogo.
 *
 * En un despliegue serverless cada instancia tiene su propia copia: por eso
 * los TTL son cortos y la invalidación es explícita.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** TTL por defecto: 60 segundos. */
export const DEFAULT_TTL_MS = 60_000;

/**
 * Devuelve el valor cacheado o lo calcula y lo guarda.
 *
 * @param key   Clave única del valor cacheado.
 * @param ttlMs Tiempo de vida del valor.
 * @param fn    Función que produce el valor si no está en caché.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });

  return value;
}

/**
 * Invalida todas las entradas cuyo nombre empieza por el prefijo dado.
 * Se llama cuando se crea o modifica un elemento del catálogo.
 */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Vacía el caché por completo (pruebas o cierre del proceso).
 */
export function clearCache(): void {
  store.clear();
}

/**
 * Estado del caché (diagnóstico).
 */
export function cacheStats(): { entries: number; keys: string[] } {
  return {
    entries: store.size,
    keys: [...store.keys()],
  };
}
