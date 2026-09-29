"use client";

import { useState } from "react";
import {
  Link2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Download,
  Send,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const integrationStatus = [
  { name: "Formato E1", description: "Entrada de mercancía", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato E3", description: "Entrada por donación", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato N3", description: "Nota de ajuste", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato N5", description: "Nota de contabilización", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato SF1", description: "Factura de venta", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato F2", description: "Factura simplificada", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato R1", description: "Recibo de entrega", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato R2", description: "Recibo de devolución", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato R3", description: "Recibo de traslado", status: "PENDING", notes: "Pendiente de validación con el Banco" },
  { name: "Formato R4", description: "Recibo de ajuste", status: "PENDING", notes: "Pendiente de validación con el Banco" },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  REAL: { icon: CheckCircle, color: "bg-green-100 text-green-800", label: "Real" },
  DEMO: { icon: CheckCircle, color: "bg-blue-100 text-blue-800", label: "Demo" },
  PENDING: { icon: Clock, color: "bg-yellow-100 text-yellow-800", label: "Pendiente" },
};

// Datos de ejemplo para cada formato
const sampleData: Record<string, unknown> = {
  E1: {
    formato: "E1",
    numero: "ENT-2026-0001",
    fecha: "28/09/2026",
    nit: "900.123.456-7",
    origen: "Donación Empresa Local",
    documento: "FAC-2026-001",
    estado: "CONFIRMADO",
    notas: "Entrada de prueba",
    items: [
      { producto: "GRN-001", bodega: "1.1", cantidad: 100, unidad: "kg", presentacion: "Bolsa 500g" },
      { producto: "GRN-002", bodega: "1.1", cantidad: 50, unidad: "kg", presentacion: "Bolsa 500g" },
    ],
  },
  E3: {
    formato: "E3",
    numero: "DON-2026-0001",
    fecha: "28/09/2026",
    nit: "800.987.654-3",
    donante: "Fundación XYZ",
    documento: "DON-2026-001",
    estado: "CONFIRMADO",
    notas: "Donación de prueba",
    items: [
      { producto: "LAC-001", bodega: "1.1", cantidad: 200, unidad: "L", presentacion: "Caja 1L" },
    ],
  },
  N3: {
    formato: "N3",
    numero: "AJU-2026-0001",
    fecha: "28/09/2026",
    bodega: "1.1",
    tipoAjuste: "FALTANTE",
    estado: "CONFIRMADO",
    notas: "Ajuste por faltante",
    items: [
      { producto: "GRN-001", cantidad: 5, unidad: "kg", causa: "Merma por almacenamiento" },
    ],
  },
  N5: {
    formato: "N5",
    numero: "CON-2026-0001",
    fecha: "28/09/2026",
    concepto: "Ajuste contable de inventario",
    estado: "CONFIRMADO",
    notas: "Contabilización de prueba",
    items: [
      { cuenta: "140505", debito: 100000, credito: 0, nit: "900.123.456-7", centroCosto: "001" },
    ],
  },
  SF1: {
    formato: "SF1",
    numero: "FAC-2026-0001",
    fecha: "28/09/2026",
    nit: "800.987.654-3",
    cliente: "Comunidad Rural El Salado",
    pedido: "PED-2026-0001",
    estado: "GENERADA",
    items: [
      { producto: "GRN-001", cantidad: 50, unidad: "kg", precioUnitario: 2500, descuento: 0, iva: 0 },
    ],
  },
  F2: {
    formato: "F2",
    numero: "FAC-2026-0002",
    fecha: "28/09/2026",
    nit: "800.987.654-3",
    cliente: "Comunidad Rural El Salado",
    estado: "GENERADA",
    items: [
      { producto: "LAC-001", cantidad: 100, unidad: "L", precioUnitario: 3500 },
    ],
  },
  R1: {
    formato: "R1",
    numero: "REC-2026-0001",
    fecha: "28/09/2026",
    factura: "FAC-2026-0001",
    nit: "800.987.654-3",
    receptor: "Juan Pérez",
    estado: "GENERADO",
    items: [
      { producto: "GRN-001", cantidad: 50, unidad: "kg", bodega: "1.1" },
    ],
  },
  R2: {
    formato: "R2",
    numero: "DEV-2026-0001",
    fecha: "28/09/2026",
    factura: "FAC-2026-0001",
    nit: "800.987.654-3",
    motivo: "Producto dañado",
    estado: "GENERADO",
    items: [
      { producto: "GRN-001", cantidad: 5, unidad: "kg", bodega: "1.1", causa: "Empaque dañado" },
    ],
  },
  R3: {
    formato: "R3",
    numero: "TRA-2026-0001",
    fecha: "28/09/2026",
    bodegaOrigen: "1.1",
    bodegaDestino: "4.1",
    estado: "GENERADO",
    items: [
      { producto: "GRN-001", cantidad: 100, unidad: "kg" },
    ],
  },
  R4: {
    formato: "R4",
    numero: "AJU-2026-0002",
    fecha: "28/09/2026",
    bodega: "1.1",
    tipoAjuste: "SOBRANTE",
    estado: "GENERADO",
    items: [
      { producto: "GRN-001", cantidad: 2, unidad: "kg", causa: "Sobrante en conteo" },
    ],
  },
};

export default function IntegracionSiigoPage() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  async function handleExport(format: string) {
    setExporting(format);
    setExportSuccess(null);

    try {
      const res = await fetch("/api/siigo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          data: sampleData[format],
        }),
      });

      if (!res.ok) {
        throw new Error("Error al exportar");
      }

      // Descargar el archivo
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Siigo_${format}_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(format);
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (error) {
      console.error("Error exportando:", error);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integración Siigo</h1>
        <p className="text-gray-600 mt-1">Exportación de archivos planos para ExcelSiigo</p>
      </div>

      {/* Info banner */}
      <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-accent-900">¿Cómo funciona?</h3>
            <p className="text-sm text-accent-700 mt-1">
              1. Selecciona un formato de la lista
              <br />
              2. Haz clic en <strong>Exportar</strong> para generar el archivo Excel
              <br />
              3. Abre el archivo en ExcelSiigo
              <br />
              4. Usa la función <strong>PUSH</strong> para enviar los datos a Siigo Pyme
            </p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-600">Reales</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-600">Demo</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">10</p>
              <p className="text-sm text-gray-600">Pendientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Formats table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Formatos de exportación</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Formato</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Descripción</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Notas</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {integrationStatus.map((item) => {
                const config = statusConfig[item.status];
                const Icon = config.icon;
                return (
                  <tr key={item.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-mono font-medium text-gray-900">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.description}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", config.color)}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{item.notes}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleExport(item.name)}
                          disabled={exporting === item.name}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium disabled:opacity-50"
                        >
                          {exporting === item.name ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                          ) : exportSuccess === item.name ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {exporting === item.name ? "Generando..." : exportSuccess === item.name ? "¡Listo!" : "Exportar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending validations */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pendientes de validación</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Significado exacto de los formatos E1, E3, N3, N5
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Diferencia funcional entre SF1 y F2
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Relación de R1, R2, R3, R4 con SF1/F2
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Plantillas ExcelSiigo (GET/PUSH)
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Nombres definitivos de bodegas virtuales
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-2" />
            Formato físico de soportes
          </li>
        </ul>
      </div>
    </div>
  );
}
