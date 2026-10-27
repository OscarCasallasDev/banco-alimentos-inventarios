"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Bell,
  User,
  LogOut,
  ChevronDown,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth/session";

interface HeaderProps {
  user: SessionUser;
  onMenuClick: () => void;
}

const roleLabels: Record<SessionUser["role"], string> = {
  SUPERADMIN: "Super Administrador",
  ADMIN: "Administrador",
  RECEPCION: "Recepción",
  DESPACHO: "Despacho",
  CONTABILIDAD: "Contabilidad",
};

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/productos": "Productos",
  "/bodegas": "Bodegas",
  "/inventario": "Inventario",
  "/entradas": "Entradas",
  "/salidas": "Salidas",
  "/pedidos": "Pedidos",
  "/facturas": "Facturas",
  "/recibos": "Recibos",
  "/auditoria": "Auditoría",
  "/reportes": "Reportes",
  "/usuarios": "Usuarios",
  "/integracion-siigo": "Integración Siigo",
  "/configuracion": "Configuración",
};

function getRouteLabel(pathname: string): string {
  if (routeLabels[pathname]) return routeLabels[pathname];

  if (pathname.startsWith("/entradas/") && pathname.endsWith("/comprobante")) {
    return "Comprobante de entrada";
  }

  const base = `/${pathname.split("/")[1] ?? ""}`;
  return routeLabels[base] ?? "Módulo";
}

export default function Header({ user, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const userName = `${user.firstName} ${user.lastName}`.trim();
  const userRole = roleLabels[user.role] ?? user.role;
  const currentRoute = getRouteLabel(pathname);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        throw new Error("No se pudo cerrar la sesión");
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError(
        "No se pudo cerrar la sesión. Verifica la conexión e intenta de nuevo."
      );
      setLoggingOut(false);
    }
  }

  return (
    <header className="app-header bg-white border-b border-gray-200 px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between gap-4">
        {/* Menú hamburguesa para móvil */}
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Ruta actual */}
        <div className="hidden lg:block min-w-0">
          <nav aria-label="Ruta de navegación" className="text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-primary-700 transition-colors">
              Inicio
            </Link>
            <span className="mx-2 text-gray-300">/</span>
            <span className="font-semibold text-gray-900">{currentRoute}</span>
          </nav>
          <p className="text-xs text-gray-400 mt-0.5">
            Banco Arquidiocesano de Alimentos de Ibagué
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notificaciones */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg relative"
              aria-label="Notificaciones"
              aria-expanded={notificationsOpen}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <AlertCircle className="w-4 h-4 text-primary-600" />
                  Notificaciones
                </div>
                <p className="text-sm text-gray-600">
                  No hay notificaciones pendientes.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  La configuración de alertas automáticas está pendiente de
                  validación con el Banco.
                </p>
              </div>
            )}
          </div>

          {/* Usuario con menú desplegable */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((open) => !open)}
              className="flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              aria-expanded={dropdownOpen}
            >
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="hidden sm:block text-left max-w-40">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userName || user.username}
                </p>
                <p className="text-xs text-gray-500 truncate">{userRole}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Menú desplegable */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{userName}</p>
                  <p className="text-xs text-gray-500">@{user.username}</p>
                  <p className="text-xs text-primary-700 mt-1">{userRole}</p>
                </div>
                {logoutError && (
                  <p className="px-4 py-2 text-xs text-red-700 bg-red-50">
                    {logoutError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {loggingOut ? (
                    <CheckCircle className="w-4 h-4 animate-pulse" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  {loggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
