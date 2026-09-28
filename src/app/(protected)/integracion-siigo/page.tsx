"use client";

import { Link2 } from "lucide-react";

export default function IntegracionSiigoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integración Siigo</h1>
        <p className="text-gray-600 mt-1">
          Módulo de integración con Siigo Pyme mediante ExcelSiigo
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Link2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Integración Siigo Pyme
        </h2>
        <p className="text-gray-500 mb-4">
          Estado: <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">DEMO</span>
        </p>
        <p className="text-gray-500">
          Exportar / Importar archivos Excel — FASE 8
        </p>
      </div>
    </div>
  );
}
