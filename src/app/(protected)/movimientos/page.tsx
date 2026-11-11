"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";

interface MovementRow {
  id: string;
  type: "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";
  productId: string;
  productCode: string;
  productName: string;
  stockUnit: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  balanceAfter: number;
  lotId: string | null;
  lotCode: string | null;
  lotBalanceAfter: number | null;
  documentId: string | null;
  documentType: string | null;
  notes: string | null;
  createdAt: string;
  isHistorical: boolean;
}

interface MovementsResponse {
  items: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const TIPOS = [
  { value: "ALL", label: "Todos" },
  { value: "ENTRY", label: "Entradas" },
  { value: "EXIT", label: "Salidas" },
  { value: "ADJUSTMENT", label: "Ajustes" },
  { value: "AUDIT", label: "Auditorías" },
];

const TIPO_STYLES: Record<string, string> = {
  ENTRY: "bg-emerald-100 text-emerald-800",
  EXIT: "bg-orange-100 text-orange-800",
  ADJUSTMENT: "bg-purple-100 text-purple-800",
  AUDIT: "bg-red-100 text-red-800",
};

const TIPO_LABELS: Record<string, string> = {
  ENTRY: "Entrada",
  EXIT: "Salida",
  ADJUSTMENT: "Ajuste",
  AUDIT: "Auditoría",
};

export default function MovimientosPage() {
  const [type, setType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  query.set("type", type);
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  query.set("page", String(page));
  query.set("pageSize", "50");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useApiQuery<MovementsResponse>(`/api/movimientos?${query.toString()}`);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
        <p className="text-gray-600 mt-1">
          Libro de existencias: cada movimiento conserva el lote afectado y el
          saldo que dejó en el lote
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tipo de movimiento
            </label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            >
              {TIPOS.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {isError && <QueryError error={error} onRetry={() => void refetch()} />}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Fecha
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Tipo
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Producto
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Lote
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">
                  Cantidad
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">
                  Saldo del lote
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Documento
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Bodega
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay movimientos con estos criterios
                  </td>
                </tr>
              ) : (
                items.map((movimiento) => (
                  <tr
                    key={movimiento.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {new Date(movimiento.createdAt).toLocaleString("es-CO")}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          TIPO_STYLES[movimiento.type] ??
                            "bg-gray-100 text-gray-700"
                        )}
                      >
                        {TIPO_LABELS[movimiento.type] ?? movimiento.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900">
                      <span className="font-mono text-xs text-gray-500">
                        {movimiento.productCode}
                      </span>{" "}
                      {movimiento.productName}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {movimiento.lotCode ?? (
                        <span
                          className="text-gray-400"
                          title="Movimiento anterior al modelo de lotes: no se le inventa un lote"
                        >
                          sin lote (histórico)
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "py-3 px-4 text-right font-medium",
                        Number(movimiento.quantity) < 0
                          ? "text-red-700"
                          : "text-emerald-700"
                      )}
                    >
                      {formatNumber(Number(movimiento.quantity))}{" "}
                      <span className="text-xs text-gray-400">
                        {movimiento.stockUnit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {movimiento.lotBalanceAfter === null
                        ? "—"
                        : formatNumber(Number(movimiento.lotBalanceAfter))}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {movimiento.documentType ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {movimiento.warehouseCode}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {data.total} movimiento(s) · página {data.page} de{" "}
            {data.totalPages}
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
    </div>
  );
}
