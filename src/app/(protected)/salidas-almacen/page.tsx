/**
 * Listado de Salidas de Almacén.
 *
 * Una salida es el registro OPERATIVO de la entrega que el almacenista
 * prepara y la persona de despacho recibe. El sistema no crea facturas ni
 * recibos: el comprobante sirve de soporte para continuar en Siigo Pyme.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpFromLine,
  Plus,
  Search,
  Printer,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  PackageCheck,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

interface SalidaItem {
  id: string;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCode: string | null;
  totalWeightKg: number | null;
  weightKnown: boolean;
}

interface Salida {
  id: string;
  number: string;
  date: string;
  time: string;
  status: string;
  reconciliationStatus: string;
  programName: string;
  warehouseName: string | null;
  userName: string;
  receiverName: string | null;
  totalQuantity: number;
  totalWeightKg: number | null;
  weightPartial: boolean;
  itemCount: number;
  createdAt: string;
  items: SalidaItem[];
}

interface SalidasResponse {
  items: Salida[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    todayCount: number;
    todayQuantity: number;
    pendingReconciliation: number;
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  GENERATED: "Generada",
  DELIVERED: "Recibida en despacho",
  CONFIRMED_SIIGO: "Confirmada en Siigo",
  CANCELLED: "Anulada",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  GENERATED: "bg-blue-50 text-blue-700 border-blue-200",
  DELIVERED: "bg-violet-50 text-violet-700 border-violet-200",
  CONFIRMED_SIIGO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    value
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

export default function SalidasAlmacenPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
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
  if (status) query.set("status", status);
  query.set("page", String(page));
  query.set("pageSize", "25");

  const { data, isLoading, isFetching, error, refetch } = useApiQuery<
    SalidasResponse
  >(`/api/salidas?${query.toString()}`);

  const items = data?.items ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowUpFromLine className="w-7 h-7 text-primary-600" />
            Salidas de almacén
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Preparación de entregas y comprobantes para el despacho.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Actualizar"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
          <Link
            href="/salidas-almacen/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva salida
          </Link>
        </div>
      </div>

      {/* Indicadores */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Salidas generadas</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.byStatus.GENERATED ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Recibidas en despacho</p>
            <p className="text-2xl font-bold text-violet-700 mt-1">
              {summary.byStatus.DELIVERED ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Hoy</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.todayCount}
              <span className="text-sm font-normal text-gray-500 ml-2">
                {formatNumber(summary.todayQuantity)} und.
              </span>
            </p>
          </div>
          <div
            className={cn(
              "rounded-xl border shadow-sm p-4",
              summary.pendingReconciliation > 0
                ? "bg-amber-50 border-amber-200"
                : "bg-white border-gray-200"
            )}
          >
            <p className="text-xs text-gray-500">Por conciliar con Siigo</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
              {summary.pendingReconciliation}
              {summary.pendingReconciliation > 0 && (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número o receptor…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              aria-label="Buscar salida"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudieron cargar las salidas: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando salidas…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <PackageCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">No hay salidas registradas.</p>
            <Link
              href="/salidas-almacen/nueva"
              className="inline-block mt-3 text-sm font-medium text-primary-600 hover:underline"
            >
              Crear la primera salida
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((salida) => (
              <div key={salida.id} className="p-4 hover:bg-gray-50">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">
                        {salida.number}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold rounded-full border px-2 py-0.5",
                          STATUS_STYLES[salida.status] ?? STATUS_STYLES.DRAFT
                        )}
                      >
                        {STATUS_LABELS[salida.status] ?? salida.status}
                      </span>
                      {salida.reconciliationStatus === "PENDING" &&
                        salida.status !== "DRAFT" &&
                        salida.status !== "CANCELLED" && (
                          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pendiente de conciliar
                          </span>
                        )}
                      {salida.reconciliationStatus === "MATCHED" && (
                        <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conciliada
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-700 mt-1">
                      <span className="font-medium">{salida.programName}</span>
                      {salida.warehouseName && (
                        <span className="text-gray-500"> · {salida.warehouseName}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(salida.date)} {salida.time} · {salida.userName}
                      {salida.receiverName ? ` · Recibe: ${salida.receiverName}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500">Referencias</p>
                      <p className="font-semibold text-gray-900">{salida.itemCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500">Unidades</p>
                      <p className="font-semibold text-gray-900 tabular-nums">
                        {formatNumber(salida.totalQuantity)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500">Peso</p>
                      <p className="font-semibold text-gray-900 tabular-nums">
                        {salida.totalWeightKg !== null
                          ? `${formatNumber(salida.totalWeightKg)} kg`
                          : "—"}
                        {salida.weightPartial && (
                          <span className="block text-[10px] text-amber-600">
                            parcial
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/salidas-almacen/${salida.id}`}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                      >
                        Ver
                      </Link>
                      {salida.status !== "DRAFT" && (
                        <Link
                          href={`/salidas-almacen/${salida.id}/comprobante`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="hidden sm:inline">Comprobante</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">
              Página {pagination.page} de {pagination.totalPages} ·{" "}
              {pagination.total} salidas
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
      </div>
    </div>
  );
}
