"use client";

import { useState } from "react";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  Loader2,
} from "lucide-react";
import { cn, formatDateOnly, todayIsoDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";

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
  recentEntries: Array<{
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
  const { showToast } = useToast();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useApiQuery<ReportData>("/api/reportes");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!data) return;

    setExporting(true);

    try {
      // Se carga bajo demanda: xlsx no forma parte del bundle inicial.
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      const sheets: Array<{ name: string; rows: Record<string, unknown>[] }> = [
        {
          name: "Inventario por bodega",
          rows: data.inventoryByWarehouse.map((item) => ({
            Bodega: item.warehouseName,
            Código: item.warehouseCode,
            Productos: item.totalProducts,
            Unidades: item.totalUnits,
          })),
        },
        {
          name: "Stock bajo",
          rows: data.lowStock.map((item) => ({
            Producto: item.productName,
            Código: item.productCode,
            Bodega: item.warehouseName,
            Cantidad: item.quantity,
            "Stock mínimo": item.minStock,
          })),
        },
        {
          name: "Entradas recientes",
          rows: data.recentEntries.map((item) => ({
            Número: item.number,
            Formato: item.format,
            Fecha: formatDateOnly(item.date),
            Estado: item.status === "CONFIRMED" ? "Confirmado" : "Borrador",
          })),
        },
        {
          name: "Diferencias auditoría",
          rows: data.auditDifferences.map((item) => ({
            Producto: item.productName,
            Sistema: item.systemQuantity,
            Físico: item.physicalQuantity,
            Diferencia: item.difference,
            Observación: item.observation ?? "",
          })),
        },
      ];

      for (const sheet of sheets) {
        const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }

      const today = todayIsoDate();
      XLSX.writeFile(workbook, `reporte-inventario-${today}.xlsx`);
      showToast("success", "Reporte exportado", "El archivo Excel se descargó correctamente.");
    } catch {
      showToast(
        "error",
        "No se pudo exportar",
        "Verifica la conexión e intenta de nuevo."
      );
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-gray-600 mt-1">
            Análisis del inventario y exportación a Excel
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!data || exporting}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Generando..." : "Exportar Excel"}
        </button>
      </div>

      {isError && <QueryError error={error} onRetry={() => void refetch()} />}

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
          Entradas Recientes
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
              {data?.recentEntries.map((movement) => (
                <tr key={movement.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-mono text-gray-900">{movement.number}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {movement.format}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {formatDateOnly(movement.date)}
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
