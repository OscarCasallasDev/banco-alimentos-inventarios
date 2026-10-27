import Link from "next/link";
import { Compass, LayoutDashboard, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
          <Compass className="h-7 w-7 text-primary-600" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          La página no existe
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          La dirección que abriste no corresponde a un módulo del sistema.
          Verifica el enlace o regresa al panel principal.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            <LayoutDashboard className="h-4 w-4" />
            Ir al dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
