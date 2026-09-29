"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportData {
  inventoryByWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    totalProducts: number;
    totalUnits: number;
  }>;
  lowStock: Array<{
    productId: string;
    productName: string;
    productCode: string;
    warehouseName: string;
    quantity: number;
    minStock: number;
  }>;
  recentMovements: Array<{
    id: string;
    number: string;
    format: string;
    date: string;
    status: string;
    createdAt: string;
  }>;
  auditDifferences: Array<{
    id: string;
    productName: string;
    systemQuantity: number;
    physicalQuantity: number;
    difference: number;
    observation: string | null;
  }>;
}

export default function ReportesPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    try {
      const res = await fetch("/api/reportes");
      const result = await res.json();
      if (result.success) setData(result.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-600 mt-1">Análisis y exportación de datos</p>
      </div>

      {/* Inventario por bodega */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary-600" />
          Inventario por Bodega
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Bodega</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Código</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Productos</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {data?.inventoryByWarehouse.map((item) => (
                <tr key={item.warehouseId} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-900">{item.warehouseName}</td>
                  <td className="py-2 px-3 font-mono text-gray-600">{item.warehouseCode}</td>
                  <td className="py-2 px-3 text-gray-600">{item.totalProducts}</td>
                  <td className="py-2 px-3 text-gray-600">{item.totalUnits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock bajo */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          Productos con Stock Bajo
        </h2>
        {data?.lowStock.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay productos con stock bajo</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Producto</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Código</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Bodega</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Cantidad</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {data?.lowStock.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-900">{item.productName}</td>
                    <td className="py-2 px-3 font-mono text-gray-600">{item.productCode}</td>
                    <td className="py-2 px-3 text-gray-600">{item.warehouseName}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600">{item.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Movimientos recientes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Movimientos Recientes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Número</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Formato</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentMovements.map((movement) => (
                <tr key={movement.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-mono text-gray-900">{movement.number}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {movement.format}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {new Date(movement.date).toLocaleDateString("es-CO")}
                  </td>
                  <td className="py-2 px-3">
                    <span className={cn(
                      "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                      movement.status === "CONFIRMED" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    )}>
                      {movement.status === "CONFIRMED" ? "Confirmado" : "Borrador"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diferencias de auditoría */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-600" />
          Diferencias de Auditoría
        </h2>
        {data?.auditDifferences.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay diferencias registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Producto</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Sistema</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Físico</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Diferencia</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Observación</th>
                </tr>
              </thead>
              <tbody>
                {data?.auditDifferences.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-900">{item.productName}</td>
                    <td className="py-2 px-3 text-gray-600">{item.systemQuantity}</td>
                    <td className="py-2 px-3 text-gray-600">{item.physicalQuantity}</td>
                    <td className="py-2 px-3">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                        item.difference > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      )}>
                        {item.difference > 0 ? "+" : ""}{item.difference}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{item.observation || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
