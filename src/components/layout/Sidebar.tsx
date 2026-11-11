"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { usePrefetchRoute } from "@/hooks/useApiQuery";
import { LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULES, MODULE_ORDER, type ModuleKey } from "@/lib/config/modules";
import type { SessionUser } from "@/lib/auth/session";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: SessionUser;
  /** Claves de banderas que están activas. */
  enabledFlags: string[];
}

/**
 * Navegación lateral.
 *
 * Los módulos que se muestran dependen de DOS cosas:
 *   1. La bandera del módulo (`feature_flags`) — reversible por el administrador.
 *   2. El rol del usuario.
 *
 * Los módulos en espera NO aparecen, pero sus rutas, tablas y datos siguen
 * intactos: se pueden reactivar desde Configuración sin reconstruir nada.
 */
export default function Sidebar({
  isOpen,
  onClose,
  user,
  enabledFlags,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const prefetchRoute = usePrefetchRoute();

  const enabled = new Set(enabledFlags);

  const navigation = MODULE_ORDER.filter((key: ModuleKey) => {
    const definition = MODULES[key];
    if (!enabled.has(definition.flag)) return false;
    return definition.roles.includes(user.role);
  }).map((key) => ({ key, ...MODULES[key] }));

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión");
      router.replace("/login");
      router.refresh();
    } catch {
      // Si falla la red, se mantiene la sesión y se informa al usuario.
      window.alert("No se pudo cerrar la sesión. Verifica la conexión e intenta de nuevo.");
    }
  }

  return (
    <>
      {/* Overlay para móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "app-sidebar fixed top-0 left-0 z-50 h-full w-64 bg-primary-600 text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-primary-500">
          <div className="flex items-center gap-3">
            <Image
              src="/logo2.jpeg"
              alt="Banco de Alimentos"
              width={40}
              height={40}
              unoptimized
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <p className="text-sm font-bold leading-tight">
                Banco de Alimentos
              </p>
              <p className="text-xs text-primary-200">Ibagué</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-primary-500 rounded"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white text-primary-600"
                    : "text-primary-100 hover:bg-primary-500 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-primary-500">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-primary-100 hover:bg-primary-500 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}
