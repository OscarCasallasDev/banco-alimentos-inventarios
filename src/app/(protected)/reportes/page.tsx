"use client";

import { BarChart3 } from "lucide-react";

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-600 mt-1">Generación y exportación de reportes</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Reportes
        </h2>
        <p className="text-gray-500">
          Reportes exportables a Excel — FASE 7
        </p>
      </div>
    </div>
  );
}
