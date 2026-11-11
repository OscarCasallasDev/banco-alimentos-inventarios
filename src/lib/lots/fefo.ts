/**
 * Selección de lotes por FEFO — Sistema de Gestión de Trazabilidad
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * FEFO = First Expired, First Out (primero vence, primero sale).
 *
 * Este módulo contiene la REGLA de selección, separada de la consulta a la
 * base de datos, para poder probarla de forma aislada y para que el
 * servicio y la interfaz compartan exactamente el mismo criterio.
 *
 * Reglas:
 *   • Los lotes vencidos NO se consumen: salen primero, pero no se despachan.
 *   • Los lotes sin fecha de vencimiento van al final del orden.
 *   • A igual vencimiento, sale primero el que se recibió antes.
 *   • La función NUNCA asigna más cantidad de la disponible en un lote.
 */

import { daysBetweenIso } from "@/lib/utils/dates";
import { roundQuantity } from "./weight";

export interface FefoCandidate {
  id: string;
  code: string;
  quantityAvailable: number;
  expirationDate: string | null;
  receivedAt: string | Date | null;
  createdAt?: string | Date | null;
}

export interface FefoAllocation {
  lotId: string;
  lotCode: string;
  quantity: number;
  /** Vencimiento del lote, para mostrarlo en la confirmación del usuario. */
  expirationDate: string | null;
}

export interface FefoResult {
  allocations: FefoAllocation[];
  /** Cantidad que no se pudo cubrir con los lotes disponibles. */
  shortfall: number;
  /** Lotes excluidos por estar vencidos. */
  expiredExcluded: number;
}

/** Tolerancia para comparar cantidades fraccionarias. */
const EPSILON = 0.0005;

function toTimestamp(value: string | Date | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

/**
 * Ordena los candidatos según la regla FEFO.
 * La ordenación es estable y totalmente determinista: ante empate total gana
 * el código de lote más bajo, de modo que dos ejecuciones iguales devuelven
 * siempre el mismo resultado.
 */
export function sortByFefo(
  candidates: FefoCandidate[],
  today: string
): FefoCandidate[] {
  return [...candidates].sort((a, b) => {
    const aDays = a.expirationDate
      ? daysBetweenIso(today, a.expirationDate.slice(0, 10))
      : null;
    const bDays = b.expirationDate
      ? daysBetweenIso(today, b.expirationDate.slice(0, 10))
      : null;

    // Sin vencimiento va al final.
    if (aDays === null && bDays !== null) return 1;
    if (bDays === null && aDays !== null) return -1;

    if (aDays !== null && bDays !== null && aDays !== bDays) {
      return aDays - bDays;
    }

    const received = toTimestamp(a.receivedAt) - toTimestamp(b.receivedAt);
    if (received !== 0) return received;

    const created = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
    if (created !== 0) return created;

    return a.code.localeCompare(b.code);
  });
}

/**
 * Distribuye una cantidad entre los lotes disponibles aplicando FEFO.
 *
 * @param candidates  Lotes candidatos con su existencia disponible.
 * @param quantity    Cantidad total a cubrir.
 * @param today       Fecha de referencia (por defecto, hoy en el Banco).
 * @param options     `allowExpired` habilita el consumo de lotes vencidos
 *                    (uso excepcional, exige autorización del usuario).
 */
export function allocateByFefo(
  candidates: FefoCandidate[],
  quantity: number,
  today: string,
  options: { allowExpired?: boolean } = {}
): FefoResult {
  const target = roundQuantity(quantity);
  const usable: FefoCandidate[] = [];
  let expiredExcluded = 0;

  for (const candidate of candidates) {
    const available = Number(candidate.quantityAvailable || 0);

    if (available <= EPSILON) continue;

    const days = candidate.expirationDate
      ? daysBetweenIso(today, candidate.expirationDate.slice(0, 10))
      : null;

    if (days !== null && days < 0 && !options.allowExpired) {
      expiredExcluded += 1;
      continue;
    }

    usable.push(candidate);
  }

  const ordered = sortByFefo(usable, today);
  const allocations: FefoAllocation[] = [];
  let remaining = target;

  for (const lot of ordered) {
    if (remaining <= EPSILON) break;

    const available = Number(lot.quantityAvailable || 0);
    const take = roundQuantity(Math.min(remaining, available));

    if (take <= EPSILON) continue;

    allocations.push({
      lotId: lot.id,
      lotCode: lot.code,
      quantity: take,
      expirationDate: lot.expirationDate,
    });

    remaining = roundQuantity(remaining - take);
  }

  return {
    allocations,
    shortfall: remaining > EPSILON ? remaining : 0,
    expiredExcluded,
  };
}
