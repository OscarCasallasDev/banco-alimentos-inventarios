"use client";

import { useMemo, useState } from "react";
import { ArrowUpFromLine, Plus, Search, X, AlertCircle, Layers } from "lucide-react";
import { cn, formatDateOnly, formatNumber, todayIsoDate } from "@/lib/utils";
import {
  useApiQuery,
  useInvalidateStockQueries,
} from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";

interface Dispatch {
  id: string;
  number: string;
  receiptId: string;
  date: string;
  status: "PENDING" | "PREPARED" | "DISPATCHED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: {
    id: string;
    productId: string;
    quantity: number;
    lots: {
      id: string;
      lotId: string;
      lotCode: string;
      quantity: number;
      expirationDate: string | null;
    }[];
  }[];
}

interface Receipt {
  id: string;
  number: string;
  format: string;
}

interface AvailableLot {
  id: string;
  code: string;
  externalCode: string | null;
  expirationDate: string | null;
  daysToExpire: number | null;
  quantityAvailable: number;
  stockUnit: string;
  weightAvailableKg: number | null;
  expirationStatus: string;
  expirationSeverity: "none" | "ok" | "warning" | "critical" | "expired";
  expirationLabel: string;
  isExpired: boolean;
  fefoOrder: number;
  suggestedQuantity: number;
}

interface AvailabilityRow {
  productId: string;
  warehouseId: string;
  quantity: number;
  availableQuantity: number;
  sufficient: boolean;
  hasExpiredLots: boolean;
  lots: AvailableLot[];
}

const emptyForm: {
  number: string;
  receiptId: string;
  date: string;
  status: "PENDING" | "PREPARED" | "DISPATCHED" | "CANCELLED";
  notes: string;
} = {
  number: "",
  receiptId: "",
  date: todayIsoDate(),
  status: "DISPATCHED",
  notes: "",
};

export default function SalidasPage() {
  const {
    data: dispatches = [],
    isLoading,
    isError: loadError,
    error: queryError,
    refetch: refetchDispatches,
  } = useApiQuery<Dispatch[]>("/api/despachos");

  const { data: receipts = [] } = useApiQuery<Receipt[]>("/api/recibos");

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const invalidateStockQueries = useInvalidateStockQueries();

  // Vista previa de los lotes disponibles del recibo seleccionado.
  const { data: availability = [], isLoading: loadingAvailability } =
    useApiQuery<AvailabilityRow[]>(
      form.receiptId
        ? `/api/despachos/disponibilidad?receiptId=${form.receiptId}`
        : "/api/despachos/disponibilidad",
      { enabled: Boolean(form.receiptId) }
    );

  /**
   * Cantidad asignada a un lote.
   *
   * Si el usuario no interviene, se usa la propuesta FEFO del servidor; en
   * cuanto edita un lote, su valor manda (incluido el 0).
   */
  function assignedQuantity(lot: AvailableLot): number {
    return allocation[lot.id] ?? lot.suggestedQuantity;
  }

  const allocationsPayload = useMemo(() => {
    const porLinea = new Map<
      string,
      {
        productId: string;
        warehouseId: string;
        lots: { lotId: string; quantity: number }[];
      }
    >();

    for (const fila of availability) {
      const lotes = fila.lots
        .map((lote) => ({
          lotId: lote.id,
          // Sin intervención del usuario se usa la propuesta FEFO del servidor.
          quantity: allocation[lote.id] ?? lote.suggestedQuantity,
        }))
        .filter((lote) => lote.quantity > 0);

      if (lotes.length === 0) continue;

      const clave = `${fila.productId}:${fila.warehouseId}`;
      porLinea.set(clave, {
        productId: fila.productId,
        warehouseId: fila.warehouseId,
        lots: lotes,
      });
    }

    return [...porLinea.values()];
  }, [availability, allocation]);

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setAllocation({});
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/despachos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          allocations:
            allocationsPayload.length > 0 ? allocationsPayload : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error al guardar");
        return;
      }

      setShowModal(false);
      void refetchDispatches();
      void invalidateStockQueries();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const filtered = dispatches.filter((d) =>
    d.number.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PREPARED: "bg-blue-100 text-blue-800",
    DISPATCHED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Despachos</h1>
          <p className="text-gray-600 mt-1">
            Gestión de despachos y salidas por lote
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Despacho
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {loadError && (
        <QueryError error={queryError} onRetry={() => void refetchDispatches()} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Número
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Fecha
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Estado
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Lotes consumidos
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Notas
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <ArrowUpFromLine className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay despachos registrados
                  </td>
                </tr>
              ) : (
                filtered.map((dispatch) => {
                  const lotes = (dispatch.items ?? []).flatMap(
                    (item) => item.lots ?? []
                  );

                  return (
                    <tr
                      key={dispatch.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4 font-mono text-gray-900">
                        {dispatch.number}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDateOnly(dispatch.date)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                            statusColors[dispatch.status]
                          )}
                        >
                          {dispatch.status === "PENDING"
                            ? "Pendiente"
                            : dispatch.status === "PREPARED"
                              ? "Preparado"
                              : dispatch.status === "DISPATCHED"
                                ? "Despachado"
                                : "Cancelado"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {lotes.length === 0 ? (
                          <span className="text-xs text-gray-400">
                            sin lotes (histórico)
                          </span>
                        ) : (
                          <div className="space-y-1">
                            {lotes.map((lote) => (
                              <div
                                key={lote.id}
                                className="text-xs text-gray-700"
                              >
                                <span className="font-mono">{lote.lotCode}</span>{" "}
                                · {formatNumber(Number(lote.quantity))}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {dispatch.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Nuevo Despacho
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número *
                  </label>
                  <input
                    type="text"
                    value={form.number}
                    onChange={(e) =>
                      setForm({ ...form, number: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Automático (ej: DES-2026-0001)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm({ ...form, date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recibo *
                </label>
                <select
                  value={form.receiptId}
                  onChange={(e) => {
                    setForm({ ...form, receiptId: e.target.value });
                    // Al cambiar de recibo se reinicia la asignación manual:
                    // la propuesta FEFO es de otro producto.
                    setAllocation({});
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Seleccionar recibo...</option>
                  {receipts.map((receipt) => (
                    <option key={receipt.id} value={receipt.id}>
                      {receipt.number} ({receipt.format})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Los productos, cantidades y bodegas se toman automáticamente
                  del recibo, su factura y el pedido asociado.
                </p>
              </div>

              {/* Selección de lotes */}
              {form.receiptId && (
                <div className="border border-gray-200 rounded-lg">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Lotes a despachar
                    </h3>
                    <span className="text-xs text-gray-500">
                      Propuesta FEFO (primero vence, primero sale)
                    </span>
                  </div>

                  <div className="p-4 space-y-4">
                    {loadingAvailability ? (
                      <p className="text-sm text-gray-500">
                        Consultando lotes disponibles…
                      </p>
                    ) : availability.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Este recibo no tiene productos que despachar.
                      </p>
                    ) : (
                      availability.map((fila) => (
                        <div
                          key={`${fila.productId}-${fila.warehouseId}`}
                          className="space-y-2"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-800">
                              Producto {fila.productId.slice(0, 8)}…
                            </span>
                            <span
                              className={cn(
                                "text-xs font-medium px-2 py-1 rounded-full",
                                fila.sufficient
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              )}
                            >
                              Requerido {formatNumber(fila.quantity)} ·{" "}
                              disponible {formatNumber(fila.availableQuantity)}
                            </span>
                          </div>

                          {!fila.sufficient && (
                            <p className="text-xs text-red-700">
                              No hay existencias suficientes para esta línea.
                            </p>
                          )}

                          {fila.hasExpiredLots && (
                            <p className="text-xs text-red-700">
                              Hay lotes vencidos: no se pueden despachar.
                            </p>
                          )}

                          <div className="space-y-1">
                            {fila.lots.map((lote) => (
                              <div
                                key={lote.id}
                                className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-mono text-xs text-gray-800">
                                    {lote.code}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {lote.expirationDate
                                      ? `Vence ${formatDateOnly(lote.expirationDate)}`
                                      : "Sin vencimiento"}
                                    {" · "}
                                    {formatNumber(lote.quantityAvailable)}{" "}
                                    {lote.stockUnit} disponibles
                                    {lote.weightAvailableKg !== null &&
                                      ` · ${formatNumber(lote.weightAvailableKg)} kg`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={lote.quantityAvailable}
                                    step="0.001"
                                    disabled={lote.isExpired}
                                    value={assignedQuantity(lote)}
                                    onChange={(e) =>
                                      setAllocation((current) => ({
                                        ...current,
                                        [lote.id]: Number(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-right disabled:bg-gray-100"
                                  />
                                  {lote.isExpired && (
                                    <span className="text-[10px] text-red-700">
                                      vencido
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado *
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as
                        | "PENDING"
                        | "PREPARED"
                        | "DISPATCHED"
                        | "CANCELLED",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="PENDING">Pendiente</option>
                  <option value="PREPARED">Preparado</option>
                  <option value="DISPATCHED">Despachado (descuenta stock)</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Solo el estado «Despachado» descuenta inventario.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar Despacho"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
