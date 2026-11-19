import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Database, RefreshCw, ShieldAlert } from "lucide-react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { ToastProvider } from "@/components/ui/Toast";
import QueryProvider from "@/components/providers/QueryProvider";
import { getCurrentUser } from "@/lib/auth/session";
import { isConnectionError } from "@/lib/utils/connection";
import { getFeatureFlags } from "@/lib/config/features";
import { MODULES, MODULE_ORDER, type ModuleKey } from "@/lib/config/modules";
import { canAccessModule } from "@/lib/auth/permissions";

/**
 * Layout de las rutas protegidas.
 *
 * Valida la sesión en el servidor antes de renderizar el contenido y, además,
 * comprueba que el usuario tenga acceso al módulo de la página que está
 * abriendo. Ocultar el enlace en el menú NO es una medida de seguridad: la
 * comprobación se hace aquí, en el servidor, y también en cada API.
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

  // Banderas de módulo activas: determinan qué opciones ve el usuario.
  const flags = await getFeatureFlags();
  const enabledFlags = Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  // Módulo al que pertenece la página solicitada.
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const moduleKey = moduleForPath(pathname);

  // El superadmin entra siempre; los demás, solo a los módulos que el
  // superadmin les autorizó.
  if (moduleKey && !canAccessModule(user.role, user.modules, moduleKey)) {
    const destino = firstAllowedModule(user.modules, enabledFlags);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Acceso restringido
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Su usuario no tiene permiso para el módulo{" "}
            <strong className="text-gray-900">{MODULES[moduleKey].label}</strong>
            . Si necesita entrar, solicite al administrador que se lo habilite.
          </p>
          {destino ? (
            <Link
              href={MODULES[destino].href}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Ir a {MODULES[destino].label}
            </Link>
          ) : (
            <p className="text-sm text-gray-500">
              No tiene ningún módulo habilitado. Contacte al administrador.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <QueryProvider>
      <ToastProvider>
        <ProtectedLayout user={user} enabledFlags={enabledFlags}>
          {children}
        </ProtectedLayout>
      </ToastProvider>
    </QueryProvider>
  );
}

/**
 * Módulo al que pertenece una ruta de página.
 */
function moduleForPath(pathname: string): ModuleKey | null {
  if (!pathname) return null;

  return (
    MODULE_ORDER.find((key) => {
      const href = MODULES[key].href;
      return pathname === href || pathname.startsWith(`${href}/`);
    }) ?? null
  );
}

/**
 * Indica si el usuario puede entrar al módulo.
 *
 * La configuración es siempre accesible: es donde cada usuario gestiona su
 * nombre de usuario y su contraseña.
 */
export { canAccessModule };

/**
 * Primer módulo al que el usuario puede entrar (para la redirección).
 */
function firstAllowedModule(
  modules: string[],
  enabledFlags: string[]
): ModuleKey | null {
  return (
    MODULE_ORDER.find((key) => {
      const definition = MODULES[key];
      if (!enabledFlags.includes(definition.flag)) return false;
      if (key === "configuracion") return true;
      return modules.includes(key);
    }) ?? null
  );
}
