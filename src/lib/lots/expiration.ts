/**
 * Vencimientos — Sistema de Gestión, Trazabilidad y Conciliación
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Clasificación y reglas de alerta de los lotes por fecha de vencimiento.
 *
 * Reglas:
 *   • La fecha de vencimiento es una FECHA, no una marca de tiempo: nunca se
 *     convierte a `Date` con hora, porque en UTC-5 se desplazaría un día.
 *   • El "hoy" es siempre el del Banco (America/Bogota).
 *   • Un lote sin fecha NO es un lote "que no vence": es un dato faltante.
 *     Solo genera alerta operativa si el producto controla vencimiento.
 *   • Los lotes agotados no generan alerta: no hay mercancía por vencer.
 */

import { addDaysIso, bankTodayIso, daysBetweenIso } from "@/lib/utils/dates";

/**
 * Clasificación de un lote frente a su fecha de vencimiento.
 */
export type ExpirationStatus =
  | "NO_EXPIRY"
  | "EXPIRED"
  | "EXPIRES_TODAY"
  | "EXPIRES_TOMORROW"
  | "CRITICAL"
  | "WARNING"
  | "OK";

/**
 * Umbrales configurables por el Banco.
 */
export interface ExpirationThresholds {
  /** Días hacia adelante que se consideran "próximos a vencer". */
  alertDays: number;
  /** Días a partir de los cuales un lote se considera crítico. */
  criticalDays: number;
}

export const DEFAULT_EXPIRATION_THRESHOLDS: ExpirationThresholds = {
  alertDays: 30,
  criticalDays: 7,
};

/**
 * Severidad para el tratamiento visual.
 */
export type ExpirationSeverity =
  | "none"
  | "ok"
  | "warning"
  | "critical"
  | "expired";

/**
 * Días que faltan para el vencimiento. `null` si no hay fecha.
 */
export function daysToExpire(
  expirationDate: string | null | undefined,
  today: string = bankTodayIso()
): number | null {
  if (!expirationDate) return null;
  return daysBetweenIso(today, expirationDate.slice(0, 10));
}

/**
 * Indica si un lote ya está vencido a la fecha indicada.
 */
export function isExpired(
  expirationDate: string | null | undefined,
  today: string = bankTodayIso()
): boolean {
  const days = daysToExpire(expirationDate, today);
  return days !== null && days < 0;
}

/**
 * Clasifica un lote según su fecha de vencimiento.
 *
 * @param expirationDate Fecha `YYYY-MM-DD` o `null` si no se conoce.
 * @param thresholds      Umbrales configurables por el Banco.
 * @param today           Fecha de referencia (por defecto, hoy en el Banco).
 */
export function expirationStatus(
  expirationDate: string | null | undefined,
  thresholds: ExpirationThresholds = DEFAULT_EXPIRATION_THRESHOLDS,
  today: string = bankTodayIso()
): ExpirationStatus {
  const days = daysToExpire(expirationDate, today);

  if (days === null) return "NO_EXPIRY";
  if (days < 0) return "EXPIRED";
  if (days === 0) return "EXPIRES_TODAY";
  if (days === 1) return "EXPIRES_TOMORROW";
  if (days <= thresholds.criticalDays) return "CRITICAL";
  if (days <= thresholds.alertDays) return "WARNING";

  return "OK";
}

/**
 * Traduce la clasificación a una severidad para el color de la alerta.
 */
export function expirationSeverity(
  status: ExpirationStatus
): ExpirationSeverity {
  switch (status) {
    case "EXPIRED":
      return "expired";
    case "EXPIRES_TODAY":
    case "EXPIRES_TOMORROW":
    case "CRITICAL":
      return "critical";
    case "WARNING":
      return "warning";
    case "OK":
      return "ok";
    default:
      return "none";
  }
}

/**
 * Etiqueta legible del estado, para la interfaz y los reportes.
 */
export const EXPIRATION_LABELS: Record<ExpirationStatus, string> = {
  NO_EXPIRY: "Sin vencimiento",
  EXPIRED: "Vencido",
  EXPIRES_TODAY: "Vence hoy",
  EXPIRES_TOMORROW: "Vence mañana",
  CRITICAL: "Próximo a vencer",
  WARNING: "Vence pronto",
  OK: "Vigente",
};

/**
 * Rango de fechas del horizonte de alerta, en formato `YYYY-MM-DD`.
 */
export function alertWindow(
  thresholds: ExpirationThresholds = DEFAULT_EXPIRATION_THRESHOLDS,
  today: string = bankTodayIso()
): { from: string; to: string } {
  return {
    from: today,
    to: addDaysIso(today, thresholds.alertDays),
  };
}
