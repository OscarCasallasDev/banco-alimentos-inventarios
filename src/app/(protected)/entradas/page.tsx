"use client";

import { ArrowDownToLine } from "lucide-react";

export default function EntradasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entradas</h1>
        <p className="text-gray-600 mt-1">Registro de ingresos de productos</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <ArrowDownToLine className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Entradas
        </h2>
        <p className="text-gray-500">
          Formatos E1 / E3 / N3 / N5 — FASE 5
        </p>
      </div>
    </div>
  );
}
