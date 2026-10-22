"use client";

import { useRouter } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";

/**
 * Acciones de la pantalla del comprobante.
 * No se imprimen: se ocultan en el momento de imprimir.
 */
export default function ComprobanteAcciones({
  backUrl = "/entradas",
}: {
  backUrl?: string;
}) {
  const router = useRouter();

  return (
    <div className="print:hidden mb-4 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={() => router.push(backUrl)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Entradas
      </button>

      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Imprimir comprobante
      </button>
    </div>
  );
}
