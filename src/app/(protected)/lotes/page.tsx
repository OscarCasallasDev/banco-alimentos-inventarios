"use client";

import { useState } from "react";
import { Layers, Search, Download, ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatDateOnly, formatNumber } from "@/lib/utils";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import {
  ExpirationBadge,
  LotStatusBadge,
  type ExpirationSeverity,
} from "@/components/lots/LotComponents";

interface LotRow {
  id: string;
  code: string;
  externalCode: string | null;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  status: string;
  origin: string;
  traceability: string;
  description: string | null;
  notes: string | null;
  expirationDate: string | null;
  receivedAt: string | null;
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

interface LotsResponse {
  items: LotRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const FILTROS_VENCIMIENTO = [
  { value: "all", label: "Todos" },
  { value: "today", label: "Vencen hoy" },
  { value: "tomorrow", label: "Vencen mañana" },
  { value: "soon", label: "Próximos a vencer" },
  { value: "expired", label: "Ya vencidos" },
  { value: "missing", label: "Sin fecha" },
  { value: "range", label: "Rango de fechas" },
];

export default function LotesPage() {
  const [search, setSearch] = useState("");
  const [expiration, setExpiration] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hasStock, setHasStock] = useState(true);
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  query.set("expiration", expiration);
  query.set("hasStock", String(hasStock));
  if (expiration === "range") {
    if (from) query.set("expirationFrom", from);
    if (to) query.set("expirationTo", to);
  }
  query.set("page", String(page));
  query.set("pageSize", "25");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useApiQuery<LotsResponse>(`/api/lotes?${query.toString()}`);

  const items = data?.items ?? [];

  function exportar() {
    const url = `/api/reportes/lotes/export?${query.toString()}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lotes</h1>
          <p className="text-gray-600 mt-1">
            Trazabilidad por ingreso: cada lote conserva su cantidad, su peso
            y su fecha de vencimiento
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={items.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código de lote, producto o código externo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Vencimiento
            </label>
            <select
              value={expiration}
              onChange={(e) => {
                setExpiration(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              {FILTROS_VENCIMIENTO.map((filtro) => (
                <option key={filtro.value} value={filtro.value}>
                  {filtro.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {expiration === "range" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Vence desde
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Vence hasta
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={hasStock}
            onChange={(e) => {
              setHasStock(e.target.checked);
              setPage(1);
            }}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Mostrar solo lotes con existencia disponible
        </label>
      </div>

      {isError && <QueryError error={error} onRetry={() => void refetch()} />}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3" />
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Lote
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Producto
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Ingreso
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Vencimiento
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-600">
                  Recibido
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-600">
                  Disponible
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-600">
                  Peso disp.
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Bodega
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <Layers className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay lotes con estos criterios
                  </td>
                </tr>
              ) : (
                items.map((lot) => (
                  <tr
                    key={lot.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setDetalle(detalle === lot.id ? null : lot.id)
                        }
                        className="text-gray-400 hover:text-primary-600"
                        aria-label={`Ver detalle del lote ${lot.code}`}
                      >
                        {detalle === lot.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-gray-900">
                      {lot.code}
                      {lot.externalCode && (
                        <span className="block text-[10px] text-gray-400">
                          {lot.externalCode}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-900">
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
                    <td className="py-3 px-3 text-gray-600">
                      {lot.receivedAt ? formatDateOnly(lot.receivedAt) : "—"}
                    </td>
                    <td className="py-3 px-3">
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
                    <td className="py-3 px-3 text-right text-gray-700">
                      {formatNumber(lot.quantityReceived)}
                      <span className="ml-1 text-xs text-gray-400">
                        {lot.stockUnit}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-900">
                      {formatNumber(lot.quantityAvailable)}
                      <span className="ml-1 text-xs text-gray-400">
                        {lot.stockUnit}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700">
                      {lot.weightAvailableKg === null ? (
                        <span className="text-xs text-gray-400">sin dato</span>
                      ) : (
                        `${formatNumber(lot.weightAvailableKg)} kg`
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-600">
                      {lot.warehouseCode}
                    </td>
                    <td className="py-3 px-3">
                      <LotStatusBadge status={lot.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {data.total} lote(s) · página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={data.page >= data.totalPages}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {detalle && (
        <DetalleLote
          lotId={detalle}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

/**
 * Detalle del lote: movimientos y asignaciones.
 */
function DetalleLote({
  lotId,
  onClose,
}: {
  lotId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useApiQuery<{
    code: string;
    movements: {
      id: string;
      type: string;
      quantity: number;
      lotBalanceAfter: number | null;
      documentType: string | null;
      notes: string | null;
      createdAt: string;
    }[];
    dispatchAllocations: { id: string; quantity: number }[];
    auditAllocations: {
      id: string;
      systemQuantity: number;
      physicalQuantity: number | null;
      difference: number | null;
    }[];
    notes: string | null;
  }>(`/api/lotes/${lotId}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Lote {data?.code ?? lotId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">Cargando detalle…</p>
          ) : (
            <>
              {data?.notes && (
                <p className="text-sm text-gray-600">{data.notes}</p>
              )}

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Movimientos del lote
                </h3>
                {data?.movements.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-600">
                          <th className="text-left py-1 px-2">Fecha</th>
                          <th className="text-left py-1 px-2">Tipo</th>
                          <th className="text-left py-1 px-2">Documento</th>
                          <th className="text-right py-1 px-2">Cantidad</th>
                          <th className="text-right py-1 px-2">Saldo lote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.movements.map((movimiento) => (
                          <tr
                            key={movimiento.id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-1 px-2 text-gray-600">
                              {new Date(
                                movimiento.createdAt
                              ).toLocaleString("es-CO")}
                            </td>
                            <td className="py-1 px-2">{movimiento.type}</td>
                            <td className="py-1 px-2 text-gray-600">
                              {movimiento.documentType ?? "—"}
                            </td>
                            <td
                              className={cn(
                                "py-1 px-2 text-right font-medium",
                                Number(movimiento.quantity) < 0
                                  ? "text-red-700"
                                  : "text-emerald-700"
                              )}
                            >
                              {formatNumber(Number(movimiento.quantity))}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {movimiento.lotBalanceAfter === null
                                ? "—"
                                : formatNumber(
                                    Number(movimiento.lotBalanceAfter)
                                  )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Este lote no tiene movimientos registrados.
                  </p>
                )}
              </div>

              {data?.dispatchAllocations.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Asignaciones en salidas
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {data.dispatchAllocations.map((asignacion) => (
                      <li key={asignacion.id}>
                        {formatNumber(Number(asignacion.quantity))} unidades
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data?.auditAllocations.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Ajustes de auditoría
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {data.auditAllocations.map((ajuste) => (
                      <li key={ajuste.id}>
                        Sistema {formatNumber(Number(ajuste.systemQuantity))} ·
                        Físico{" "}
                        {ajuste.physicalQuantity === null
                          ? "—"
                          : formatNumber(Number(ajuste.physicalQuantity))}{" "}
                        · Diferencia{" "}
                        {ajuste.difference === null
                          ? "—"
                          : formatNumber(Number(ajuste.difference))}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
