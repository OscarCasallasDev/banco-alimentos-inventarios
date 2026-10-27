"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";

/**
 * Error boundary de los módulos protegidos.
 * El layout con el menú lateral permanece visible; solo se reemplaza el
 * contenido del módulo que falló.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en módulo protegido:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          Este módulo tuvo un problema
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          El resto de la aplicación sigue disponible. Puedes reintentar la
          pantalla o volver al dashboard sin perder la sesión.
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
            Reintentar módulo
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
