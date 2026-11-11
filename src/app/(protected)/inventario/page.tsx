/**
 * Módulo de Inventario — existencias por producto y bodega.
 *
 * Cada fila es un producto (código de Siigo) en una bodega concreta. Dos
 * productos con el MISMO nombre en bodegas distintas aparecen separados y
 * sus cantidades nunca se suman entre sí.
 *
 * Un mismo producto puede estar en varias ubicaciones de una misma bodega:
 * esas ubicaciones sí se suman (es el mismo stock) y se muestran en la
 * columna "Ubicaciones". Los registros originales se conservan intactos.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Package,
  Clock,
  Warehouse,
  Layers,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

interface StockRow {
  productId: string;
  productCode: string;
  description: string;
  unit: string;
  siigoBodegaCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  locationCount: number;
  quantity: number;
  reserved: number;
  available: number;
  canAdd: boolean;
  isNegative: boolean;
  reviewRequired: boolean;
  netWeightGrams: number | null;
  syncedAt: string | null;
}

interface ExistenciaResponse {
  items: StockRow[];
  totals: {
    groups: number;
    positive: number;
    zero: number;
    negative: number;
    totalQuantity: number;
    totalAvailable: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface SyncState {
  lastSuccessful: {
    finishedAt: string | null;
    reportDate: string | null;
    fileName: string | null;
  } | null;
  staleMinutes: number;
  minutesSinceSync: number | null;
  isStale: boolean;
}

const PAGE_SIZE = 25;

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    value
  );
}

export default function InventarioPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bodega, setBodega] = useState<string>("");
  const [availability, setAvailability] = useState<
    "all" | "positive" | "zero" | "negative"
  >("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams();
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (bodega) query.set("siigoBodegaCode", bodega);
  if (availability !== "all") query.set("availability", availability);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const { data, isLoading, isFetching, error, refetch } =
    useApiQuery<ExistenciaResponse>(`/api/existencias?${query.toString()}`);

  const sync = useApiQuery<SyncState>("/api/siigo/importaciones?limit=1");

  const items = useMemo(() => data?.items ?? [], [data]);
  const totals = data?.totals;
  const pagination = data?.pagination;

  const bodegaOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      map.set(
        item.siigoBodegaCode,
        item.warehouseName ?? `Bodega ${item.siigoBodegaCode}`
      );
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  const stale = sync.data?.isStale ?? true;
  const minutesSince = sync.data?.minutesSinceSync;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-primary-600" />
            Inventario
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Existencias consolidadas por producto y bodega, actualizadas desde
            Siigo Pyme.
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
            stale
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          )}
        >
          {stale ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 shrink-0" />
          )}
          <div className="leading-tight">
            <p className="font-medium">
              {stale ? "Inventario desactualizado" : "Inventario actualizado"}
            </p>
            <p className="text-xs opacity-80">
              {minutesSince === null || minutesSince === undefined
                ? "Nunca se ha sincronizado"
                : `Última sincronización hace ${Math.round(minutesSince)} min`}
              {sync.data?.lastSuccessful?.reportDate
                ? ` · Reporte del ${sync.data.lastSuccessful.reportDate}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Resumen por disponibilidad */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Productos consolidados</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
              {formatNumber(totals.groups)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Con disponibilidad</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
              {formatNumber(totals.positive)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Sin existencias</p>
            <p className="text-2xl font-bold text-gray-500 mt-1 tabular-nums">
              {formatNumber(totals.zero)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Con saldo negativo</p>
            <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
              {formatNumber(totals.negative)}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o código (con o sin guiones)…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              aria-label="Buscar producto"
            />
          </div>

          <select
            value={bodega}
            onChange={(event) => {
              setBodega(event.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
            aria-label="Filtrar por bodega"
          >
            <option value="">Todas las bodegas</option>
            {bodegaOptions.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              value={availability}
              onChange={(event) => {
                setAvailability(event.target.value as typeof availability);
                setPage(1);
              }}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
              aria-label="Filtrar por disponibilidad"
            >
              <option value="all">Toda la disponibilidad</option>
              <option value="positive">Con disponibilidad</option>
              <option value="zero">Sin existencias</option>
              <option value="negative">Saldo negativo</option>
            </select>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              aria-label="Actualizar"
            >
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudo cargar el inventario: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando existencias…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              No hay existencias que coincidan con los filtros.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Verifique que el reporte de Siigo Pyme haya sido importado.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Código
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Producto
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700">
                      Bodega
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-center">
                      Ubicaciones
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">
                      Existencia
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">
                      Comprometido
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">
                      Disponible
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">
                      Peso unit.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr
                      key={`${item.productId}-${item.siigoBodegaCode}`}
                      className={cn(
                        "hover:bg-gray-50",
                        item.reviewRequired && "bg-amber-50/60"
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {item.productCode}
                        {item.reviewRequired && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5"
                            title="El saldo recalculado no coincide con el reportado por Siigo"
                          >
                            <AlertTriangle className="w-3 h-3" /> Revisar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {item.description}
                        </p>
                        <p className="text-[11px] text-gray-500">{item.unit}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse className="w-3 h-3 text-gray-400" />
                          {item.warehouseName ?? `Bodega ${item.siigoBodegaCode}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3 h-3 text-gray-400" />
                          {item.locationCount}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-medium tabular-nums",
                          item.isNegative ? "text-red-600" : "text-gray-900"
                        )}
                      >
                        {formatNumber(item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {item.reserved > 0 ? formatNumber(item.reserved) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-semibold tabular-nums",
                          item.available < 0
                            ? "text-red-600"
                            : item.available === 0
                              ? "text-gray-400"
                              : "text-emerald-700"
                        )}
                      >
                        {formatNumber(item.available)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {item.netWeightGrams
                          ? `${formatNumber(item.netWeightGrams / 1000)} kg`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.siigoBodegaCode}`}
                  className={cn("p-4", item.reviewRequired && "bg-amber-50/60")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-gray-500">
                        {item.productCode}
                      </p>
                      <p className="font-medium text-gray-900 text-sm leading-snug">
                        {item.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.warehouseName ?? `Bodega ${item.siigoBodegaCode}`} ·{" "}
                        {item.locationCount} ubicación(es)
                      </p>
                    </div>
                    {item.reviewRequired && (
                      <span className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                        Revisar
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-[10px] text-gray-500">Existencia</p>
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          item.isNegative ? "text-red-600" : "text-gray-900"
                        )}
                      >
                        {formatNumber(item.quantity)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-[10px] text-gray-500">Comprometido</p>
                      <p className="font-semibold tabular-nums text-gray-700">
                        {formatNumber(item.reserved)}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-2">
                      <p className="text-[10px] text-emerald-700">Disponible</p>
                      <p className="font-semibold tabular-nums text-emerald-800">
                        {formatNumber(item.available)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-600">
                  Página {pagination.page} de {pagination.totalPages} ·{" "}
                  {pagination.total} productos por bodega
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white disabled:opacity-40 hover:bg-gray-50"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
