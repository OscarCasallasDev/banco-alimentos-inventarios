"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";

/**
 * Error boundary raíz.
 * Si una página falla, el usuario ve una salida clara en lugar de una
 * pantalla en blanco o una excepción de React sin control.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error de página:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          No se pudo mostrar esta página
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Ocurrió un error inesperado. La sesión y los datos no se modificaron.
          Puedes reintentar o volver al panel principal.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-gray-400">
            Referencia: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Ir al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
