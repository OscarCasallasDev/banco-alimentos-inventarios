"use client";

import { Warehouse } from "lucide-react";

export default function BodegasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bodegas</h1>
        <p className="text-gray-600 mt-1">Gestión de bodegas virtuales</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Warehouse className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Bodegas
        </h2>
        <p className="text-gray-500">
          CRUD de bodegas virtuales — FASE 4
        </p>
      </div>
    </div>
  );
}
