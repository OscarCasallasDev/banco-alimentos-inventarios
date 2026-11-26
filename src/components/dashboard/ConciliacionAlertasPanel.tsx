"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { apiSend } from "@/lib/api/client";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

interface RelatedOrder {
  id: string;
  number: string;
  status: string;
  userName: string;
  createdAt: string;
  quantity: number;
}

interface Alert {
  id: string;
  productCode: string;
  productName: string;
  siigoBodegaCode: number;
  previousQuantity: number;
  newQuantity: number;
  expectedQuantity: number;
  difference: number;
  committedQuantity: number;
  note: string | null;
  createdAt: string;
  previousRunFinishedAt: string | null;
  currentRunFinishedAt: string | null;
  relatedOrders: RelatedOrder[];
}

interface AlertList {
  items: Alert[];
  pending: number;
  lastImportAt: string | null;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const text = formatNumber(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : "0";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

const STATUS_LABELS: Record<string, string> = {
  GENERATED: "Generada",
  DELIVERED: "Recibida en despacho",
  CONFIRMED_SIIGO: "Confirmada en Siigo",
};

export default function ConciliacionAlertasPanel() {
  const { data, isLoading, isError, refetch, isFetching } =
    useApiQuery<AlertList>("/api/conciliacion/alertas?limit=50");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function gestionar(id: string, action: "validate" | "review") {
    setBusy(id);
    setError(null);
    try {
      await apiSend(`/api/conciliacion/alertas/${id}`, "PUT", {
        action,
        note: notes[id]?.trim() || null,
      });
      if (action === "validate") setExpanded(null);
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Revisando discrepancias de inventario…
        </p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm text-red-700">
          No se pudieron cargar las alertas de conciliación.
        </p>
      </section>
    );
  }

  const pending = data?.pending ?? 0;
  const items = data?.items ?? [];

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Alertas de conciliación de inventario
            </h2>
            <p className="text-xs text-gray-500">
              Diferencias entre importaciones consecutivas de Siigo Pyme.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold",
              pending > 0
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
            )}
          >
            {pending} pendiente{pending === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
        Última importación: {formatDateTime(data?.lastImportAt)}
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-gray-700">
            No hay discrepancias pendientes de revisión.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((alert) => {
            const open = expanded === alert.id;
            return (
              <article key={alert.id} className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-gray-500">
                      {alert.productCode} · Bodega {alert.siigoBodegaCode}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 break-words">
                      {alert.productName}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Saldo anterior {formatNumber(alert.previousQuantity)} UND ·
                      comprometido {formatNumber(alert.committedQuantity)} UND ·
                      esperado {formatNumber(alert.expectedQuantity)} UND ·
                      importado {formatNumber(alert.newQuantity)} UND
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-semibold tabular-nums">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {formatSigned(alert.difference)} UND
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : alert.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      {open ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      Revisar discrepancia
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  {alert.note ??
                    "Diferencia pendiente de revisión. No se presume pérdida ni irregularidad."}
                </p>

                {open && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">Importación anterior</p>
                        <p className="font-medium text-gray-900">
                          {formatDateTime(alert.previousRunFinishedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Importación nueva</p>
                        <p className="font-medium text-gray-900">
                          {formatDateTime(alert.currentRunFinishedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Diferencia</p>
                        <p className="font-semibold text-amber-800 tabular-nums">
                          {formatSigned(alert.difference)} UND
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Estado</p>
                        <p className="font-medium text-amber-800">Pendiente</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        Órdenes relacionadas en el intervalo
                      </p>
                      {alert.relatedOrders.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No se identificaron órdenes del sistema en el intervalo.
                          Puede tratarse de otros movimientos registrados en Siigo.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {alert.relatedOrders.map((order) => (
                            <li
                              key={order.id}
                              className="text-xs text-gray-700 flex flex-wrap gap-x-3 gap-y-0.5"
                            >
                              <span className="font-mono font-semibold">
                                {order.number}
                              </span>
                              <span>{order.userName || "Sin usuario"}</span>
                              <span>{formatNumber(order.quantity)} UND</span>
                              <span>
                                {STATUS_LABELS[order.status] ?? order.status}
                              </span>
                              <span>{formatDateTime(order.createdAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Observación (opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={notes[alert.id] ?? ""}
                        onChange={(event) =>
                          setNotes((prev) => ({
                            ...prev,
                            [alert.id]: event.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                        placeholder="Ej.: Se verificó en Siigo Pyme y la diferencia corresponde a otro movimiento."
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void gestionar(alert.id, "review")}
                        disabled={busy === alert.id}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Guardar observación
                      </button>
                      <button
                        type="button"
                        onClick={() => void gestionar(alert.id, "validate")}
                        disabled={busy === alert.id}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {busy === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Marcar como válida
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">
        La alerta identifica una diferencia para revisión. No afirma que exista
        pérdida, robo o irregularidad: pueden existir otros movimientos
        operativos.
      </p>
    </section>
  );
}
