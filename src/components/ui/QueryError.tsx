"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

interface QueryErrorProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/**
 * Aviso uniforme para errores de carga.
 *
 * No reemplaza la pantalla completa: mantiene la estructura del módulo
 * visible y permite reintentar sin recargar la aplicación.
 */
export default function QueryError({ error, onRetry, className }: QueryErrorProps) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "No se pudo cargar la información.";

  return (
    <div
      role="alert"
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${
        className ?? ""
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">No se pudo cargar la información</p>
          <p className="mt-0.5 text-red-700">{message}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 font-medium text-red-700 hover:bg-red-100 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      )}
    </div>
  );
}
