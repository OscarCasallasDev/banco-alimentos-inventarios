"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  FileText,
  Receipt,
  Warehouse,
  BarChart3,
  Users,
  Settings,
  Link2,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface DashboardData {
  totalProducts: number;
  totalUnits: number;
  recentEntries: Array<{
    id: string;
    number: string;
    date: string;
    format: string;
  }>;
  recentExits: Array<{
    id: string;
    number: string;
    date: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    code: string;
    minStock: number;
  }>;
  pendingAudits: number;
  detectedDifferences: number;
}

const modules = [
  {
    name: "Entradas",
    description: "Registrar ingresos de productos al inventario",
    href: "/entradas",
    icon: ArrowDownToLine,
    color: "bg-green-600",
  },
  {
    name: "Salidas",
    description: "Gestionar salidas y despachos de productos",
    href: "/salidas",
    icon: ArrowUpFromLine,
    color: "bg-orange-600",
  },
  {
    name: "Pedidos",
    description: "Crear y gestionar pedidos de productos",
    href: "/pedidos",
    icon: ClipboardList,
    color: "bg-blue-600",
  },
  {
    name: "Facturas",
    description: "Generar y consultar facturas",
    href: "/facturas",
    icon: FileText,
    color: "bg-purple-600",
  },
  {
    name: "Recibos",
    description: "Gestionar recibos de entrega",
    href: "/recibos",
    icon: Receipt,
    color: "bg-teal-600",
  },
  {
    name: "Auditoría",
    description: "Realizar auditorías de inventario",
    href: "/auditoria",
    icon: ShieldCheck,
    color: "bg-red-600",
  },
  {
    name: "Inventario",
    description: "Consultar stock por producto y bodega",
    href: "/inventario",
    icon: Boxes,
    color: "bg-indigo-600",
  },
  {
    name: "Productos",
    description: "Gestionar catálogo de productos",
    href: "/productos",
    icon: Package,
    color: "bg-pink-600",
  },
  {
    name: "Bodegas",
    description: "Administrar bodegas y almacenes",
    href: "/bodegas",
    icon: Warehouse,
    color: "bg-yellow-600",
  },
  {
    name: "Reportes",
    description: "Ver reportes y exportar datos",
    href: "/reportes",
    icon: BarChart3,
    color: "bg-cyan-600",
  },
  {
    name: "Usuarios",
    description: "Gestionar usuarios del sistema",
    href: "/usuarios",
    icon: Users,
    color: "bg-gray-600",
  },
  {
    name: "Integración Siigo",
    description: "Exportar datos a Siigo Pyme",
    href: "/integracion-siigo",
    icon: Link2,
    color: "bg-emerald-600",
  },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setData(result.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const stats = [
    {
      name: "Total Productos",
      value: data?.totalProducts || 0,
      icon: Package,
      color: "bg-primary-600",
    },
    {
      name: "Total Unidades",
      value: formatNumber(data?.totalUnits || 0),
      icon: Boxes,
      color: "bg-accent-500",
    },
    {
      name: "Entradas Recientes",
      value: data?.recentEntries?.length || 0,
      icon: ArrowDownToLine,
      color: "bg-green-600",
    },
    {
      name: "Salidas Recientes",
      value: data?.recentExits?.length || 0,
      icon: ArrowUpFromLine,
      color: "bg-orange-600",
    },
    {
      name: "Stock Bajo",
      value: data?.lowStockProducts?.length || 0,
      icon: AlertTriangle,
      color: "bg-yellow-600",
    },
    {
      name: "Auditorías Pendientes",
      value: data?.pendingAudits || 0,
      icon: ShieldCheck,
      color: "bg-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Resumen general del sistema de inventarios
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}
              >
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Módulos del sistema */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Módulos del Sistema
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-300 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 ${module.color} rounded-xl flex items-center justify-center flex-shrink-0`}
                >
                  <module.icon className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                    {module.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {module.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Movimientos recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-green-600" />
            Entradas Recientes
          </h2>
          {data?.recentEntries?.length ? (
            <ul className="space-y-3">
              {data.recentEntries.slice(0, 5).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {entry.number} — {entry.format}
                    </p>
                    <p className="text-sm text-gray-500">{entry.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No hay entradas recientes</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            Salidas Recientes
          </h2>
          {data?.recentExits?.length ? (
            <ul className="space-y-3">
              {data.recentExits.slice(0, 5).map((exit) => (
                <li
                  key={exit.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">{exit.number}</p>
                    <p className="text-sm text-gray-500">{exit.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No hay salidas recientes</p>
          )}
        </div>
      </div>

      {/* Productos con stock bajo */}
      {data?.lowStockProducts?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Productos con Stock Bajo
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">
                    Código
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">
                    Producto
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">
                    Stock Mínimo
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockProducts.slice(0, 5).map((product) => (
                  <tr key={product.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-mono text-gray-900">
                      {product.code}
                    </td>
                    <td className="py-2 px-3 text-gray-900">{product.name}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {product.minStock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
