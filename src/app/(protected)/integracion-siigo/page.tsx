"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Download,
  Info,
  Loader2,
} from "lucide-react";
import { cn, todayIsoDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";

interface SiigoAvailability {
  format: string;
  documents: number;
}

/**
 * Integración con Siigo Pyme mediante archivos planos (ExcelSiigo).
 *
 * El endpoint `/api/siigo/export` toma los datos reales de la base de datos
 * (entradas, facturas y recibos) y arma el archivo con la estructura de cada
 * formato. La estructura definitiva está PENDIENTE de validación con el Banco.
 */
const integrationStatus = [
  { format: "E1", name: "Formato E1", description: "Entrada de mercancía", status: "DEMO", notes: "Exporta la entrada más reciente de formato E1" },
  { format: "E3", name: "Formato E3", description: "Entrada por donación", status: "DEMO", notes: "Exporta la entrada más reciente de formato E3" },
  { format: "N3", name: "Formato N3", description: "Nota de ajuste", status: "PENDING", notes: "Plantilla pendiente de validación con el Banco" },
  { format: "N5", name: "Formato N5", description: "Nota de contabilización", status: "PENDING", notes: "Plantilla pendiente de validación con el Banco" },
  { format: "SF1", name: "Formato SF1", description: "Factura de venta", status: "DEMO", notes: "Exporta la factura más reciente de formato SF1" },
  { format: "F2", name: "Formato F2", description: "Factura simplificada", status: "DEMO", notes: "Exporta la factura más reciente de formato F2" },
  { format: "R1", name: "Formato R1", description: "Recibo de entrega", status: "DEMO", notes: "Exporta el recibo más reciente de formato R1" },
  { format: "R2", name: "Formato R2", description: "Recibo de devolución", status: "DEMO", notes: "Exporta el recibo más reciente de formato R2" },
  { format: "R3", name: "Formato R3", description: "Recibo de traslado", status: "PENDING", notes: "Plantilla pendiente de validación con el Banco" },
  { format: "R4", name: "Formato R4", description: "Recibo de ajuste", status: "PENDING", notes: "Plantilla pendiente de validación con el Banco" },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  REAL: { icon: CheckCircle, color: "bg-green-100 text-green-800", label: "Real" },
  DEMO: { icon: CheckCircle, color: "bg-blue-100 text-blue-800", label: "Demo" },
  PENDING: { icon: Clock, color: "bg-yellow-100 text-yellow-800", label: "Pendiente" },
};

export default function IntegracionSiigoPage() {
  const {
    data: availability = [],
    isError: availabilityError,
    error: availabilityErrorMessage,
    refetch,
  } = useApiQuery<SiigoAvailability[]>("/api/siigo/export");
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const documentsByFormat = new Map(
    availability.map((item) => [item.format, item.documents])
  );

  const counters = integrationStatus.reduce(
    (acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }),
    { REAL: 0, DEMO: 0, PENDING: 0 } as Record<string, number>
  );

  function canExport(item: (typeof integrationStatus)[number]): boolean {
    if (item.status === "PENDING") return false;
    return (documentsByFormat.get(item.format) ?? 0) > 0;
  }

  async function handleExport(format: string) {
    setExporting(format);
    setExportSuccess(null);
    setExportError(null);

    try {
      const res = await fetch("/api/siigo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "No se pudo generar el archivo"
        );
      }

      // Descargar el archivo
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Siigo_${format}_${todayIsoDate()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(format);
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Error al exportar"
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integración Siigo</h1>
        <p className="text-gray-600 mt-1">Exportación de archivos planos para ExcelSiigo</p>
      </div>

      {/* Info banner */}
      <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-accent-900">
              Exportación en modo demostración
            </h3>
            <p className="text-sm text-accent-700 mt-1">
              El sistema genera un archivo Excel para revisión. No se envía
              nada directamente a Siigo Pyme ni se modifica el sistema
              contable. La carga (PUSH) se realiza fuera de la aplicación,
              con autorización y validación previa del Banco.
            </p>
            <p className="text-sm text-accent-700 mt-2">
              1. Selecciona un formato con documentos disponibles.
              <br />
              2. Haz clic en <strong>Exportar</strong> para descargar el Excel.
              <br />
              3. Revisa la plantilla con el área contable antes de usarla.
            </p>
          </div>
        </div>
      </div>

      {availabilityError && (
        <QueryError
          error={availabilityErrorMessage}
          onRetry={() => void refetch()}
        />
      )}

      {exportError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {exportError}
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counters.REAL}</p>
              <p className="text-sm text-gray-600">Reales</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counters.DEMO}</p>
              <p className="text-sm text-gray-600">Demo</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counters.PENDING}</p>
              <p className="text-sm text-gray-600">Pendientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Formats table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Formatos de exportación</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Formato</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Descripción</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Documentos</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Notas</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {integrationStatus.map((item) => {
                const config = statusConfig[item.status];
                const Icon = config.icon;
                const documents = documentsByFormat.get(item.format) ?? 0;
                const exportable = canExport(item);
                const buttonLabel =
                  item.status === "PENDING"
                    ? "Pendiente"
                    : documents === 0
                    ? "Sin documentos"
                    : exporting === item.format
                    ? "Generando..."
                    : exportSuccess === item.format
                    ? "¡Listo!"
                    : "Exportar";

                return (
                  <tr key={item.format} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-mono font-medium text-gray-900">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.description}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", config.color)}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {documents > 0 ? (
                        <span className="text-gray-900">{documents}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{item.notes}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleExport(item.format)}
                          disabled={!exportable || exporting === item.format}
                          title={
                            item.status === "PENDING"
                              ? "La plantilla está pendiente de validación con el Banco"
                              : documents === 0
                              ? "No hay documentos de este formato en la base de datos"
                              : "Generar archivo Excel para revisión"
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                        >
                          {exporting === item.format ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : exportSuccess === item.format ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {buttonLabel}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending validations */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pendientes de validación</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Significado exacto de los formatos E1, E3, N3, N5
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Diferencia funcional entre SF1 y F2
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Relación de R1, R2, R3, R4 con SF1/F2
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Plantillas ExcelSiigo (GET/PUSH)
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Nombres definitivos de bodegas virtuales
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Formato físico de soportes
          </li>
        </ul>
      </div>
    </div>
  );
}
