"use client";

import { ArrowUpFromLine } from "lucide-react";

export default function SalidasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salidas</h1>
        <p className="text-gray-600 mt-1">Registro de despachos de productos</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <ArrowUpFromLine className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Módulo de Salidas
        </h2>
        <p className="text-gray-500">
          Flujo: Pedido → Factura → Recibo → Despacho — FASE 6
        </p>
      </div>
    </div>
  );
}
