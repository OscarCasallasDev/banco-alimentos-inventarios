/**
 * Comprobante de entrada — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Comprobante imprimible con la estructura de la nota de entrada de
 * Siigo Pyme:
 *
 *   ┌────────────┬──────────────────────────┬───────────────────────┐
 *   │   LOGO     │  BANCO ARQUIDIOCESANO... │  NOTA ENTRADA ...     │
 *   │            │  NIT / dirección / tels. │  E - 003 - 28         │
 *   ├────────────┴──────────────────────────┴───────────────────────┤
 *   │ SEÑORES / NIT / DIRECCIÓN  │ TELÉFONO / CIUDAD │ FECHA / O.C. │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ CÓDIGO │ DESCRIPCIÓN │ C.COSTO │ BODEGA │ CANT │ UNID │ VALOR │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Lote │ Denominación │ F.V. │ Cantidad                            │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ OBSERVACIONES:                                                │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Los datos provienen de la entrada guardada: el comprobante nunca usa
 * valores escritos a mano en una plantilla aparte.
 */

import Image from "next/image";
import { INSTITUTION } from "@/lib/config/institution";
import { getEntryType } from "@/lib/entries/entry-types";
import { formatDateOnly } from "@/lib/utils";
import styles from "./entrada-comprobante.module.css";

export interface ComprobanteLot {
  code: string | null;
  description: string | null;
  expirationDate: string | null;
  quantity: number;
}

export interface ComprobanteItem {
  id: string;
  sequence: number;
  productCode: string;
  description: string | null;
  productName: string;
  presentation: string | null;
  costCenterCode: string | null;
  warehouseCode: string;
  quantity: number;
  unit: string;
  value: number;
  lots: ComprobanteLot[];
}

export interface ComprobanteThirdParty {
  name: string;
  nit: string | null;
  address: string | null;
  phone: string | null;
  city: string | null;
}

export interface ComprobanteEntry {
  id: string;
  format: string;
  number: string;
  date: string;
  status: string;
  notes: string | null;
  purchaseOrder: string | null;
  sellerNumber: number;
  thirdParty: ComprobanteThirdParty | null;
  items: ComprobanteItem[];
}

const DECIMAL_FORMAT = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatQuantity(value: number): string {
  return DECIMAL_FORMAT.format(value);
}

/**
 * Construye la descripción del producto tal como se imprime.
 * Se usa la descripción capturada en la entrada; si no existe, se compone
 * con el nombre y la presentación del catálogo.
 */
function resolveDescription(item: ComprobanteItem): string {
  if (item.description && item.description.trim()) {
    return item.description.trim();
  }

  return [item.productName, item.presentation].filter(Boolean).join(" ");
}

export default function EntradaComprobante({ entry }: { entry: ComprobanteEntry }) {
  const entryType = getEntryType(entry.format);
  const documentCode = entry.number
    .split("-")
    .map((part) => (part.length === 1 ? ` ${part} ` : part))
    .join(" - ")
    .replace(/\s+/g, " ")
    .trim();

  const hasLots = entry.items.some((item) => item.lots.length > 0);

  return (
    <div className={styles.comprobante}>
      {/* ---------- Encabezado institucional ---------- */}
      <header className={styles.encabezado}>
        <div className={styles.logoZona}>
          <div className={styles.logoMarco}>
            <Image
              src="/logo1.jpeg"
              alt="Banco Arquidiocesano de Alimentos de Ibagué"
              width={1600}
              height={1295}
              unoptimized
              className={styles.logo}
              priority
            />
          </div>
        </div>

        <div className={styles.institucion}>
          {INSTITUTION.nameLines.map((line) => (
            <p key={line} className={styles.institucionNombre}>
              {line}
            </p>
          ))}
          <p className={styles.institucionDato}>NIT: {INSTITUTION.nit}</p>
          <p className={styles.institucionDato}>{INSTITUTION.address}</p>
          <p className={styles.institucionDato}>{INSTITUTION.phones}</p>
        </div>

        <div className={styles.documentoZona}>
          <p className={styles.documentoTitulo}>{entryType.documentTitle}</p>
          <p className={styles.documentoCodigo}>{documentCode}</p>
        </div>
      </header>

      {/* ---------- Datos de la entidad que entrega ---------- */}
      <section className={styles.entidadBloque}>
        <div className={styles.entidadColumna}>
          <p>
            <span className={styles.etiqueta}>SEÑORES:</span>{" "}
            {entry.thirdParty?.name ?? entry.thirdParty?.nit ?? "—"}
          </p>
          <p>
            <span className={styles.etiqueta}>NIT:</span>{" "}
            {entry.thirdParty?.nit ?? "—"}
          </p>
          <p>
            <span className={styles.etiqueta}>DIRECCIÓN:</span>{" "}
            {entry.thirdParty?.address ?? "—"}
          </p>
        </div>

        <div className={styles.entidadColumna}>
          <p>
            <span className={styles.etiqueta}>TELÉFONO:</span>{" "}
            {entry.thirdParty?.phone ?? "—"}
          </p>
          <p>
            <span className={styles.etiqueta}>CIUDAD:</span>{" "}
            {entry.thirdParty?.city ?? "—"}
          </p>
        </div>

        <div className={`${styles.entidadColumna} ${styles.entidadDocumento}`}>
          <p>
            <span className={styles.etiqueta}>FECHA DOCUMENTO:</span>{" "}
            {formatDateOnly(entry.date)}
          </p>
          <p>
            <span className={styles.etiqueta}>ORDEN DE COMPRA:</span>{" "}
            {entry.purchaseOrder || ""}
          </p>
        </div>
      </section>

      {/* ---------- Tabla de productos ---------- */}
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th className={styles.colCodigo}>CÓDIGO</th>
            <th className={styles.colDescripcion}>DESCRIPCIÓN</th>
            <th className={styles.colCosto}>C. de COSTO</th>
            <th className={styles.colBodega}>BODEGA</th>
            <th className={styles.colCantidad}>CANTIDAD</th>
            <th className={styles.colUnidad}>UNIDAD</th>
            <th className={styles.colValor}>VALOR</th>
          </tr>
        </thead>
        <tbody>
          {entry.items.map((item) => (
            <tr key={item.id}>
              <td className={styles.colCodigo}>{item.productCode}</td>
              <td className={styles.colDescripcion}>{resolveDescription(item)}</td>
              <td className={styles.colCosto}>{item.costCenterCode ?? ""}</td>
              <td className={styles.colBodega}>{item.warehouseCode}</td>
              <td className={`${styles.colCantidad} ${styles.numero}`}>
                {formatQuantity(item.quantity)}
              </td>
              <td className={styles.colUnidad}>{item.unit}</td>
              <td className={`${styles.colValor} ${styles.numero}`}>
                {formatQuantity(item.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Lotes y fechas de vencimiento ---------- */}
      {hasLots && (
        <table className={`${styles.tabla} ${styles.tablaLotes}`}>
          <thead>
            <tr>
              <th className={styles.colLoteCodigo}>CÓDIGO LOTE</th>
              <th className={styles.colLoteDescripcion}>DENOMINACIÓN</th>
              <th className={styles.colLoteVencimiento}>FECHA VENCIMIENTO</th>
              <th className={`${styles.colLoteCantidad} ${styles.numero}`}>
                CANTIDAD
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.items.flatMap((item) =>
              item.lots.map((lot, index) => (
                <tr key={`${item.id}-${lot.code ?? index}`}>
                  <td className={styles.colLoteCodigo}>{lot.code ?? ""}</td>
                  <td className={styles.colLoteDescripcion}>
                    {lot.description ?? ""}
                  </td>
                  <td className={styles.colLoteVencimiento}>
                    {lot.expirationDate
                      ? `F.V.: ${formatDateOnly(lot.expirationDate)}`
                      : ""}
                  </td>
                  <td className={`${styles.colLoteCantidad} ${styles.numero}`}>
                    {formatQuantity(lot.quantity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* ---------- Observaciones ---------- */}
      <section className={styles.observaciones}>
        <p className={styles.etiqueta}>OBSERVACIONES:</p>
        <div className={styles.observacionesEspacio}>
          {entry.notes ?? ""}
        </div>
      </section>
    </div>
  );
}
