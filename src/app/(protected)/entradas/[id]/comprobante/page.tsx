import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getEntry } from "@/lib/services/entry.service";
import EntradaComprobante from "@/components/documents/EntradaComprobante";
import ComprobanteAcciones from "@/components/documents/ComprobanteAcciones";

/**
 * Comprobante imprimible de una entrada.
 * Los datos se leen de la entrada guardada en la base de datos.
 */
export default async function ComprobantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;
  const db = getDb();

  const entry = await getEntry(db, id).catch(() => null);

  if (!entry) notFound();

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="mx-auto max-w-[21.59cm] px-4 print:max-w-none print:px-0">
        <ComprobanteAcciones />

        <div className="bg-white shadow-sm p-4 print:p-0 print:shadow-none print:bg-white">
          <EntradaComprobante
            entry={{
              id: entry.id,
              format: entry.format,
              number: entry.number,
              date: entry.date,
              status: entry.status,
              notes: entry.notes,
              purchaseOrder: entry.purchaseOrder,
              sellerNumber: entry.sellerNumber,
              thirdParty: entry.thirdParty
                ? {
                    name: entry.thirdParty.name,
                    nit: entry.thirdParty.nit,
                    address: entry.thirdParty.address,
                    phone: entry.thirdParty.phone,
                    city: entry.thirdParty.city,
                  }
                : null,
              items: entry.items.map((item) => ({
                id: item.id,
                sequence: item.sequence,
                productCode: item.productCode,
                description: item.description,
                productName: item.productName,
                presentation: item.presentation,
                costCenterCode: item.costCenterCode ?? null,
                warehouseCode: item.warehouseCode,
                quantity: item.quantity,
                unit: item.unit,
                value: item.value,
                lots: item.lots.map((lot) => ({
                  code: lot.code,
                  description: lot.description,
                  expirationDate: lot.expirationDate,
                  quantity: lot.quantity,
                })),
              })),
            }}
          />
        </div>
      </div>
    </div>
  );
}
