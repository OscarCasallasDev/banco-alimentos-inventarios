/**
 * COMPROBANTE DE SALIDA DE ALMACÉN
 *
 * Documento de entrega interna entre el almacén y la persona encargada del
 * despacho. Sirve de soporte para que despacho continúe el procedimiento
 * administrativo y contable en Siigo Pyme.
 *
 * Los datos que se imprimen son una FOTO de lo que se registró al crear la
 * salida (nombre, presentación, unidad y peso unitario quedaron
 * almacenados en la línea), de modo que reimprimir una salida histórica
 * reproduce exactamente el documento original.
 *
 * No es un comprobante contable ni tiene certificación legal: es un soporte
 * interno sujeto a aprobación del Banco.
 */

import Image from "next/image";
import { INSTITUTION } from "@/lib/config/institution";
import styles from "./salida-comprobante.module.css";

export interface ComprobanteSalidaItem {
  lineNo: number;
  productCode: string;
  productName: string;
  productReference: string | null;
  presentation: string | null;
  unitCode: string | null;
  quantity: number;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  weightKnown: boolean;
  notes: string | null;
}

export interface ComprobanteSalida {
  number: string;
  date: string;
  time: string;
  status: string;
  programName: string;
  warehouseName: string | null;
  siigoBodegaCode: number | null;
  locationCode: number | null;
  userName: string;
  receiverName: string | null;
  receiverDocument: string | null;
  notes: string | null;
  totalQuantity: number;
  totalWeightKg: number | null;
  weightPartial: boolean;
  itemCount: number;
  items: ComprobanteSalidaItem[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "BORRADOR",
  GENERATED: "GENERADA",
  DELIVERED: "RECIBIDA EN DESPACHO",
  CONFIRMED_SIIGO: "CONFIRMADA EN SIIGO",
  CANCELLED: "ANULADA",
};

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(date);
}

export default function SalidaComprobante({
  salida,
}: {
  salida: ComprobanteSalida;
}) {
  const referenceCount = new Set(salida.items.map((i) => i.productCode)).size;

  return (
    <div className={styles.documento}>
      {/* Encabezado */}
      <header className={styles.encabezado}>
        <div className={styles.encabezadoInstitucion}>
          <Image
            src="/logo1.jpeg"
            alt="Banco Arquidiocesano de Alimentos de Ibagué"
            width={120}
            height={96}
            unoptimized
            priority
            className={styles.logo}
          />
          <div>
            <p className={styles.banco}>{INSTITUTION.nameLines[0]}</p>
            <p className={styles.banco}>{INSTITUTION.nameLines[1]}</p>
            <p className={styles.datosInstitucion}>
              NIT {INSTITUTION.nit} · {INSTITUTION.address}
            </p>
            <p className={styles.datosInstitucion}>
              Tel. {INSTITUTION.phones}
            </p>
          </div>
        </div>

        <div className={styles.encabezadoDocumento}>
          <p className={styles.tituloDocumento}>COMPROBANTE DE SALIDA DE ALMACÉN</p>
          <p className={styles.numeroDocumento}>{salida.number}</p>
          <p className={styles.fechaDocumento}>
            Fecha: {formatDate(salida.date)} &nbsp;·&nbsp; Hora: {salida.time}
          </p>
          <p className={styles.estadoDocumento}>
            Estado: {STATUS_LABELS[salida.status] ?? salida.status}
          </p>
        </div>
      </header>

      {/* Información general */}
      <section className={styles.bloqueGeneral}>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>PROGRAMA / DESTINO</span>
          <span className={styles.valor}>{salida.programName}</span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>BODEGA DE ORIGEN</span>
          <span className={styles.valor}>
            {salida.warehouseName ??
              (salida.siigoBodegaCode !== null
                ? `Bodega ${salida.siigoBodegaCode}`
                : "—")}
            {salida.locationCode !== null && ` · Ub. ${salida.locationCode}`}
          </span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>ALMACENISTA</span>
          <span className={styles.valor}>{salida.userName}</span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>RECIBE EN DESPACHO</span>
          <span className={styles.valor}>
            {salida.receiverName ?? "—"}
            {salida.receiverDocument && ` · ${salida.receiverDocument}`}
          </span>
        </div>
      </section>

      {/* Tabla de productos */}
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th className={styles.colNumero}>#</th>
            <th className={styles.colReferencia}>REFERENCIA</th>
            <th className={styles.colProducto}>PRODUCTO</th>
            <th className={styles.colPresentacion}>PRESENTACIÓN</th>
            <th className={styles.colUnidad}>UNIDAD</th>
            <th className={styles.colCantidad}>CANTIDAD</th>
            <th className={styles.colPesoUnit}>PESO UNIT.</th>
            <th className={styles.colPesoTotal}>PESO TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {salida.items.map((item) => (
            <tr key={item.lineNo}>
              <td className={styles.numero}>{item.lineNo}</td>
              <td className={styles.codigo}>{item.productCode}</td>
              <td>
                {item.productName}
                {item.notes && (
                  <span className={styles.notaProducto}> · {item.notes}</span>
                )}
              </td>
              <td>{item.presentation ?? "—"}</td>
              <td>{item.unitCode ?? "—"}</td>
              <td className={styles.numero}>{formatNumber(item.quantity)}</td>
              <td className={styles.numero}>
                {item.weightKnown
                  ? `${formatNumber(item.unitWeightKg)} kg`
                  : "No informado"}
              </td>
              <td className={styles.numero}>
                {item.totalWeightKg !== null
                  ? `${formatNumber(item.totalWeightKg)} kg`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Resumen */}
      <section className={styles.resumen}>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>TOTAL DE REFERENCIAS</span>
          <span className={styles.valor}>{referenceCount}</span>
        </div>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>TOTAL DE UNIDADES</span>
          <span className={styles.valor}>{formatNumber(salida.totalQuantity)}</span>
        </div>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>PESO TOTAL CONOCIDO</span>
          <span className={styles.valor}>
            {salida.totalWeightKg !== null
              ? `${formatNumber(salida.totalWeightKg)} kg`
              : "No informado"}
            {salida.weightPartial && (
              <span className={styles.notaParcial}>(parcial)</span>
            )}
          </span>
        </div>
      </section>

      {salida.notes && (
        <section className={styles.observaciones}>
          <p className={styles.etiqueta}>OBSERVACIONES GENERALES</p>
          <p className={styles.textoObservaciones}>{salida.notes}</p>
        </section>
      )}

      {/* Firmas */}
      <section className={styles.firmas}>
        <div className={styles.bloqueFirma}>
          <p className={styles.tituloFirma}>ENTREGA — ALMACENISTA</p>
          <div className={styles.lineaFirma} />
          <p className={styles.nombreFirma}>{salida.userName}</p>
          <p className={styles.cargoFirma}>Almacenista</p>
          <div className={styles.lineaFirmaCorta} />
          <p className={styles.fechaFirma}>
            Fecha: ____ / ____ / ______ &nbsp;&nbsp; Hora: ____ : ____
          </p>
        </div>

        <div className={styles.bloqueFirma}>
          <p className={styles.tituloFirma}>RECIBE — DESPACHO</p>
          <div className={styles.lineaFirma} />
          <p className={styles.nombreFirma}>{salida.receiverName ?? ""}</p>
          <p className={styles.cargoFirma}>
            {salida.receiverDocument ?? "Nombre y documento"}
          </p>
          <div className={styles.lineaFirmaCorta} />
          <p className={styles.fechaFirma}>
            Fecha: ____ / ____ / ______ &nbsp;&nbsp; Hora: ____ : ____
          </p>
        </div>
      </section>

      {/* Pie */}
      <footer className={styles.pie}>
        <p>
          Soporte interno de entrega entre Almacén y Despacho. No constituye
          comprobante contable ni reemplaza los registros en Siigo Pyme. Las
          firmas se diligencian manualmente sobre el documento impreso.
        </p>
        <p className={styles.pieDerecha}>{salida.number}</p>
      </footer>
    </div>
  );
}
