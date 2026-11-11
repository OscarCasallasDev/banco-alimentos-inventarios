/**
 * Tablero operativo reorientado a la nueva prioridad:
 * comunicación entre el almacenista y la persona encargada del despacho.
 *
 * Todos los indicadores provienen de consultas agregadas sobre datos reales.
 * Las existencias se muestran明确 como «informadas por Siigo» cuando la fuente
 * lo permite, y no se inventan saldos cuando la fuente no los trae.
 */

import Link from "next/link";
import {
  ArrowUpFromLine,
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageCheck,
  TrendingDown,
  Warehouse,
  Plus,
  Loader2,
  FileText,
} from "lucide-react";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { getSalidasSummary, listRecentSalidas } from "@/lib/services/exit.service";
import { getLastSuccessfulRun } from "@/lib/services/siigo-import.service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface StockSummary {
  productCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  negativeCount: number;
  reviewCount: number;
  warehouseCount: number;
}

interface BodegaSummary {
  total: number;
  siigo: number;
}

async function getStockSummary(): Promise<StockSummary> {
  const db = getDb();
  const rows = await db.execute<{
    product_count: number;
    total_quantity: string;
    total_weight: string;
    negative_count: number;
    review_count: number;
    warehouse_count: number;
  }>(sql`
    SELECT
      COUNT(DISTINCT sb.product_id)::int AS product_count,
      COALESCE(SUM(sb.quantity), 0) AS total_quantity,
      COALESCE(SUM(sb.quantity * COALESCE(p.net_weight_grams, 0) / 1000), 0) AS total_weight,
      COUNT(*) FILTER (WHERE sb.is_negative)::int AS negative_count,
      COUNT(*) FILTER (WHERE sb.review_required)::int AS review_count,
      COUNT(DISTINCT sb.siigo_bodega_code)::int AS warehouse_count
    FROM siigo_balances sb
    JOIN products p ON p.id = sb.product_id
    WHERE sb.is_active
  `);

  const row = (rows as unknown as Record<string, number | string>[])[0];
  return {
    productCount: Number(row?.product_count ?? 0),
    totalQuantity: Number(row?.total_quantity ?? 0),
    totalWeightKg: Number(row?.total_weight ?? 0),
    negativeCount: Number(row?.negative_count ?? 0),
    reviewCount: Number(row?.review_count ?? 0),
    warehouseCount: Number(row?.warehouse_count ?? 0),
  };
}

async function getBodegaSummary(): Promise<BodegaSummary> {
  const db = getDb();
  const rows = await db.execute<{ total: number; siigo: number }>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE source = 'SIIGO')::int AS siigo
    FROM warehouses
    WHERE status = 'ACTIVE'
  `);
  const row = (rows as unknown as Record<string, number>[])[0];
  return {
    total: Number(row?.total ?? 0),
    siigo: Number(row?.siigo ?? 0),
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(
    value
  );
}

function formatDateTime(value: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  GENERATED: "Generada",
  DELIVERED: "Recibida en despacho",
  CONFIRMED_SIIGO: "Confirmada en Siigo",
  CANCELLED: "Anulada",
};

export default async function DashboardPage() {
  const now = new Date();

  let stock: StockSummary = {
    productCount: 0,
    totalQuantity: 0,
    totalWeightKg: 0,
    negativeCount: 0,
    reviewCount: 0,
    warehouseCount: 0,
  };
  let bodegas: BodegaSummary = { total: 0, siigo: 0 };
  let lastRun = null as Awaited<ReturnType<typeof getLastSuccessfulRun>>;
  let summary = {
    total: 0,
    byStatus: {} as Record<string, number>,
    todayCount: 0,
    todayQuantity: 0,
    pendingReconciliation: 0,
  };
  let recent: Awaited<ReturnType<typeof listRecentSalidas>> = [];

  try {
    [stock, bodegas, lastRun, summary, recent] = await Promise.all([
      getStockSummary(),
      getBodegaSummary(),
      getLastSuccessfulRun(),
      getSalidasSummary(),
      listRecentSalidas(6),
    ]);
  } catch (error) {
    console.error("No se pudo cargar el tablero:", error);
  }

  const staleMinutes = 60;
  const minutesSince = lastRun?.finishedAt
    ? (now.getTime() - new Date(lastRun.finishedAt).getTime()) / 60000
    : null;
  const stale = minutesSince === null || minutesSince > staleMinutes;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tablero operativo</h1>
          <p className="text-sm text-gray-600 mt-1">
            Órdenes de pedido del almacén y estado de la sincronización con
            Siigo Pyme.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/salidas-almacen/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva orden de pedido
          </Link>
          <Link
            href="/inventario"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Boxes className="w-4 h-4" />
            Consultar inventario
          </Link>
        </div>
      </div>

      {/* Estado de la última importación */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border",
          stale
            ? "bg-amber-50 border-amber-200"
            : "bg-emerald-50 border-emerald-200"
        )}
      >
        <div className="flex items-start gap-3">
          {stale ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={cn(
                "font-semibold",
                stale ? "text-amber-800" : "text-emerald-800"
              )}
            >
              {stale
                ? "El inventario está desactualizado"
                : "El inventario está actualizado"}
            </p>
            <p
              className={cn(
                "text-sm mt-0.5",
                stale ? "text-amber-700" : "text-emerald-700"
              )}
            >
              {lastRun
                ? `Última importación: ${formatDateTime(lastRun.finishedAt)}` +
                  (lastRun.reportDate
                    ? ` · Reporte del ${lastRun.reportDate}`
                    : "") +
                  (lastRun.reportFormat === "RESUMEN"
                    ? " · Reporte resumen por bodega"
                    : "") +
                  (minutesSince !== null
                    ? ` · hace ${Math.round(minutesSince)} minutos`
                    : "")
                : "Todavía no se ha importado ningún reporte de Siigo Pyme."}
            </p>
          </div>
        </div>

        <Link
          href="/integracion-siigo"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 bg-white rounded-lg hover:bg-gray-50"
        >
          <Loader2 className="w-4 h-4" />
          Ver importaciones
        </Link>
      </div>

      {/* Indicadores de órdenes de pedido */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href="/salidas-almacen"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <ArrowUpFromLine className="w-3.5 h-3.5" /> Órdenes generadas
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {summary.byStatus.GENERATED ?? 0}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">esperando entrega</p>
        </Link>

        <Link
          href="/salidas-almacen"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5" /> Recibidas en despacho
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-1 tabular-nums">
            {summary.byStatus.DELIVERED ?? 0}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">por confirmar en Siigo</p>
        </Link>

        <Link
          href="/salidas-almacen"
          className={cn(
            "rounded-xl border shadow-sm p-4 hover:border-primary-300 transition-colors",
            summary.pendingReconciliation > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-gray-200"
          )}
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pendientes de confirmar
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {summary.pendingReconciliation}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            aún no reflejadas en Siigo
          </p>
        </Link>

        <Link
          href="/salidas-almacen"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500">Hoy</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {summary.todayCount}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatNumber(summary.todayQuantity)} unidades entregadas
          </p>
        </Link>
      </div>

      {/* Indicadores de inventario y bodegas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href="/inventario"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Referencias de producto
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatNumber(stock.productCount)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            informadas por Siigo Pyme
          </p>
        </Link>

        <Link
          href="/inventario"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5" /> Existencias informadas
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatNumber(stock.totalQuantity)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            unidades según Siigo ({stock.warehouseCount} bodegas)
          </p>
        </Link>

        <Link
          href="/bodegas"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary-300 transition-colors"
        >
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Warehouse className="w-3.5 h-3.5" /> Bodegas disponibles
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {bodegas.total}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {bodegas.siigo} importadas de Siigo
          </p>
        </Link>

        <div
          className={cn(
            "rounded-xl border shadow-sm p-4",
            stock.negativeCount > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-gray-200"
          )}
        >
          <p className="text-xs text-gray-500">Existencias negativas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatNumber(stock.negativeCount)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            grupos con saldo negativo en Siigo
          </p>
        </div>
      </div>

      {/* Órdenes recientes */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Órdenes recientes
          </h2>
          <Link
            href="/salidas-almacen"
            className="text-sm text-primary-600 hover:underline"
          >
            Ver todas
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowUpFromLine className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              Todavía no hay órdenes de pedido registradas.
            </p>
            <Link
              href="/salidas-almacen/nueva"
              className="inline-block mt-2 text-sm font-medium text-primary-600 hover:underline"
            >
              Crear la primera orden
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map((salida) => (
              <Link
                key={salida.id}
                href={`/salidas-almacen/${salida.id}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-gray-900">
                      {salida.number}
                    </span>
                    <span className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                      {STATUS_LABELS[salida.status] ?? salida.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {salida.destinationName ?? salida.programName} ·{" "}
                    {salida.userName} · {salida.itemCount} referencias
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span className="tabular-nums">
                    {formatNumber(salida.totalQuantity)} und.
                  </span>
                  <FileText className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Alertas de calidad */}
      {(stock.reviewCount > 0 || stock.negativeCount > 0) && (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Alertas de calidad del inventario importado
          </h2>
          <ul className="space-y-1.5 text-sm text-gray-700">
            {stock.reviewCount > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>{stock.reviewCount}</b> grupo
                  {stock.reviewCount === 1 ? "" : "s"} con el saldo recalculado
                  distinto al reportado por Siigo. Revise la última importación.
                </span>
              </li>
            )}
            {stock.negativeCount > 0 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>{stock.negativeCount}</b> grupo
                  {stock.negativeCount === 1 ? "" : "s"} con saldo negativo
                  informado por Siigo Pyme.
                </span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
