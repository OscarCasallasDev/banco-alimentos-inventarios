/**
 * Componentes de lotes — Sistema de Gestión de Trazabilidad
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Piezas reutilizables para mostrar la trazabilidad de un lote:
 * estado de vencimiento, estado del lote y tabla de lotes.
 */

"use client";

import { AlertTriangle, Clock, PackageCheck, XCircle } from "lucide-react";
import { cn, formatDateOnly, formatNumber } from "@/lib/utils";

export type ExpirationSeverity =
  | "none"
  | "ok"
  | "warning"
  | "critical"
  | "expired";

export interface ExpirationBadgeProps {
  expirationDate?: string | null;
  severity?: ExpirationSeverity;
  label?: string;
  daysToExpire?: number | null;
  className?: string;
}

const SEVERITY_STYLES: Record<ExpirationSeverity, string> = {
  none: "bg-gray-100 text-gray-700",
  ok: "bg-emerald-100 text-emerald-800",
  warning: "bg-yellow-100 text-yellow-800",
  critical: "bg-orange-100 text-orange-800",
  expired: "bg-red-100 text-red-800",
};

const SEVERITY_ICONS: Record<ExpirationSeverity, typeof Clock> = {
  none: Clock,
  ok: PackageCheck,
  warning: AlertTriangle,
  critical: AlertTriangle,
  expired: XCircle,
};

/**
 * Distingue visualmente entre "vence pronto" y "ya venció".
 */
export function ExpirationBadge({
  expirationDate,
  severity = "none",
  label,
  daysToExpire,
  className,
}: ExpirationBadgeProps) {
  const Icon = SEVERITY_ICONS[severity];

  const texto =
    label ??
    (severity === "expired"
      ? "Vencido"
      : severity === "none"
        ? "Sin vencimiento"
        : expirationDate
          ? formatDateOnly(expirationDate)
          : "—");

  const detalle =
    daysToExpire !== null && daysToExpire !== undefined && severity !== "none"
      ? daysToExpire < 0
        ? `hace ${Math.abs(daysToExpire)} día(s)`
        : daysToExpire === 0
          ? "hoy"
          : `en ${daysToExpire} día(s)`
      : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
        SEVERITY_STYLES[severity],
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{texto}</span>
      {detalle && <span className="opacity-80">({detalle})</span>}
    </span>
  );
}

export type LotStatus =
  | "DRAFT"
  | "ACTIVE"
  | "BLOCKED"
  | "DEPLETED"
  | "DISPOSED"
  | "CANCELLED";

const LOT_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-orange-100 text-orange-800",
  DEPLETED: "bg-slate-200 text-slate-700",
  DISPOSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-200 text-gray-600",
};

const LOT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  BLOCKED: "Bloqueado",
  DEPLETED: "Agotado",
  DISPOSED: "Disposed",
  CANCELLED: "Cancelado",
};

/**
 * Estado del lote: activo, bloqueado, agotado, etc.
 */
export function LotStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
        LOT_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700",
        className
      )}
    >
      {LOT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export interface LotRow {
  id: string;
  code: string;
  externalCode: string | null;
  productCode: string;
  productName: string;
  warehouseCode: string;
  warehouseName: string;
  status: string;
  traceability: string;
  description: string | null;
  expirationDate: string | null;
  receivedAt: string | Date | null;
  quantityReceived: number;
  quantityAvailable: number;
  stockUnit: string;
  unitKind: string;
  presentation: string | null;
  netWeightGrams: number | null;
  weightReceivedKg: number | null;
  weightAvailableKg: number | null;
  volumeAvailableL: number | null;
  daysToExpire: number | null;
  expirationStatus: string;
  expirationSeverity: ExpirationSeverity;
  expirationLabel: string;
  isHistorical: boolean;
}

/**
 * Tabla de lotes. Cada fila es un ingreso independiente.
 */
export function LotTable({
  lots,
  showProduct = true,
  emptyMessage = "No hay lotes para mostrar",
}: {
  lots: LotRow[];
  showProduct?: boolean;
  emptyMessage?: string;
}) {
  if (lots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Código de lote
            </th>
            {showProduct && (
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Producto
              </th>
            )}
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Ingreso
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Vencimiento
            </th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">
              Recibido
            </th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">
              Disponible
            </th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">
              Peso disp.
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Bodega
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr
              key={lot.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2 font-mono text-xs text-gray-900">
                {lot.code}
                {lot.externalCode && (
                  <span className="ml-1 text-[10px] text-gray-400">
                    ({lot.externalCode})
                  </span>
                )}
              </td>
              {showProduct && (
                <td className="px-3 py-2 text-gray-900">
                  <span className="font-mono text-xs text-gray-500">
                    {lot.productCode}
                  </span>{" "}
                  {lot.productName}
                  {lot.presentation && (
                    <span className="block text-xs text-gray-500">
                      {lot.presentation}
                    </span>
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-gray-600">
                {lot.receivedAt ? formatDateOnly(lot.receivedAt) : "—"}
              </td>
              <td className="px-3 py-2">
                <ExpirationBadge
                  expirationDate={lot.expirationDate}
                  severity={lot.expirationSeverity}
                  label={
                    lot.expirationDate
                      ? formatDateOnly(lot.expirationDate)
                      : lot.expirationLabel
                  }
                  daysToExpire={lot.daysToExpire}
                />
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {formatNumber(lot.quantityReceived)}
                <span className="ml-1 text-xs text-gray-400">
                  {lot.stockUnit}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">
                {formatNumber(lot.quantityAvailable)}
                <span className="ml-1 text-xs text-gray-400">
                  {lot.stockUnit}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-gray-700">
                {lot.weightAvailableKg === null ? (
                  <span className="text-xs text-gray-400">sin dato</span>
                ) : (
                  `${formatNumber(lot.weightAvailableKg)} kg`
                )}
              </td>
              <td className="px-3 py-2 text-gray-600">
                {lot.warehouseCode}
                <span className="block text-xs text-gray-500">
                  {lot.warehouseName}
                </span>
              </td>
              <td className="px-3 py-2">
                <LotStatusBadge status={lot.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
