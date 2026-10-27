import Link from "next/link";
import { Compass, LayoutDashboard } from "lucide-react";

export default function ProtectedNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
          <Compass className="h-7 w-7 text-primary-600" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Módulo o documento no encontrado
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          El registro solicitado no existe o fue movido. Regresa al dashboard
          para continuar navegando.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
        >
          <LayoutDashboard className="h-4 w-4" />
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
