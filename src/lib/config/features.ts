/**
 * Lectura cacheada de las banderas de módulo (`feature_flags`).
 *
 * La bandera decide si un módulo opera. Es reversible: el administrador la
 * cambia en Configuración y el efecto se ve sin tocar código ni reconstruir.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { featureFlags } from "@/lib/db/schema";
import { cached, invalidate } from "@/lib/cache/memory-cache";

const CACHE_KEY = "features:flags";
const TTL_MS = 30_000;

/** Banderas por defecto cuando la tabla aún no existe o no tiene la clave. */
export const DEFAULT_FLAGS: Record<string, boolean> = {
  "dashboard.enabled": true,
  "inventory.enabled": true,
  "warehouses.enabled": true,
  "salidas_almacen.enabled": true,
  "programs.enabled": true,
  "siigo_import.enabled": true,
  "users.enabled": true,
  "vencimientos.enabled": true,
  "settings.enabled": true,
  "products.enabled": false,
  "lots.enabled": false,
  "movements.enabled": false,
  "entries.enabled": false,
  "salidas_legacy.enabled": false,
  "orders.enabled": false,
  "invoices.enabled": false,
  "receipts.enabled": false,
  "audits.enabled": false,
  "reports.enabled": false,
};

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
}

/**
 * Devuelve el mapa completo de banderas.
 * Si la base de datos no responde, cae a los valores por defecto para que la
 * aplicación siga operando en vez de romperse.
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  return cached(CACHE_KEY, TTL_MS, async () => {
    try {
      const db = getDb();
      const rows = await db.select().from(featureFlags);
      const map: Record<string, boolean> = { ...DEFAULT_FLAGS };
      for (const row of rows) map[row.key] = row.enabled;
      return map;
    } catch {
      return { ...DEFAULT_FLAGS };
    }
  });
}

/** Indica si una bandera concreta está activa. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] ?? DEFAULT_FLAGS[key] ?? false;
}

/** Lista completa con descripciones (pantalla de configuración). */
export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const db = getDb();
    const rows = await db.select().from(featureFlags);
    const map = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(DEFAULT_FLAGS).map(([key, fallback]) => {
      const row = map.get(key);
      return {
        key,
        enabled: row ? row.enabled : fallback,
        description: row?.description ?? "",
      };
    });
  } catch {
    return Object.entries(DEFAULT_FLAGS).map(([key, enabled]) => ({
      key,
      enabled,
      description: "",
    }));
  }
}

/** Activa o desactiva una bandera. */
export async function setFeatureFlag(
  key: string,
  enabled: boolean,
  userId: string
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ key: featureFlags.key })
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(featureFlags).values({
      key,
      enabled,
      description: "",
      updatedBy: userId,
    });
  } else {
    await db
      .update(featureFlags)
      .set({ enabled, updatedAt: new Date(), updatedBy: userId })
      .where(eq(featureFlags.key, key));
  }
  invalidate(CACHE_KEY);
}

/** Restaura todas las banderas a sus valores por defecto. */
export async function resetFeatureFlags(userId: string): Promise<void> {
  const db = getDb();
  const keys = Object.keys(DEFAULT_FLAGS);
  await db
    .update(featureFlags)
    .set({ enabled: false, updatedAt: new Date(), updatedBy: userId })
    .where(inArray(featureFlags.key, keys));
  for (const [key, enabled] of Object.entries(DEFAULT_FLAGS)) {
    await db
      .update(featureFlags)
      .set({ enabled, updatedAt: new Date(), updatedBy: userId })
      .where(eq(featureFlags.key, key));
  }
  invalidate(CACHE_KEY);
}
