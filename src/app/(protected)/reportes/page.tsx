"use client";

import { useState } from "react";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  Loader2,
  Layers,
} from "lucide-react";
import { cn, formatDateOnly, formatNumber, todayIsoDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";
import {
  ExpirationBadge,
  LotStatusBadge,
  type ExpirationSeverity,
} from "@/components/lots/LotComponents";

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
  const [pestana, setPestana] = useState<"resumen" | "lotes">("resumen");

  // Filtros del reporte de lotes por vencimiento.
  const [expiration, setExpiration] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const lotQuery = new URLSearchParams();
  lotQuery.set("expiration", expiration);
  lotQuery.set("hasStock", "true");
  if (expiration === "range") {
    if (from) lotQuery.set("expirationFrom", from);
    if (to) lotQuery.set("expirationTo", to);
  }
  lotQuery.set("page", String(page));
  lotQuery.set("pageSize", "50");

  const {
    data: lotData,
    isLoading: loadingLots,
    isError: lotsError,
    error: lotesQueryError,
    refetch: refetchLotes,
  } = useApiQuery<{
    items: {
      id: string;
      code: string;
      externalCode: string | null;
      productCode: string;
      productName: string;
      presentation: string | null;
      warehouseCode: string;
      warehouseName: string;
      status: string;
      expirationDate: string | null;
      receivedAt: string | null;
      quantityReceived: number;
      quantityAvailable: number;
      stockUnit: string;
      weightAvailableKg: number | null;
      daysToExpire: number | null;
      expirationSeverity: ExpirationSeverity;
      expirationLabel: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/lotes?${lotQuery.toString()}`);

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
        <div className="flex gap-2">
          {pestana === "lotes" && (
            <button
              type="button"
              onClick={() =>
                window.open(
                  `/api/reportes/lotes/export?${lotQuery.toString()}`,
                  "_blank"
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary-600 px-4 py-2.5 font-medium text-primary-700 transition-colors hover:bg-primary-50"
            >
              <Download className="h-4 w-4" />
              Exportar lotes
            </button>
          )}
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
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setPestana("resumen")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            pestana === "resumen"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Resumen del inventario
        </button>
        <button
          type="button"
          onClick={() => setPestana("lotes")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-2",
            pestana === "lotes"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <Layers className="h-4 w-4" />
          Lotes por vencimiento
        </button>
      </div>

      {pestana === "lotes" ? (
        <ReporteLotes
          data={lotData}
          loading={loadingLots}
          error={lotsError ? lotesQueryError : null}
          onRetry={() => void refetchLotes()}
          expiration={expiration}
          setExpiration={(value) => {
            setExpiration(value);
            setPage(1);
          }}
          from={from}
          setFrom={(value) => {
            setFrom(value);
            setPage(1);
          }}
          to={to}
          setTo={(value) => {
            setTo(value);
            setPage(1);
          }}
          page={page}
          setPage={setPage}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

interface LoteReporte {
  id: string;
  code: string;
  externalCode: string | null;
  productCode: string;
  productName: string;
  presentation: string | null;
  warehouseCode: string;
  warehouseName: string;
  status: string;
  expirationDate: string | null;
  receivedAt: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  stockUnit: string;
  weightAvailableKg: number | null;
  daysToExpire: number | null;
  expirationSeverity: ExpirationSeverity;
  expirationLabel: string;
}

/**
 * Reporte de lotes por fecha de vencimiento.
 * Cada fila es un lote individual con su cantidad y su peso.
 */
function ReporteLotes({
  data,
  loading,
  error,
  onRetry,
  expiration,
  setExpiration,
  from,
  setFrom,
  to,
  setTo,
  page,
  setPage,
}: {
  data: {
    items: LoteReporte[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  expiration: string;
  setExpiration: (value: string) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
}) {
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Criterio de vencimiento
            </label>
            <select
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            >
              <option value="all">Todos los lotes</option>
              <option value="today">Vencen hoy</option>
              <option value="tomorrow">Vencen mañana</option>
              <option value="soon">Próximos a vencer</option>
              <option value="expired">Ya vencidos</option>
              <option value="missing">Sin fecha de vencimiento</option>
              <option value="range">Rango de fechas</option>
            </select>
          </div>

          {expiration === "range" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Vence desde
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Vence hasta
                </label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {error && <QueryError error={error} onRetry={onRetry} />}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Lote
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Producto
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Presentación
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Ingreso
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Vencimiento
                </th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">
                  Recibido
                </th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">
                  Disponible
                </th>
                <th className="text-right py-2 px-3 font-medium text-gray-600">
                  Peso disp.
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Bodega
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-gray-500"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-gray-500"
                  >
                    <Layers className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay lotes con este criterio
                  </td>
                </tr>
              ) : (
                items.map((lote) => (
                  <tr
                    key={lote.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 px-3 font-mono text-xs text-gray-900">
                      {lote.code}
                    </td>
                    <td className="py-2 px-3 text-gray-900">
                      <span className="font-mono text-xs text-gray-500">
                        {lote.productCode}
                      </span>{" "}
                      {lote.productName}
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {lote.presentation ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {lote.receivedAt ? formatDateOnly(lote.receivedAt) : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <ExpirationBadge
                        expirationDate={lote.expirationDate}
                        severity={lote.expirationSeverity}
                        label={
                          lote.expirationDate
                            ? formatDateOnly(lote.expirationDate)
                            : lote.expirationLabel
                        }
                        daysToExpire={lote.daysToExpire}
                      />
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {formatNumber(lote.quantityReceived)}
                      <span className="ml-1 text-xs text-gray-400">
                        {lote.stockUnit}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900">
                      {formatNumber(lote.quantityAvailable)}
                      <span className="ml-1 text-xs text-gray-400">
                        {lote.stockUnit}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {lote.weightAvailableKg === null ? (
                        <span className="text-xs text-gray-400">sin dato</span>
                      ) : (
                        `${formatNumber(lote.weightAvailableKg)} kg`
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {lote.warehouseCode}
                    </td>
                    <td className="py-2 px-3">
                      <LotStatusBadge status={lote.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {data.total} lote(s) · página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={data.page <= 1}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() =>
                setPage(Math.min(data.totalPages, page + 1))
              }
              disabled={data.page >= data.totalPages}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
