/**
 * ORDEN DE PEDIDO
 *
 * Documento interno de entrega entre el almacén y la persona encargada del
 * despacho. No es un comprobante contable: el procedimiento administrativo y
 * contable continúa en Siigo Pyme.
 *
 * Los datos del detalle son una FOTO de lo que se registró al guardar la
 * orden (nombre, presentación, peso, vencimiento y bodega quedaron
 * guardados en la línea), de modo que reimprimir una orden histórica
 * reproduce exactamente el documento original aunque el inventario haya
 * cambiado.
 */

import Image from "next/image";
import { INSTITUTION } from "@/lib/config/institution";
import { BANK_TIME_ZONE } from "@/lib/utils/dates";
import styles from "./orden-pedido.module.css";

export interface OrdenPedidoItem {
  lineNo: number;
  productCode: string;
  productName: string;
  presentation: string | null;
  unitCode: string | null;
  /** Bodega de salida de ESTA línea. */
  siigoBodegaCode: number;
  warehouseName: string | null;
  quantity: number;
  weight: number | null;
  weightUnit: string | null;
  expirationDate: string | null;
  notes: string | null;
}

export interface OrdenPedido {
  number: string;
  /** Instante real de creación (UTC), para mostrar la hora del Banco. */
  createdAt: string | null;
  date: string;
  time: string;
  status: string;
  programName: string;
  destinationName: string | null;
  destinationType: string | null;
  /** Nombre del almacenista que ENTREGA (registrado al crear la orden). */
  delivererName: string | null;
  delivererDocument: string | null;
  /** Nombre de quien recibe (se diligencia en despacho). */
  receiverName: string | null;
  receiverDocument: string | null;
  /** Fecha y hora de la recepción (null si aún no se ha recibido). */
  receivedDate: string | null;
  receivedTime: string | null;
  /** Instante real de la recepción (UTC). */
  receivedAt: string | null;
  /** Momento en que se confirmó la recepción (null si no se ha recibido). */
  receiverSignedAt: string | null;
  notes: string | null;
  totalQuantity: number;
  totalWeightKg: number | null;
  items: OrdenPedidoItem[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "BORRADOR",
  GENERATED: "GENERADA",
  DELIVERED: "LISTA PARA IMPRIMIR",
  CONFIRMED_SIIGO: "LISTA PARA IMPRIMIR",
  CANCELLED: "HISTÓRICA",
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

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(date);
}

/** Fecha y hora del Banco a partir de un instante UTC. */
function formatBankDateTime(value: string | null): {
  date: string;
  time: string;
} | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date: new Intl.DateTimeFormat("es-CO", {
      dateStyle: "long",
      timeZone: BANK_TIME_ZONE,
    }).format(date),
    time: new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: BANK_TIME_ZONE,
    }).format(date),
  };
}

export default function OrdenPedidoDocumento({
  orden,
}: {
  orden: OrdenPedido;
}) {
  const totalPeso = orden.items.reduce((acc, item) => {
    if (!item.weight) return acc;
    const factor =
      item.weightUnit === "g" ? 0.001 : item.weightUnit === "kg" ? 1 : 0;
    return acc + item.weight * factor;
  }, 0);

  const creada = formatBankDateTime(orden.createdAt);
  const recibida = formatBankDateTime(orden.receivedAt);
  const fechaCreacion = creada?.date ?? formatDate(orden.date);
  const horaCreacion = creada?.time ?? orden.time;

  return (
    <div className={styles.documento}>
      {/* Encabezado superior: título del sistema */}
      <div className={styles.encabezadoSuperior}>
        <p className={`${styles.tituloSistema} print-brand`}>
          Sistema de Gestión de Inventarios | Banco Arquidiocesano de Alimentos
          de Ibagué
        </p>
      </div>

      {/* Separación vertical entre el encabezado superior y el institucional */}
      <div className={styles.separacionSuperior} />

      {/* Encabezado institucional */}
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
          <div className={styles.textoInstitucion}>
            <p className={`${styles.banco} print-brand`}>{INSTITUTION.nameLines[0]}</p>
            <p className={`${styles.banco} print-brand`}>{INSTITUTION.nameLines[1]}</p>
            <p className={styles.datosInstitucion}>
              NIT {INSTITUTION.nit} · {INSTITUTION.address}
            </p>
            <p className={styles.datosInstitucion}>
              Tel. {INSTITUTION.phones}
            </p>
          </div>
        </div>

        <div className={styles.encabezadoDocumento}>
          <p className={`${styles.tituloDocumento} print-brand`}>ORDEN DE PEDIDO</p>
          <p className={styles.numeroDocumento}>{orden.number}</p>
          <p className={styles.fechaDocumento}>
            Fecha: {fechaCreacion} &nbsp;·&nbsp; Hora: {horaCreacion}
          </p>
          <p className={`${styles.estadoDocumento} print-brand`}>
            Estado: {STATUS_LABELS[orden.status] ?? orden.status}
          </p>
        </div>
      </header>

      {/* Información general */}
      <section className={styles.bloqueGeneral}>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>DESTINO</span>
          <span className={styles.valor}>
            {orden.destinationName ?? "—"}
            {orden.destinationType && (
              <span className={styles.subDetalle}>
                {orden.destinationType === "PARROQUIA"
                  ? "Parroquia"
                  : orden.destinationType === "GRUPO_FAMILIA"
                    ? "Grupo de familia"
                    : orden.destinationType}
              </span>
            )}
          </span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>PROGRAMA</span>
          <span className={styles.valor}>{orden.programName || "—"}</span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>ALMACENISTA (QUIEN ENTREGA)</span>
          <span className={styles.valor}>
            {orden.delivererName ?? "—"}
            {orden.delivererDocument && (
              <span className={styles.subDetalle}>
                Cédula: {orden.delivererDocument}
              </span>
            )}
          </span>
        </div>
        <div className={styles.datoGeneral}>
          <span className={styles.etiqueta}>RECIBE EN DESPACHO</span>
          <span className={styles.valor}>
            {orden.receiverName ?? ""}
            {orden.receiverDocument && (
              <span className={styles.subDetalle}>
                Cédula: {orden.receiverDocument}
              </span>
            )}
          </span>
        </div>
      </section>

      {/* Detalle */}
      <table className={`${styles.tabla} print-table`}>
        <thead>
          <tr>
            <th className={styles.colNumero}>#</th>
            <th className={styles.colCodigo}>CÓDIGO</th>
            <th className={styles.colProducto}>PRODUCTO</th>
            <th className={styles.colBodegaNumero}>N.º BODEGA</th>
            <th className={styles.colBodegaNombre}>NOMBRE DE BODEGA</th>
            <th className={styles.colCantidad}>CANTIDAD</th>
            <th className={styles.colUnidad}>UNIDAD</th>
            <th className={styles.colPeso}>PESO</th>
            <th className={styles.colUnidadPeso}>UNID. PESO</th>
            <th className={styles.colVencimiento}>VENCIMIENTO</th>
          </tr>
        </thead>
        <tbody>
          {orden.items.map((item) => (
            <tr key={item.lineNo}>
              <td className={styles.numero}>{item.lineNo}</td>
              <td className={styles.codigo}>{item.productCode}</td>
              <td>
                {item.productName}
                {item.notes && (
                  <span className={styles.notaProducto}> · {item.notes}</span>
                )}
              </td>
              <td className={styles.numero}>{item.siigoBodegaCode}</td>
              <td className={styles.bodega}>
                {item.warehouseName ?? "—"}
              </td>
              <td className={styles.numero}>{formatNumber(item.quantity)}</td>
              <td>{item.unitCode ?? "—"}</td>
              <td className={styles.numero}>
                {item.weight !== null ? formatNumber(item.weight) : "—"}
              </td>
              <td>{item.weight !== null ? (item.weightUnit ?? "—") : "—"}</td>
              <td className={styles.numero}>
                {formatShortDate(item.expirationDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Resumen */}
      <section className={styles.resumen}>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>TOTAL DE LÍNEAS</span>
          <span className={styles.valor}>{orden.items.length}</span>
        </div>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>TOTAL DE UNIDADES</span>
          <span className={styles.valor}>{formatNumber(orden.totalQuantity)}</span>
        </div>
        <div className={styles.resumenItem}>
          <span className={styles.etiqueta}>PESO TOTAL</span>
          <span className={styles.valor}>
            {totalPeso > 0 ? `${formatNumber(totalPeso)} kg` : "—"}
          </span>
        </div>
      </section>

      {/* Observaciones */}
      <section className={styles.observaciones}>
        <p className={styles.etiqueta}>OBSERVACIONES</p>
        <p className={styles.textoObservaciones}>{orden.notes ?? ""}</p>
      </section>

      {/* Firmas */}
      <section className={styles.firmas}>
        <div className={styles.bloqueFirma}>
          <p className={`${styles.tituloFirma} print-brand`}>
            ENTREGA — ALMACENISTA
          </p>
          <div className={styles.lineaFirma} />
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Nombre:</span>{" "}
            {orden.delivererName ?? ""}
          </p>
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Cédula:</span>{" "}
            {orden.delivererDocument ?? ""}
          </p>
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Fecha:</span>{" "}
            ____ / ____ / ______ &nbsp;&nbsp;
            <span className={styles.campoEtiqueta}>Hora:</span> ____ : ____
          </p>
        </div>

        <div className={styles.bloqueFirma}>
          <p className={`${styles.tituloFirma} print-brand`}>
            RECIBE — ENCARGADO(A) DE DESPACHO
          </p>
          <div className={styles.lineaFirma} />
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Nombre:</span>{" "}
            {orden.receiverName ?? ""}
          </p>
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Cédula:</span>{" "}
            {orden.receiverDocument ?? ""}
          </p>
          <p className={styles.campoFirma}>
            <span className={styles.campoEtiqueta}>Fecha:</span>{" "}
            {recibida?.date ??
              (orden.receivedDate
                ? formatShortDate(orden.receivedDate)
                : "____ / ____ / ______")}
            &nbsp;&nbsp;
            <span className={styles.campoEtiqueta}>Hora:</span>{" "}
            {recibida?.time ?? orden.receivedTime ?? "____ : ____"}
          </p>
        </div>
      </section>

      {/* Pie */}
      <footer className={styles.pie}>
        <p>
          Orden de pedido interna: soporte de entrega entre Almacén y Despacho.
          No constituye comprobante contable ni reemplaza los registros en Siigo
          Pyme. Las firmas se diligencian manualmente sobre el documento
          impreso.
        </p>
        <p className={styles.pieDerecha}>{orden.number}</p>
      </footer>
    </div>
  );
}
