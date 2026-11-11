/**
 * Módulo de Integración con Siigo Pyme.
 *
 * Tres secciones:
 *   1. Importar un reporte (carga manual o automática por el agente local).
 *   2. Historial de importaciones con su resultado.
 *   3. Correspondencia de bodegas de Siigo con las bodegas de la aplicación.
 */

"use client";

import { useRef, useState } from "react";
import {
  Link2,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Warehouse,
  RefreshCw,
  FileSpreadsheet,
  KeyRound,
  Copy,
  Ban,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

// ---------- Tipos ----------

interface RunSummary {
  id: string;
  status: string;
  /** Tipo de reporte: DETAILED o RESUMEN. */
  reportFormat: string | null;
  warehousesCount: number;
  locationsCount: number;
  newRecords: number;
  updatedRecords: number;
  fileName: string | null;
  fileSha256: string;
  source: string;
  reportDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  generatedAt: string | null;
  totalRows: number;
  dataRows: number;
  processedRows: number;
  skippedRows: number;
  rejectedRows: number;
  productsCount: number;
  balancesCount: number;
  movementsCount: number;
  groupsReview: number;
  diffsFound: number;
  durationMs: number | null;
  errorSummary: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  alreadyProcessed: boolean;
}

interface HistorialResponse {
  items: RunSummary[];
  total: number;
  lastSuccessful: RunSummary | null;
  staleMinutes: number;
  minutesSinceSync: number | null;
  isStale: boolean;
}

interface WarehouseMapItem {
  siigoBodegaCode: number;
  label: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  isActive: boolean;
  productCount: number;
  totalQuantity: number;
  lastSyncedAt: string | null;
}

interface AgentKey {
  id: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

// ---------- Utilidades ----------

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusInfo(status: string) {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Sincronización exitosa",
        icon: CheckCircle2,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "PROCESSING":
    case "PENDING":
      return {
        label: "Sincronización pendiente",
        icon: Clock,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "FAILED":
      return {
        label: "Sincronización fallida",
        icon: XCircle,
        className: "bg-red-50 text-red-700 border-red-200",
      };
    case "REJECTED":
      return {
        label: "Archivo rechazado",
        icon: Ban,
        className: "bg-red-50 text-red-700 border-red-200",
      };
    default:
      return {
        label: status,
        icon: Clock,
        className: "bg-gray-50 text-gray-700 border-gray-200",
      };
  }
}

// ============================================================
// Componente principal
// ============================================================

export default function IntegracionSiigoPage() {
  const [tab, setTab] = useState<"importar" | "historial" | "bodegas">(
    "importar"
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Link2 className="w-7 h-7 text-primary-600" />
          Integración con Siigo Pyme
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Importación del reporte de inventario y control de la sincronización.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(
          [
            ["importar", "Importar reporte"],
            ["historial", "Historial de sincronizaciones"],
            ["bodegas", "Bodegas de Siigo"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              tab === key
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "importar" && <ImportarPanel />}
      {tab === "historial" && <HistorialPanel />}
      {tab === "bodegas" && <BodegasPanel />}
    </div>
  );
}

// ============================================================
// Panel de importación
// ============================================================

function ImportarPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: sync } = useApiQuery<HistorialResponse>(
    "/api/siigo/importaciones?limit=1"
  );

  function seleccionar(seleccionado: File | null) {
    setError(null);
    setResult(null);
    setStatus(null);
    if (!seleccionado) return;
    if (!/\.xlsx$/i.test(seleccionado.name)) {
      setError("El archivo debe ser un .xlsx generado por Siigo Pyme.");
      return;
    }
    setFile(seleccionado);
    setStatus("Archivo seleccionado");
  }

  async function importar() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress("Calculando la huella del archivo…");

    try {
      // 1. Huella SHA-256 del archivo (en el navegador: es local y rápido).
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 2. Crear (o recuperar) la corrida.
      setProgress("Registrando la importación…");
      const run = await apiSend<RunSummary>("/api/siigo/importaciones", "POST", {
        fileSha256: hash,
        fileName: file.name,
        fileSize: file.size,
        source: "MANUAL",
      });

      if (run.alreadyProcessed) {
        setResult(run);
        setStatus("Este archivo ya se había importado. No se procesó de nuevo.");
        return;
      }

      // 3. URL firmada para subir el archivo (el .xlsx real pesa 8 MB y
      //    Vercel limita el cuerpo de una petición a 4.5 MB).
      setProgress("Preparando la carga segura…");
      const signed = await apiSend<{
        uploadUrl: string;
        token: string;
        path: string;
      }>("/api/siigo/importaciones/archivo", "POST", {
        fileSha256: hash,
        fileName: file.name,
        fileSize: file.size,
      });

      // 4. Subir el binario directamente al almacenamiento.
      setProgress("Subiendo el archivo…");
      const upload = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: buffer,
      });
      if (!upload.ok) {
        throw new Error(
          `No se pudo subir el archivo (${upload.status}). Verifique que el bucket de almacenamiento esté disponible.`
        );
      }

      // 5. Procesar: interpretar, guardar y cerrar la corrida.
      setProgress("Interpretando el reporte y calculando saldos…");
      const finished = await apiSend<RunSummary>(
        `/api/siigo/importaciones/${run.id}/procesar-archivo`,
        "POST",
        { path: signed.path }
      );

      setResult(finished);
      setStatus("Importación completada");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const stale = sync?.isStale ?? true;

  return (
    <div className="space-y-4">
      {/* Estado de la sincronización */}
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-xl border",
          stale
            ? "bg-amber-50 border-amber-200"
            : "bg-emerald-50 border-emerald-200"
        )}
      >
        {stale ? (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        )}
        <div className="text-sm">
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
              "mt-0.5",
              stale ? "text-amber-700" : "text-emerald-700"
            )}
          >
            {sync?.lastSuccessful
              ? `Última sincronización exitosa: ${formatDateTime(sync.lastSuccessful.finishedAt)}` +
                (sync.lastSuccessful.reportDate
                  ? ` · Reporte de Siigo del ${sync.lastSuccessful.reportDate}`
                  : "") +
                ` · El inventario se considera desactualizado después de ${sync.staleMinutes} minutos sin sincronizar.`
              : "Todavía no se ha sincronizado ningún reporte de Siigo Pyme."}
          </p>
        </div>
      </div>

      {/* Los dos tipos de reporte */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">
            Reporte detallado de inventario
          </p>
          <p className="text-xs text-blue-800 mt-1 leading-relaxed">
            ?Movimiento detallado de bodega por fecha?. Trae el saldo anterior
            de cada producto, por lo que <b>s? permite calcular las
            existencias</b> y detectar los saldos que no cuadran.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Reporte resumen por bodega
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            ?Resumen de movimiento por bodega?. Actualiza <b>bodegas,
            ubicaciones y productos</b>, pero <b>no trae saldos</b>: su
            diferencia es el movimiento del periodo, no el inventario
            disponible. Para refrescar existencias se necesita el reporte
            detallado.
          </p>
        </div>
      </div>

      {/* Zona de carga */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
          Subir reporte de Siigo Pyme
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          El sistema detecta autom?ticamente el tipo de reporte y lo trata
          seg?n lo que cada uno significa.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            seleccionar(event.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
            dragging
              ? "border-primary-500 bg-primary-50"
              : "border-gray-300 bg-gray-50/50"
          )}
        >
          <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-700">
            Arrastre aquí el reporte o{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-primary-600 font-medium hover:underline"
            >
              seleccione el archivo
            </button>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Reporte «Movimiento detallado de bodega por fecha» (.xlsx)
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => seleccionar(event.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(file.size / 1048576).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={importar}
              disabled={busy}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Importar
            </button>
          </div>
        )}

        {busy && progress && (
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progress}
          </p>
        )}

        {status && !busy && (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            {status}
          </p>
        )}

        {error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-red-700">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Resultado de la importación
            </h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Procesadas</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {result.processedRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Omitidas</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {result.skippedRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Rechazadas</dt>
                <dd className="font-semibold text-red-600 tabular-nums">
                  {result.rejectedRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Duración</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {formatDuration(result.durationMs)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Productos</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {result.productsCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Saldos</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {result.balancesCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Movimientos</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {result.movementsCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Por revisar</dt>
                <dd className="font-semibold text-amber-600 tabular-nums">
                  {result.groupsReview}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <AgentKeyPanel />
    </div>
  );
}

// ============================================================
// Historial
// ============================================================

function HistorialPanel() {
  const { data, isLoading, error, refetch, isFetching } = useApiQuery<
    HistorialResponse
  >("/api/siigo/importaciones?limit=50");

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {data?.total ?? 0} sincronización{data?.total === 1 ? "" : "es"}
          registrada{data?.total === 1 ? "" : "s"}.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudo cargar el historial: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando historial…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            Todavía no hay importaciones registradas.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((run) => {
              const info = statusInfo(run.status);
              const Icon = info.icon;
              return (
                <div key={run.id} className="p-4 hover:bg-gray-50">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2 py-0.5",
                            info.className
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {info.label}
                        </span>
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {run.fileName ?? "Sin nombre"}
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {run.fileSha256.slice(0, 12)}…
                        </span>
                        {run.source === "AGENT" && (
                          <span className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                            Agente local
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-[11px] font-medium rounded-full px-2 py-0.5 border",
                            run.reportFormat === "RESUMEN"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          )}
                        >
                          {run.reportFormat === "RESUMEN"
                            ? "Resumen por bodega"
                            : "Detallado"}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(run.createdAt)}
                        {run.reportDate && ` · Reporte del ${run.reportDate}`}
                        {run.periodFrom &&
                          run.periodTo &&
                          ` · Periodo ${run.periodFrom} a ${run.periodTo}`}
                        {` · Duración ${formatDuration(run.durationMs)}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                      <span className="text-gray-600">
                        Procesadas{" "}
                        <b className="text-gray-900 tabular-nums">
                          {run.processedRows}
                        </b>
                      </span>
                      <span className="text-gray-600">
                        Omitidas{" "}
                        <b className="text-gray-900 tabular-nums">
                          {run.skippedRows}
                        </b>
                      </span>
                      <span className="text-gray-600">
                        Rechazadas{" "}
                        <b
                          className={cn(
                            "tabular-nums",
                            run.rejectedRows > 0
                              ? "text-red-600"
                              : "text-gray-900"
                          )}
                        >
                          {run.rejectedRows}
                        </b>
                      </span>
                      <span className="text-gray-600">
                        Saldos{" "}
                        <b className="text-gray-900 tabular-nums">
                          {run.balancesCount}
                        </b>
                      </span>
                      {run.reportFormat === "RESUMEN" && (
                        <span className="text-gray-600">
                          Bodegas{" "}
                          <b className="text-gray-900 tabular-nums">
                            {run.warehousesCount ?? 0}
                          </b>
                        </span>
                      )}
                      {run.groupsReview > 0 && (
                        <span className="text-amber-700 font-medium">
                          {run.groupsReview} por revisar
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Bodegas de Siigo
// ============================================================

function BodegasPanel() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    items: WarehouseMapItem[];
  }>("/api/siigo/warehouse-map");

  const [saving, setSaving] = useState<number | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);

  const items = data?.items ?? [];
  const sinMapear = items.filter((item) => !item.warehouseId).length;

  async function guardar(codigo: number, warehouseId: string | null) {
    setSaving(codigo);
    setPanelError(null);
    try {
      await apiSend("/api/siigo/warehouse-map", "PUT", {
        siigoBodegaCode: codigo,
        warehouseId,
        isActive: true,
      });
      await refetch();
    } catch (err) {
      setPanelError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function crearBodega(codigo: number) {
    setSaving(codigo);
    setPanelError(null);
    try {
      await apiSend("/api/siigo/warehouse-map", "POST", {
        siigoBodegaCode: codigo,
        name: newName.trim() || `Bodega Siigo ${codigo}`,
      });
      setCreating(null);
      setNewName("");
      await refetch();
    } catch (err) {
      setPanelError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 text-sm">
        <Warehouse className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-blue-800">
          Las existencias de Siigo llegan con un código numérico de bodega. El
          sistema <b>no inventa nombres</b>: mientras no se asigne una bodega de
          la aplicación, la existencia se muestra con su código de Siigo.{" "}
          {sinMapear > 0 && (
            <b>
              {sinMapear} bodega{sinMapear === 1 ? "" : "s"} pendiente
              {sinMapear === 1 ? "" : "s"} de asignar.
            </b>
          )}
        </p>
      </div>

      {panelError && (
        <p className="flex items-start gap-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{panelError}</span>
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudo cargar el mapeo: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando bodegas…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            Todavía no se han importado existencias. Importe un reporte de Siigo
            Pyme para ver las bodegas.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.siigoBodegaCode} className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 rounded px-2 py-0.5">
                        C?digo Siigo {item.siigoBodegaCode}
                      </span>
                      {item.warehouseName ? (
                        <span className="text-sm font-medium text-gray-900">
                          → {item.warehouseName}
                        </span>
                      ) : (
                        <span className="text-sm text-amber-700 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Sin asignar
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.productCount} productos con existencia ·{" "}
                      {item.totalQuantity} unidades · última sincronización{" "}
                      {formatDateTime(item.lastSyncedAt)}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {creating === item.siigoBodegaCode ? (
                      <>
                        <input
                          type="text"
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                          placeholder="Nombre de la bodega"
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => crearBodega(item.siigoBodegaCode)}
                          disabled={saving === item.siigoBodegaCode}
                          className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40"
                        >
                          Crear
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreating(null)}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setCreating(item.siigoBodegaCode)}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Crear bodega
                        </button>
                        <button
                          type="button"
                          onClick={() => guardar(item.siigoBodegaCode, null)}
                          disabled={saving === item.siigoBodegaCode}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          Quitar asignación
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Clave del agente local
// ============================================================

function AgentKeyPanel() {
  const { data, refetch } = useApiQuery<{ items: AgentKey[] }>(
    "/api/siigo/agent-keys"
  );
  const [label, setLabel] = useState("Agente de sincronización");
  const [generated, setGenerated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  async function crear() {
    setBusy(true);
    setPanelError(null);
    try {
      const result = await apiSend<{ key: string }>(
        "/api/siigo/agent-keys",
        "POST",
        { label }
      );
      setGenerated(result.key);
      await refetch();
    } catch (err) {
      setPanelError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revocar(id: string) {
    try {
      await apiSend(`/api/siigo/agent-keys/${id}`, "DELETE");
      await refetch();
    } catch (err) {
      setPanelError((err as Error).message);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-primary-600" />
        Agente local de sincronización
      </h2>
      <p className="text-xs text-gray-600 mb-3">
        La clave se guarda cifrada y se muestra una sola vez. Úsela en el
        archivo <code className="font-mono bg-gray-100 px-1 rounded">config.json</code>{" "}
        del agente para la sincronización automática cada hora.
      </p>

      {panelError && (
        <p className="mb-3 text-sm text-red-700">{panelError}</p>
      )}

      {generated && (
        <div className="mb-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-xs font-semibold text-emerald-800 mb-1">
            Copie esta clave ahora: no se vuelve a mostrar.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 break-all">
              {generated}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(generated)}
              className="p-2 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
              aria-label="Copiar"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Nombre de la clave"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        />
        <button
          type="button"
          onClick={crear}
          disabled={busy || !label.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <KeyRound className="w-4 h-4" />
          )}
          Generar clave
        </button>
      </div>

      {(data?.items?.length ?? 0) > 0 && (
        <div className="mt-4 divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {data!.items.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{key.label}</p>
                <p className="text-xs text-gray-500">
                  Creada {formatDateTime(key.createdAt)} · último uso{" "}
                  {formatDateTime(key.lastUsedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[11px] font-medium rounded-full px-2 py-0.5",
                    key.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {key.isActive ? "Activa" : "Revocada"}
                </span>
                {key.isActive && (
                  <button
                    type="button"
                    onClick={() => revocar(key.id)}
                    className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Revocar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
