/**
 * Página imprimible de la ORDEN DE PEDIDO.
 *
 * Server Component: el documento se arma en el servidor con los datos que
 * quedaron guardados al crear la orden, de modo que reimprimir una orden
 * histórica reproduce el documento original.
 */

import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getSalida } from "@/lib/services/exit.service";
import OrdenPedidoDocumento from "@/components/documents/OrdenPedidoDocumento";
import ComprobanteAcciones from "@/components/documents/ComprobanteAcciones";

export const dynamic = "force-dynamic";

export default async function OrdenPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { id } = await params;

  let salida;
  try {
    salida = await getSalida(getDb(), id);
  } catch {
    notFound();
  }

  if (!salida || salida.status === "DRAFT") {
    notFound();
  }

  return (
    <div className="max-w-[21.59cm] mx-auto">
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900 uppercase">
            Orden de pedido {salida.number}
          </h1>
          <p className="text-sm text-gray-600">
            Use «Imprimir» para generar el PDF o guárdelo como PDF desde el
            diálogo del navegador.
          </p>
        </div>
        <ComprobanteAcciones
          backUrl={`/salidas-almacen/${salida.id}`}
          backLabel="Volver a la orden"
          printLabel="Imprimir orden"
        />
      </div>

      <div className="print:shadow-none">
        <OrdenPedidoDocumento
          orden={{
            number: salida.number,
            date: salida.date,
            time: salida.time,
            status: salida.status,
            programName: salida.programName,
            destinationName: salida.destinationName,
            destinationType: salida.destinationType,
            delivererName: salida.delivererName,
            delivererDocument: salida.delivererDocument,
            receiverName: salida.receiverName,
            receiverDocument: salida.receiverDocument,
            receivedDate: salida.deliveredAt
              ? new Date(salida.deliveredAt).toISOString().slice(0, 10)
              : null,
            receivedTime: salida.receiverTime,
            notes: salida.notes,
            totalQuantity: salida.totalQuantity,
            totalWeightKg: salida.totalWeightKg,
            items: salida.items.map((item) => ({
              lineNo: item.lineNo,
              productCode: item.productCode,
              productName: item.productName,
              presentation: item.presentation,
              unitCode: item.unitCode,
              // La bodega de salida es de cada línea.
              warehouseName: item.warehouseName,
              quantity: item.quantity,
              weight: item.weight,
              weightUnit: item.weightUnit,
              expirationDate: item.expirationDate,
              notes: item.notes,
            })),
          }}
        />
      </div>
    </div>
  );
}
