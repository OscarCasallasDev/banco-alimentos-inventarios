import { redirect } from "next/navigation";
import { Database, RefreshCw } from "lucide-react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { ToastProvider } from "@/components/ui/Toast";
import { getCurrentUser } from "@/lib/auth/session";
import { isConnectionError } from "@/lib/utils/connection";

/**
 * Layout de las rutas protegidas.
 * Valida la sesión en el servidor antes de renderizar el contenido.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  let user = null;

  try {
    user = await getCurrentUser();
  } catch (error) {
    // Solo se capturan los fallos de conexión. Cualquier otro error (por
    // ejemplo, la marca de ruta dinámica de Next) debe propagarse.
    if (!isConnectionError(error)) throw error;

    // No se revienta la aplicación: se muestra un mensaje accionable.
    console.error("No se pudo validar la sesión por falta de conexión:", error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Sin conexión con la base de datos
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            No se pudo establecer comunicación con Supabase. Revisa tu conexión
            a internet y ejecuta{" "}
            <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">npm run db:check</code>{" "}
            para reconfigurar la conexión.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </a>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <ProtectedLayout>{children}</ProtectedLayout>
    </ToastProvider>
  );
}
