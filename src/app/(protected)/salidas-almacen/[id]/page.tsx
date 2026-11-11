/**
 * Detalle de una salida de almacén.
 *
 * Permite revisar el documento generado, registrar la recepción en despacho
 * y confirmar que la salida ya quedó anotada en Siigo Pyme.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  PackageCheck,
  Clock,
  AlertTriangle,
  Loader2,
  Ban,
  FileText,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface SalidaItem {
  id: string;
  lineNo: number;
  productCode: string;
  productName: string;
  productReference: string | null;
  unitCode: string | null;
  presentation: string | null;
  siigoBodegaCode: number;
  locationCode: number;
  quantity: number;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  weightKnown: boolean;
  availableAtCreation: number;
  notes: string | null;
}

interface Salida {
  id: string;
  number: string;
  date: string;
  time: string;
  status: string;
  reconciliationStatus: string;
  reconciliationNote: string | null;
  notes: string | null;
  delivererName: string | null;
  delivererDocument: string | null;
  receiverName: string | null;
  receiverDocument: string | null;
  receiverTime: string | null;
  siigoDocumentRef: string | null;
  totalQuantity: number;
  totalWeightKg: number | null;
  weightPartial: boolean;
  itemCount: number;
  programName: string;
  warehouseName: string | null;
  userName: string;
  createdAt: string;
  documentGeneratedAt: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  items: SalidaItem[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  GENERATED: "Generada",
  DELIVERED: "Recibida en despacho",
  CONFIRMED_SIIGO: "Confirmada en Siigo",
  CANCELLED: "Anulada",
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
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SalidaDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data, isLoading, error, refetch } = useApiQuery<Salida>(
    `/api/salidas/${id}`
  );

  const [action, setAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");
  const [receiverTime, setReceiverTime] = useState(
    new Date().toTimeString().slice(0, 5)
  );
  const [siigoRef, setSiigoRef] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  async function ejecutar(nombre: string, body: Record<string, unknown>) {
    setAction(nombre);
    setActionError(null);
    try {
      await apiSend(`/api/salidas/${id}/estado`, "POST", body);
      await refetch();
      router.refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setAction(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-10 text-center text-sm text-gray-500">
        Cargando la salida…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-10 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-gray-700">
          No se pudo cargar la salida: {(error as Error)?.message}
        </p>
        <Link
          href="/salidas-almacen"
          className="inline-block mt-3 text-sm text-primary-600 hover:underline"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  const puedeGenerar = data.status === "DRAFT";
  const puedeEntregar =
    data.status === "GENERATED" || data.status === "DELIVERED";
  const puedeConfirmar = data.status === "DELIVERED";
  const puedeAnular = data.status === "DRAFT" || data.status === "GENERATED";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/salidas-almacen"
          className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">
              {data.number}
            </h1>
            <span className="text-xs font-semibold rounded-full border border-gray-200 bg-gray-100 text-gray-700 px-2 py-0.5">
              {STATUS_LABELS[data.status] ?? data.status}
            </span>
            {data.reconciliationStatus === "PENDING" &&
              data.status !== "DRAFT" &&
              data.status !== "CANCELLED" && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pendiente de conciliar con Siigo
                </span>
              )}
            {data.reconciliationStatus === "MATCHED" && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Conciliada con Siigo
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {formatDate(data.date)} · {data.time} · {data.programName} ·{" "}
            {data.userName}
          </p>
        </div>

        {data.status !== "DRAFT" && (
          <Link
            href={`/salidas-almacen/${data.id}/comprobante`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Ver comprobante</span>
          </Link>
        )}
      </div>

      {actionError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {data.reconciliationNote && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{data.reconciliationNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Detalle */}
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                Productos entregados
              </h2>
            </div>

            {/* Tabla (escritorio) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-700">#</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-700">
                      Referencia
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-gray-700">
                      Producto
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-gray-700">
                      Unidad
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-gray-700 text-right">
                      Cantidad
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-gray-700 text-right">
                      Peso total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                        {item.lineNo}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                        {item.productCode}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900">
                        {item.productName}
                        {item.notes && (
                          <p className="text-xs text-gray-500">{item.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {item.unitCode ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                        {formatNumber(item.quantity)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                        {item.totalWeightKg !== null
                          ? `${formatNumber(item.totalWeightKg)} kg`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas (móvil) */}
            <div className="md:hidden divide-y divide-gray-100">
              {data.items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-gray-500">
                        #{item.lineNo} · {item.productCode}
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {item.productName}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-gray-900">
                      {formatNumber(item.quantity)}{" "}
                      <span className="text-xs font-normal text-gray-500">
                        {item.unitCode}
                      </span>
                    </p>
                  </div>
                  {item.totalWeightKg !== null && (
                    <p className="mt-1 text-xs text-gray-500">
                      Peso: {formatNumber(item.totalWeightKg)} kg
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-1 text-xs text-gray-500">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {data.notes && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">
                Observaciones generales
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {data.notes}
              </p>
            </section>
          )}
        </div>

        {/* Panel lateral */}
        <aside className="space-y-4">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Programa</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {data.programName}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Bodega</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {data.warehouseName ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Almacenista (entrega)</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {data.delivererName ?? data.userName}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Recibe (despacho)</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {data.receiverName ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Referencias</dt>
                <dd className="font-medium text-gray-900 tabular-nums">
                  {data.itemCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Total unidades</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {formatNumber(data.totalQuantity)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Peso conocido</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {data.totalWeightKg !== null
                    ? `${formatNumber(data.totalWeightKg)} kg`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Generada</dt>
                <dd className="text-gray-700 text-right text-xs">
                  {formatDateTime(data.documentGeneratedAt)}
                </dd>
              </div>
              {data.deliveredAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Recibida</dt>
                  <dd className="text-gray-700 text-right text-xs">
                    {formatDateTime(data.deliveredAt)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Acciones de despacho */}
          {data.status !== "CANCELLED" && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Acciones</h2>

              {puedeGenerar && (
                <button
                  type="button"
                  onClick={() => ejecutar("generar", { action: "generar" })}
                  disabled={action !== null}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-40"
                >
                  {action === "generar" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Generar documento
                </button>
              )}

              {puedeEntregar && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">
                    Registre quién recibe en despacho.
                  </p>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(event) => setReceiverName(event.target.value)}
                    placeholder="Nombre de quien recibe"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <input
                    type="text"
                    value={receiverDocument}
                    onChange={(event) =>
                      setReceiverDocument(event.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <label className="block">
                    <span className="text-[11px] font-medium text-gray-600">
                      Hora de recepci?n
                    </span>
                    <input
                      type="time"
                      value={receiverTime}
                      onChange={(event) => setReceiverTime(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      ejecutar("entregar", {
                        action: "entregar",
                        receiverName: receiverName || undefined,
                        receiverDocument: receiverDocument || undefined,
                        receiverTime: receiverTime || undefined,
                      })
                    }
                    disabled={action !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-40"
                  >
                    {action === "entregar" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PackageCheck className="w-4 h-4" />
                    )}
                    Registrar recepción en despacho
                  </button>
                </div>
              )}

              {puedeConfirmar && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">
                    Anote el documento con el que la salida quedó registrada en
                    Siigo Pyme.
                  </p>
                  <input
                    type="text"
                    value={siigoRef}
                    onChange={(event) => setSiigoRef(event.target.value)}
                    placeholder="Número de documento en Siigo"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      ejecutar("confirmar", {
                        action: "confirmar_siigo",
                        siigoDocumentRef: siigoRef || undefined,
                      })
                    }
                    disabled={action !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {action === "confirmar" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Confirmar en Siigo Pyme
                  </button>
                  <p className="text-[11px] text-gray-500">
                    La reserva de existencias se liberará cuando la próxima
                    importación refleje el descuento; así no se descuenta dos
                    veces.
                  </p>
                </div>
              )}

              {puedeAnular && (
                <div className="space-y-2 border-t border-gray-200 pt-4">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Motivo de la anulación"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      ejecutar("anular", {
                        action: "anular",
                        reason: cancelReason || "Anulada por el usuario",
                      })
                    }
                    disabled={action !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 disabled:opacity-40"
                  >
                    {action === "anular" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Ban className="w-4 h-4" />
                    )}
                    Anular salida
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Info({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-4 h-4 shrink-0 mt-0.5", className)}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}
