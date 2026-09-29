"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  FileText,
  Receipt,
  ShieldCheck,
  BarChart3,
  Users,
  Link2,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Productos", href: "/productos", icon: Package },
  { name: "Bodegas", href: "/bodegas", icon: Warehouse },
  { name: "Inventario", href: "/inventario", icon: Boxes },
  { name: "Entradas", href: "/entradas", icon: ArrowDownToLine },
  { name: "Salidas", href: "/salidas", icon: ArrowUpFromLine },
  { name: "Pedidos", href: "/pedidos", icon: ClipboardList },
  { name: "Facturas", href: "/facturas", icon: FileText },
  { name: "Recibos", href: "/recibos", icon: Receipt },
  { name: "Auditoría", href: "/auditoria", icon: ShieldCheck },
  { name: "Reportes", href: "/reportes", icon: BarChart3 },
  { name: "Usuarios", href: "/usuarios", icon: Users },
  { name: "Integración Siigo", href: "/integracion-siigo", icon: Link2 },
  { name: "Configuración", href: "/configuracion", icon: Settings },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
          "fixed top-0 left-0 z-50 h-full w-64 bg-primary-600 text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-primary-500">
          <div className="flex items-center gap-3">
            <img
              src="/logo2.jpeg"
              alt="Banco de Alimentos"
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <h1 className="text-sm font-bold leading-tight">
                Banco de Alimentos
              </h1>
              <p className="text-xs text-primary-200">Ibagué</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-primary-500 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white text-primary-600"
                    : "text-primary-100 hover:bg-primary-500 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-primary-500">
          <button
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
