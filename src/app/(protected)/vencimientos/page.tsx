"use client";

/**
 * Módulo de Vencimientos y Alertas.
 *
 * Destaca los productos que vencen la SEMANA SIGUIENTE (calculada
 * automáticamente en hora de Colombia) y reúne las alertas de inventario:
 * saldos negativos, sin existencias, vencidos y discrepancias de importación.
 */

import { useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  Ban,
  Clock,
  PackageX,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Upload,
  Info,
  ShieldAlert,
  Boxes,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

type Category =
  | "next_week"
  | "current_week"
  | "expired"
  | "next_15"
  | "next_30"
  | "all";

interface VencimientoRow {
  id: string;
  productCode: string;
  productName: string | null;
  lotCode: string | null;
  siigoBodegaCode: number | null;
  /** Nombre legible de la bodega. */
  warehouseName: string | null;
  locationCode: number | null;
  quantity: number | null;
  unit: string | null;
  expirationDate: string | null;
  daysLeft: number | null;
}

interface Response {
  summary: {
    nextWeek: number;
    currentWeek: number;
    expired: number;
    next15: number;
    next30: number;
    negativeStock: number;
    zeroStock: number;
    discrepancies: number;
    expirationRecords: number;
  };
  discrepancies: { code: string; label: string; count: number; detail: string }[];
  ranges: {
    today: string;
    currentWeek: { from: string; to: string };
    nextWeek: { from: string; to: string };
    next15: { from: string; to: string };
    next30: { from: string; to: string };
  };
  items: VencimientoRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  imports: {
    id: string;
    fileName: string | null;
    status: string;
    processedRows: number;
    rejectedRows: number;
    createdAt: string;
  }[];
}

const CATEGORIES: { key: Category; label: string; icon: typeof Clock }[] = [
  { key: "next_week", label: "Vencen la próxima semana", icon: CalendarClock },
  { key: "current_week", label: "Vencen esta semana", icon: Clock },
  { key: "expired", label: "Vencidos", icon: Ban },
  { key: "next_15", label: "Próximos 15 días", icon: Clock },
  { key: "next_30", label: "Próximos 30 días", icon: Clock },
  { key: "all", label: "Todos", icon: Boxes },
];

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

function daysLabel(days: number | null): { text: string; className: string } {
  if (days === null) return { text: "—", className: "text-gray-500" };
  if (days < 0)
    return { text: `Vencido hace ${Math.abs(days)} día(s)`, className: "text-red-700 font-semibold" };
  if (days === 0) return { text: "Vence hoy", className: "text-red-700 font-semibold" };
  if (days <= 7) return { text: `En ${days} día(s)`, className: "text-amber-700 font-semibold" };
  return { text: `En ${days} día(s)`, className: "text-gray-700" };
}

export default function VencimientosPage() {
  const [category, setCategory] = useState<Category>("next_week");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  query.set("category", category);
  if (appliedSearch) query.set("search", appliedSearch);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const { data, isLoading, isFetching, error, refetch } = useApiQuery<Response>(
    `/api/vencimientos?${query.toString()}`
  );

  const summary = data?.summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-primary-600" />
            Vencimientos y alertas
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Productos que vencen la próxima semana y situaciones que requieren
            atención.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Actualizar"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => {
              window.alert(
                "El módulo está preparado para importar el archivo de vencimientos.\n\n" +
                  "El Banco todavía no ha entregado ese archivo, por lo que no se conoce su estructura y no se debe suponer.\n\n" +
                  "Cuando se reciba, se añadirá el lector de sus columnas y se cargarán las fechas por código de Siigo y código de lote."
              );
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
          >
            <Upload className="w-4 h-4" />
            Importar archivo de vencimientos
          </button>
        </div>
      </div>

      {/* Estado del archivo */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">
            Importación de vencimientos: estructura preparada, archivo pendiente
          </p>
          <p className="mt-0.5 text-xs">
            La tabla, las alertas y la interfaz están listas. El lector de
            columnas se escribirá cuando el Banco entregue el archivo, para no
            suponer un formato. Mientras tanto, el módulo calcula las alertas de
            inventario y los rangos de vencimiento a partir de los datos
            importados.
          </p>
        </div>
      </div>

      {/* Resumen de alertas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> Próxima semana
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
            {summary?.nextWeek ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {data?.ranges?.nextWeek
              ? `${data.ranges.nextWeek.from} → ${data.ranges.nextWeek.to}`
              : ""}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5" /> Vencidos
          </p>
          <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
            {summary?.expired ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">fecha ya pasada</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <PackageX className="w-3.5 h-3.5" /> Saldo negativo
          </p>
          <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
            {summary?.negativeStock ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            disponibilidad &lt; 0
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <PackageX className="w-3.5 h-3.5" /> Sin existencias
          </p>
          <p className="text-2xl font-bold text-gray-600 mt-1 tabular-nums">
            {summary?.zeroStock ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            disponibilidad = 0
          </p>
        </div>
      </div>

      {/* Categorías */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((item) => {
            const Icon = item.icon;
            const active = category === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setCategory(item.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors",
                  active
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-white/20" : "bg-gray-100 text-gray-600"
                  )}
                >
                  {item.key === "next_week"
                    ? (summary?.nextWeek ?? 0)
                    : item.key === "current_week"
                      ? (summary?.currentWeek ?? 0)
                      : item.key === "expired"
                        ? (summary?.expired ?? 0)
                        : item.key === "next_15"
                          ? (summary?.next15 ?? 0)
                          : item.key === "next_30"
                            ? (summary?.next30 ?? 0)
                            : (summary?.expirationRecords ?? 0)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(search.trim());
                  setPage(1);
                }
              }}
              placeholder="Buscar por producto, código o lote…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              aria-label="Buscar vencimiento"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setAppliedSearch(search.trim());
              setPage(1);
            }}
            className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Tabla de vencimientos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            Lotes con vencimiento
          </h2>
        </div>

        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudo cargar el módulo: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando vencimientos…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              {summary?.expirationRecords === 0
                ? "Todavía no se ha importado el archivo de vencimientos."
                : "No hay lotes que coincidan con esta categoría."}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Las fechas de vencimiento se cargan desde el archivo de
              vencimientos del Banco.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">Código</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Producto</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Lote</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Bodega / Ubic.</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Cantidad</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Vence</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const days = daysLabel(item.daysLeft);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {item.productCode}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {item.productName ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {item.lotCode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {item.warehouseName ??
                            (item.siigoBodegaCode !== null
                              ? `Bodega ${item.siigoBodegaCode}`
                              : "—")}
                          {item.locationCode !== null && ` · Ub. ${item.locationCode}`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                          {item.quantity !== null
                            ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(item.quantity)} ${item.unit ?? ""}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatDate(item.expirationDate)}
                        </td>
                        <td className={cn("px-4 py-3", days.className)}>
                          {days.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-600">
                  Página {pagination.page} de {pagination.totalPages} ·{" "}
                  {pagination.total} registro(s)
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

      {/* Discrepancias */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          Discrepancias de la información importada
        </h2>
        {(data?.discrepancies?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-emerald-600" />
            No se detectaron inconsistencias. La consolidación por descripción
            resolvió las diferencias entre ubicaciones.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.discrepancies.map((item) => (
              <li
                key={item.code}
                className="flex items-start gap-2 p-2 rounded-lg bg-amber-50/60 border border-amber-100"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.label} · <b>{item.count}</b>
                  </p>
                  <p className="text-xs text-gray-600">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial de importaciones de vencimientos */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Historial de importaciones de vencimientos
        </h2>
        {(data?.imports?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-600">
            Todavía no se ha importado ningún archivo de vencimientos.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {data!.imports.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {run.fileName ?? "Sin nombre"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(run.createdAt).toLocaleString("es-CO")} ·{" "}
                    {run.processedRows} registros · {run.rejectedRows} rechazados
                  </p>
                </div>
                <span className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
