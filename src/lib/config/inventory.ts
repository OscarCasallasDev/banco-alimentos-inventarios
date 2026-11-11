/**
 * Parámetros operativos del Banco — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Los valores que el Banco puede ajustar (horizonte de alertas de
 * vencimiento, umbral crítico) viven en la tabla `system_settings` para no
 * requerir un despliegue de código en cada cambio.
 *
 * Se cachean en memoria con un TTL corto: son valores que cambian muy
 * rara vez, pero el servidor debe reflejarlos sin reiniciar.
 */

import { eq, sql } from "drizzle-orm";
import { systemSettings } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { cached, invalidate } from "@/lib/cache/memory-cache";
import {
  DEFAULT_EXPIRATION_THRESHOLDS,
  type ExpirationThresholds,
} from "@/lib/lots/expiration";

const SETTINGS_TTL_MS = 60_000;

/** Límite razonable para el horizonte de alertas. */
const MIN_ALERT_DAYS = 1;
const MAX_ALERT_DAYS = 365;
const MIN_CRITICAL_DAYS = 1;
const MAX_CRITICAL_DAYS = 90;

function parseIntSetting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Lee los umbrales de vencimiento configurados por el Banco.
 */
export async function getExpirationThresholds(
  executor: DbExecutor
): Promise<ExpirationThresholds> {
  return cached("settings:expiration", SETTINGS_TTL_MS, async () => {
    const rows = await executor
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(
        sql`${systemSettings.key} in ('expiry_alert_days', 'expiry_critical_days')`
      );

    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      alertDays: parseIntSetting(
        values.get("expiry_alert_days"),
        DEFAULT_EXPIRATION_THRESHOLDS.alertDays,
        MIN_ALERT_DAYS,
        MAX_ALERT_DAYS
      ),
      criticalDays: parseIntSetting(
        values.get("expiry_critical_days"),
        DEFAULT_EXPIRATION_THRESHOLDS.criticalDays,
        MIN_CRITICAL_DAYS,
        MAX_CRITICAL_DAYS
      ),
    };
  });
}

/**
 * Actualiza un parámetro del sistema. Solo ADMIN.
 */
export async function updateSystemSetting(
  executor: DbExecutor,
  key: string,
  value: string
): Promise<void> {
  await executor
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });

  invalidate("settings:");
}

/**
 * Lista los parámetros del sistema para la pantalla de configuración.
 */
export async function listSystemSettings(executor: DbExecutor) {
  const rows = await executor
    .select({
      key: systemSettings.key,
      value: systemSettings.value,
      description: systemSettings.description,
      updatedAt: systemSettings.updatedAt,
    })
    .from(systemSettings)
    .orderBy(systemSettings.key);

  return rows;
}

/**
 * Actualiza el horizonte de alertas de vencimiento.
 */
export async function updateExpirationSettings(
  executor: DbExecutor,
  input: { alertDays: number; criticalDays: number }
): Promise<ExpirationThresholds> {
  const alertDays = parseIntSetting(
    String(input.alertDays),
    DEFAULT_EXPIRATION_THRESHOLDS.alertDays,
    MIN_ALERT_DAYS,
    MAX_ALERT_DAYS
  );
  const criticalDays = parseIntSetting(
    String(input.criticalDays),
    DEFAULT_EXPIRATION_THRESHOLDS.criticalDays,
    MIN_CRITICAL_DAYS,
    MAX_CRITICAL_DAYS
  );

  await updateSystemSetting(executor, "expiry_alert_days", String(alertDays));
  await updateSystemSetting(
    executor,
    "expiry_critical_days",
    String(criticalDays)
  );

  return { alertDays, criticalDays };
}

/**
 * Verifica que el parámetro exista antes de escribirlo.
 */
export async function systemSettingExists(
  executor: DbExecutor,
  key: string
): Promise<boolean> {
  const [row] = await executor
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);

  return Boolean(row);
}
