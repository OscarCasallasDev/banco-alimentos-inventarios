"use client";

import { Boxes } from "lucide-react";

export default function InventarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-gray-600 mt-1">Consulta de existencias en tiempo real</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Boxes className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Inventario
        </h2>
        <p className="text-gray-500">
          Consulta de existencias — FASE 5
        </p>
      </div>
    </div>
  );
}
