"use client";

import { Receipt } from "lucide-react";

export default function RecibosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recibos</h1>
        <p className="text-gray-600 mt-1">Gestión de recibos de caja</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Recibos
        </h2>
        <p className="text-gray-500">
          Formatos R1 / R2 / R3 / R4 — FASE 6
        </p>
      </div>
    </div>
  );
}
