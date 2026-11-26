/**
 * Servicio de importación de reportes de Siigo Pyme.
 *
 * PRINCIPIOS
 *
 *  1. IDEMPOTENCIA. Un archivo se identifica por su hash SHA-256. Si ya se
 *     importó con éxito, no se vuelve a procesar. Los movimientos se
 *     identifican por una clave natural estable
 *     (producto, bodega, ubicación, fecha, documento) con restricción UNIQUE,
 *     de modo que reimportar un reporte histórico que vuelve a incluir
 *     movimientos ya procesados NO los duplica.
 *
 *  2. SEPARACIÓN DE FUENTES. El saldo que informa Siigo vive en
 *     `siigo_balances` y SOLO lo escribe este servicio. El módulo de salidas
 *     nunca lo modifica: 工作 de las existencias se hace con reservas.
 *
 *  3. TRANSPARENCIA. Cada corrida queda registrada con sus contadores
 *     (procesadas, omitidas, rechazadas), las advertencias y los errores.
 *     Las filas que no cumplen las reglas se rechazan con su motivo; nunca
 *     se descartan en silencio.
 */

import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, withTransaction, type DbExecutor } from "@/lib/db/client";
import {
  apiKeys,
  siigoImportBatches,
  siigoImportRejections,
  siigoImportRows,
  siigoImportRuns,
  siigoWarehouseMap,
  siigoBalances,
  warehouses,
} from "@/lib/db/schema";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { computeGroupBalances, type GroupBalance } from "@/lib/siigo/import/balances";
import { validateRows } from "@/lib/siigo/import/validator";
import {
  parseSiigoReport,
  round3,
  type SiigoMovementRow,
  type SiigoReportMeta,
} from "@/lib/siigo/import/parser";
import { deriveUnitWeight } from "@/lib/siigo/import/weight";
import {
  isResumenReport,
  parseResumenReport,
  type ResumenRow,
} from "@/lib/siigo/import/resumen-parser";
import { reconcileReservations } from "@/lib/services/reservation.service";
import { calculateReconciliation } from "@/lib/reconciliation/calculation";

// ============================================================
// TIPOS
// ============================================================

/** Fila normalizada tal como viaja por la API. */
export interface WireMovementRow {
  rowNumber: number;
  productCode: string;
  productName?: string;
  reference?: string;
  unit?: string;
  brand?: string;
  description?: string;
  document: string;
  date?: string | null;
  isOpening: boolean;
  bodega: number;
  ubicacion: number;
  qtyBefore?: number;
  qtyIn?: number;
  qtyOut?: number;
  qtyNet?: number;
  qtyAccum?: number;
  valueMovement?: number;
  qty2In?: number;
  qty2Out?: number;
  qty2Balance?: number;
}

export interface CreateRunInput {
  fileSha256: string;
  /** Tipo de reporte detectado en el archivo. */
  reportFormat?: SiigoReportFormat;
  fileName?: string;
  fileSize?: number;
  source?: "MANUAL" | "AGENT";
  agentId?: string;
  /** Reprocesa el archivo aunque ya se haya importado (administraci?n). */
  force?: boolean;
  meta?: Partial<SiigoReportMeta>;
}

export interface RunSummary {
  id: string;
  status: string;
  /** Tipo de reporte: DETAILED (detallado) o RESUMEN (resumen por bodega). */
  reportFormat: string | null;
  warehousesCount: number;
  locationsCount: number;
  newRecords: number;
  updatedRecords: number;
  fileName: string | null;
  fileSha256: string;
  source: string;
  reportDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  generatedAt: string | null;
  totalRows: number;
  dataRows: number;
  processedRows: number;
  skippedRows: number;
  rejectedRows: number;
  productsCount: number;
  balancesCount: number;
  movementsCount: number;
  groupsReview: number;
  diffsFound: number;
  durationMs: number | null;
  errorSummary: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  /** true si el archivo ya se había importado con éxito. */
  alreadyProcessed: boolean;
}

// ============================================================
// CONVERSIÓN
// ============================================================

/**
 * Detecta el tipo de reporte de Siigo y devuelve su contenido normalizado.
 *
 * Hay DOS reportes que el Banco puede generar:
 *
 *   - DETALLADO ("MOVIMIENTO DETALLADO DE BODEGA POR FECHA"): trae
 *     `CANT. ANTERIOR` y todos los movimientos, por lo que SÍ permite
 *     calcular el saldo real de cada producto/bodega/ubicación.
 *
 *   - RESUMEN ("RESUMEN DE MOVIMIENTO POR BODEGA"): trae entradas y salidas
 *     agregadas del periodo. NO trae saldo inicial ni final: su columna de
 *     diferencia es el MOVIMIENTO NETO, no el inventario disponible. Estos
 *     datos alimentan el catálogo de bodegas, ubicaciones y productos, y se
 *     guardan como MOVIMIENTOS, nunca como existencias.
 */
export type SiigoReportFormat = "DETAILED" | "RESUMEN";

export interface NormalizedReport {
  format: SiigoReportFormat;
  meta: {
    reportDate: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    generatedAt: string | null;
  };
  /** Filas de movimiento (formato detallado). */
  movements: SiigoMovementRow[];
  /** Filas agregadas (formato resumen). */
  resumen: ResumenRow[];
  stats: {
    scannedRows: number;
    dataRows: number;
    warehouses: number;
    locations: number;
    products: number;
  };
}

/** Interpreta el archivo y normaliza su contenido. */
export function normalizeReport(buffer: Buffer): NormalizedReport {
  if (isResumenReport(buffer)) {
    const report = parseResumenReport(buffer);
    return {
      format: "RESUMEN",
      meta: {
        reportDate: report.meta.reportDate,
        periodFrom: report.meta.periodFrom,
        periodTo: report.meta.periodTo,
        generatedAt: report.meta.generatedAt,
      },
      movements: [],
      resumen: report.rows,
      stats: {
        scannedRows: report.stats.scannedRows,
        dataRows: report.stats.dataRows,
        warehouses: report.stats.warehouses,
        locations: report.stats.locations,
        products: report.stats.products,
      },
    };
  }

  const report = parseSiigoReport(buffer);
  const warehouses = new Set<string>();
  const locations = new Set<string>();
  const products = new Set<string>();

  for (const row of report.rows) {
    warehouses.add(String(row.bodega));
    locations.add(`${row.bodega}|${row.ubicacion}`);
    products.add(row.productCode);
  }

  return {
    format: "DETAILED",
    meta: {
      reportDate: report.meta.reportDate,
      periodFrom: report.meta.periodFrom,
      periodTo: report.meta.periodTo,
      generatedAt: report.meta.generatedAt,
    },
    movements: report.rows,
    resumen: [],
    stats: {
      scannedRows: report.stats.scannedRows,
      dataRows: report.stats.dataRows,
      warehouses: warehouses.size,
      locations: locations.size,
      products: products.size,
    },
  };
}

/** Convierte una fila de la API al formato interno del parser. */
export function wireToMovementRow(row: WireMovementRow): SiigoMovementRow {
  return {
    rowNumber: row.rowNumber,
    productCode: row.productCode,
    lin: null,
    grup: null,
    elemet: null,
    productName: row.productName ?? "",
    reference: row.reference ?? "",
    unit: row.unit ?? "",
    brand: row.brand ?? "",
    description: row.description ?? "",
    document: row.document ?? "",
    documentType: null,
    documentNumber: null,
    documentSequence: null,
    date: row.date ?? null,
    isOpening: row.isOpening,
    bodega: row.bodega,
    ubicacion: row.ubicacion,
    qtyBefore: round3(row.qtyBefore ?? 0),
    valueMovement: round3(row.valueMovement ?? 0),
    qtyIn: round3(row.qtyIn ?? 0),
    valueIn: 0,
    qtyOut: round3(row.qtyOut ?? 0),
    valueOut: 0,
    qtyNet: round3(row.qtyNet ?? 0),
    qtyAccum: round3(row.qtyAccum ?? 0),
    qty2In: round3(row.qty2In ?? 0),
    qty2Out: round3(row.qty2Out ?? 0),
    qty2Balance: round3(row.qty2Balance ?? 0),
  };
}

// ============================================================
// CREACIÓN DE LA CORRIDA
// ============================================================

/**
 * Instrumentación opcional de tiempos. Se activa con SIIGO_DEBUG=1.
 */
const DEBUG = process.env.SIIGO_DEBUG === "1";

async function timed<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!DEBUG) return fn();
  const start = Date.now();
  const result = await fn();
  console.log(`  [siigo] ${label}: ${Date.now() - start} ms`);
  return result;
}

/**
 * Convierte un texto de fecha a Date, o `null` si no es interpretable.
 * Evita que un metadato mal formado rompa la importación.
 */
function toSafeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Crea (o recupera) la corrida de importación.
 *
 * Si el mismo hash ya se importó con éxito, devuelve la corrida existente
 * con `alreadyProcessed: true` y NO vuelve a procesar nada.
 */
export async function createRun(
  input: CreateRunInput,
  userId: string | null
): Promise<RunSummary> {
  const db = getDb();

  // Idempotencia por hash de archivo.
  const [existing] = await db
    .select()
    .from(siigoImportRuns)
    .where(
      and(
        eq(siigoImportRuns.fileSha256, input.fileSha256),
        eq(siigoImportRuns.status, "COMPLETED")
      )
    )
    .limit(1);

  if (existing && !input.force) {
    return { ...toSummary(existing), alreadyProcessed: true };
  }

  // Reproceso forzado: la corrida anterior NO se marca como reemplazada
  // todavía. Se conserva como COMPLETED (última importación exitosa) mientras
  // la nueva corrida se procesa; solo se reemplaza al confirmar el cierre
  // exitoso. Así, si la reimportación falla, el dashboard sigue mostrando la
  // última importación buena.

  // Una importación activa bloquea el paso: evita dos procesos simultáneos.
  const [active] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.status, "PROCESSING"))
    .orderBy(desc(siigoImportRuns.startedAt))
    .limit(1);

  if (active) {
    const startedAt = active.startedAt?.getTime() ?? Date.now();
    const stale = Date.now() - startedAt > 30 * 60 * 1000;
    if (!stale) {
      throw conflictError(
        "Ya hay una importación en curso. Espere a que termine o intente de nuevo más tarde."
      );
    }
    // Corrida abandonada: se marca como fallida y se puede reintentar.
    await db
      .update(siigoImportRuns)
      .set({
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: { message: "Corrida abandonada (sin actividad) y reintentada." },
      })
      .where(eq(siigoImportRuns.id, active.id));
  }

  const meta = input.meta ?? {};
  const [run] = await db
    .insert(siigoImportRuns)
    .values({
      fileSha256: input.fileSha256,
      fileName: input.fileName ?? null,
      fileSize: input.fileSize ?? null,
      source: input.source ?? "MANUAL",
      agentId: input.agentId ?? null,
      reportFormat: input.reportFormat ?? null,
      reportDate: meta.reportDate ?? null,
      periodFrom: meta.periodFrom ?? null,
      periodTo: meta.periodTo ?? null,
      generatedAt: toSafeDate(meta.generatedAt),
      status: "PENDING",
      createdBy: userId,
    })
    .returning();

  return { ...toSummary(run), alreadyProcessed: false };
}

// ============================================================
// LOTE DE FILAS
// ============================================================

/**
 * Filas por sentencia de inserción.
 *
 * PostgreSQL admite un máximo de 65.534 parámetros por sentencia. Insertar
 * fila por fila (2.000 filas × 22 columnas = 44.000 parámetros) funciona,
 * pero es lento: cada viaje a la base de datos cuesta ~150 ms desde Colombia
 * hasta Supabase (Ohio) y la consulta se repite 33 veces.
 *
 * La técnica que se usa aquí es `INSERT ... SELECT ... FROM unnest(...)`:
 * se envían UN parámetro por columna (un array) en vez de uno por celda.
 * Con 20.000 filas por sentencia la carga completa de 65.831 filas pasa de
 * ~120 s a ~10 s.
 */
const STAGING_INSERT_CHUNK = 20_000;

/** Convierte un valor numérico a texto para enviarlo dentro de un array. */
function numericArray(values: number[]): (string | null)[] {
  return values.map((value) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? null
      : String(value)
  );
}

/**
 * Construye un literal de array de PostgreSQL a partir de valores de texto.
 *
 * Escapado en dos niveles:
 *   1. Dentro del literal de array: cada elemento va entre comillas dobles
 *      y se escapan la barra invertida y la comilla doble. El valor `NULL`
 *      se escribe sin comillas para que quede como nulo de verdad.
 *   2. Como literal de cadena de PostgreSQL: se duplican las comillas
 *      simples.
 *
 * Se usa porque el ORM expande los arrays en un parámetro por elemento (lo
 * que dispara el límite de 65.534 parámetros). Con el literal, un INSERT de
 * 20.000 filas viaja como 21 parámetros de texto.
 */
export function pgArrayLiteral(values: (string | null | undefined)[]): string {
  const items = values.map((value) => {
    if (value === null || value === undefined) return "NULL";
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.replace(/'/g, "''")}'`;
}

export interface BatchResult {
  accepted: number;
  rejected: number;
  warnings: number;
}

/**
 * Guarda un lote de filas en el staging.
 *
 * Es idempotente: reenviar el mismo lote actualiza las filas en vez de
 * duplicarlas (restricción UNIQUE sobre `run_id` + `row_number`).
 */
export async function saveBatch(
  runId: string,
  batchIndex: number,
  wireRows: WireMovementRow[]
): Promise<BatchResult> {
  const db = getDb();

  const [run] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.id, runId))
    .limit(1);

  if (!run) throw notFoundError("Corrida de importación");

  if (run.status === "COMPLETED") {
    throw conflictError(
      "La importación ya se completó. No se admiten filas adicionales."
    );
  }

  const rows = wireRows.map(wireToMovementRow);
  const validation = validateRows(rows);

  await withTransaction(async (tx) => {
    // Filas admitidas.
    //
    // Se insertan con `unnest` (un array por columna) en vez de fila por
    // fila: es entre 10 y 12 veces más rápido con este volumen de datos.
    if (validation.accepted.length > 0) {
      for (let i = 0; i < validation.accepted.length; i += STAGING_INSERT_CHUNK) {
        const chunk = validation.accepted.slice(i, i + STAGING_INSERT_CHUNK);

        const rowNumbers = chunk.map((row) => row.rowNumber);
        const productCodes = chunk.map((row) => row.productCode);
        const productNames = chunk.map((row) => row.productName || null);
        const references = chunk.map((row) => row.reference || null);
        const brands = chunk.map((row) => row.brand || null);
        const units = chunk.map((row) => row.unit || null);
        const descriptions = chunk.map((row) => row.description || null);
        const documents = chunk.map((row) => row.document || null);
        const dates = chunk.map((row) => row.date ?? null);
        const openings = chunk.map((row) => (row.isOpening ? "1" : "0"));
        const bodegas = chunk.map((row) => row.bodega);
        const ubicaciones = chunk.map((row) => row.ubicacion);
        const qtyBefore = numericArray(chunk.map((row) => row.qtyBefore));
        const qtyIn = numericArray(chunk.map((row) => row.qtyIn));
        const qtyOut = numericArray(chunk.map((row) => row.qtyOut));
        const qtyNet = numericArray(chunk.map((row) => row.qtyNet));
        const qtyAccum = numericArray(chunk.map((row) => row.qtyAccum));
        const valueMovement = numericArray(chunk.map((row) => row.valueMovement));
        const qty2In = numericArray(chunk.map((row) => row.qty2In));
        const qty2Out = numericArray(chunk.map((row) => row.qty2Out));
        const qty2Balance = numericArray(chunk.map((row) => row.qty2Balance));

        await tx.execute(sql`
          INSERT INTO siigo_import_rows (
            run_id, row_number, product_code, product_name, reference_text,
            brand_text, unit_code, description_text, document_raw, movement_date,
            is_opening, siigo_bodega_code, location_code, qty_before, qty_in,
            qty_out, qty_net, qty_accum, value_movement, qty2_in, qty2_out, qty2_balance
          )
          SELECT
            ${runId}::uuid,
            u.row_number::int,
            u.product_code,
            u.product_name,
            u.reference_text,
            u.brand_text,
            u.unit_code,
            u.description_text,
            u.document_raw,
            u.movement_date::date,
            (u.is_opening = '1'),
            u.siigo_bodega_code::int,
            u.location_code::int,
            u.qty_before::numeric,
            u.qty_in::numeric,
            u.qty_out::numeric,
            u.qty_net::numeric,
            u.qty_accum::numeric,
            u.value_movement::numeric,
            u.qty2_in::numeric,
            u.qty2_out::numeric,
            u.qty2_balance::numeric
          FROM unnest(
            ${sql.raw(pgArrayLiteral(rowNumbers.map(String)))}::text[],
            ${sql.raw(pgArrayLiteral(productCodes))}::text[],
            ${sql.raw(pgArrayLiteral(productNames))}::text[],
            ${sql.raw(pgArrayLiteral(references))}::text[],
            ${sql.raw(pgArrayLiteral(brands))}::text[],
            ${sql.raw(pgArrayLiteral(units))}::text[],
            ${sql.raw(pgArrayLiteral(descriptions))}::text[],
            ${sql.raw(pgArrayLiteral(documents))}::text[],
            ${sql.raw(pgArrayLiteral(dates))}::text[],
            ${sql.raw(pgArrayLiteral(openings))}::text[],
            ${sql.raw(pgArrayLiteral(bodegas.map(String)))}::text[],
            ${sql.raw(pgArrayLiteral(ubicaciones.map(String)))}::text[],
            ${sql.raw(pgArrayLiteral(qtyBefore))}::text[],
            ${sql.raw(pgArrayLiteral(qtyIn))}::text[],
            ${sql.raw(pgArrayLiteral(qtyOut))}::text[],
            ${sql.raw(pgArrayLiteral(qtyNet))}::text[],
            ${sql.raw(pgArrayLiteral(qtyAccum))}::text[],
            ${sql.raw(pgArrayLiteral(valueMovement))}::text[],
            ${sql.raw(pgArrayLiteral(qty2In))}::text[],
            ${sql.raw(pgArrayLiteral(qty2Out))}::text[],
            ${sql.raw(pgArrayLiteral(qty2Balance))}::text[]
          ) AS u(
            row_number, product_code, product_name, reference_text, brand_text,
            unit_code, description_text, document_raw, movement_date, is_opening,
            siigo_bodega_code, location_code, qty_before, qty_in, qty_out, qty_net,
            qty_accum, value_movement, qty2_in, qty2_out, qty2_balance
          )
          ON CONFLICT (run_id, row_number) DO NOTHING
        `);
      }
    }

    // Filas rechazadas: se registran con su motivo, nunca se descartan en silencio.
    if (validation.rejections.length > 0) {
      await tx
        .insert(siigoImportRejections)
        .values(
          validation.rejections.map((rejection) => ({
            runId,
            rowNumber: rejection.rowNumber,
            reasonCode: rejection.code,
            reason: rejection.reason,
            payload: { raw: wireRows.find((r) => r.rowNumber === rejection.rowNumber) ?? null },
          }))
        )
        .onConflictDoNothing();
    }

    // Registro del lote.
    await tx
      .insert(siigoImportBatches)
      .values({
        runId,
        batchIndex,
        rowCount: wireRows.length,
      })
      .onConflictDoUpdate({
        target: [siigoImportBatches.runId, siigoImportBatches.batchIndex],
        set: { rowCount: wireRows.length, receivedAt: new Date() },
      });

    // Contadores acumulados.
    await tx
      .update(siigoImportRuns)
      .set({
        status: "PROCESSING",
        startedAt: run.startedAt ?? new Date(),
        stage: "STAGING",
        totalRows: run.totalRows + wireRows.length,
        dataRows: run.dataRows + validation.accepted.length,
        processedRows: run.processedRows + validation.accepted.length,
        rejectedRows: run.rejectedRows + new Set(validation.rejections.map((r) => r.rowNumber)).size,
        skippedRows:
          run.skippedRows +
          wireRows.length -
          validation.accepted.length -
          new Set(validation.rejections.map((r) => r.rowNumber)).size,
      })
      .where(eq(siigoImportRuns.id, runId));
  });

  return {
    accepted: validation.accepted.length,
    rejected: new Set(validation.rejections.map((r) => r.rowNumber)).size,
    warnings: validation.warnings.length,
  };
}

// ============================================================
// FINALIZACIÓN
// ============================================================

/**
 * Cierra la corrida: calcula saldos, actualiza catálogo, existencias,
 * movimientos, diferencias y libera las reservas reconciliadas.
 *
 * Todo dentro de una única transacción: si algo falla, el inventario
 * anterior queda intacto.
 */
/**
 * Guarda las filas normalizadas del reporte ?Resumen por bodega?.
 *
 * Son pocas filas (2.218 en el archivo del Banco), as? que se guardan en
 * la propia corrida en vez de usar la tabla de staging del reporte detallado.
 */
export async function saveResumenRows(
  runId: string,
  rows: ResumenRow[]
): Promise<{ accepted: number }> {
  const db = getDb();

  const [run] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.id, runId))
    .limit(1);
  if (!run) throw notFoundError("Corrida de importación");

  if (run.status === "COMPLETED") {
    throw conflictError("La importaci?n ya se complet?.");
  }

  await db
    .update(siigoImportRuns)
    .set({
      status: "PROCESSING",
      startedAt: run.startedAt ?? new Date(),
      stage: "STAGING",
      reportFormat: "RESUMEN",
      totalRows: rows.length,
      dataRows: rows.length,
      processedRows: rows.length,
      payload: rows as unknown as Record<string, unknown>,
    })
    .where(eq(siigoImportRuns.id, runId));

  return { accepted: rows.length };
}

/**
 * Reemplaza la corrida COMPLETED anterior del mismo archivo.
 *
 * Se ejecuta dentro de la transacción de cierre, justo antes de marcar la
 * nueva corrida como COMPLETED. Si el procesamiento falla, la corrida
 * anterior permanece intacta y el dashboard conserva su fecha y su archivo.
 */
async function supersedePreviousRun(
  tx: DbExecutor,
  runId: string,
  fileSha256: string
): Promise<void> {
  await tx.execute(sql`
    UPDATE siigo_import_runs
    SET status = 'REJECTED',
        finished_at = now(),
        error_summary = jsonb_build_object(
          'message',
          'Reimportada correctamente desde el mismo archivo.'
        )
    WHERE file_sha256 = ${fileSha256}
      AND status = 'COMPLETED'
      AND id <> ${runId}::uuid
  `);
}

export async function finalizeRun(
  runId: string,
  reportParam?: NormalizedReport
): Promise<RunSummary> {
  const db = getDb();
  const started = Date.now();

  const [run] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.id, runId))
    .limit(1);

  if (!run) throw notFoundError("Corrida de importación");
  const reportFormat: SiigoReportFormat =
    run.reportFormat === "RESUMEN" ? "RESUMEN" : "DETAILED";
  if (run.status === "COMPLETED") {
    return { ...toSummary(run), alreadyProcessed: true };
  }

  await db
    .update(siigoImportRuns)
    .set({ status: "PROCESSING", stage: "AGGREGATING", startedAt: run.startedAt ?? new Date() })
    .where(eq(siigoImportRuns.id, runId));

  try {
    const summary = await withTransaction(async (tx) => {
      // ---------- 1. Reporte «Resumen por bodega» ----------
      //
      // Este reporte trae movimientos agregados (entradas y salidas del
      // periodo) pero NO saldos: actualiza el catálogo de bodegas,
      // ubicaciones y productos, y guarda los movimientos en
      // siigo_resumen_movements. Las EXISTENCIAS no se tocan.
      if (reportFormat === "RESUMEN") {
        const resumenRows = (run.payload as unknown as ResumenRow[]) ?? [];
        const resumenReport: NormalizedReport = reportParam ?? {
          format: "RESUMEN",
          meta: {
            reportDate: run.reportDate ?? null,
            periodFrom: run.periodFrom ?? null,
            periodTo: run.periodTo ?? null,
            generatedAt: run.generatedAt?.toISOString() ?? null,
          },
          movements: [],
          resumen: resumenRows,
          stats: {
            scannedRows: run.totalRows,
            dataRows: run.dataRows,
            warehouses: 0,
            locations: 0,
            products: 0,
          },
        };

        const resumenResult = await timed("resumen por bodega", () =>
          importResumen(tx, runId, resumenReport)
        );

        await refreshConsolidatedView(tx);
        await supersedePreviousRun(tx, runId, run.fileSha256);

        const [updated] = await tx
          .update(siigoImportRuns)
          .set({
            status: "COMPLETED",
            stage: "DONE",
            finishedAt: new Date(),
            durationMs: Date.now() - started,
            productsCount: resumenResult.products,
            balancesCount: resumenResult.existencias,
            movementsCount: resumenResult.movements,
            warehousesCount: resumenResult.warehouses,
            locationsCount: resumenResult.locations,
            newRecords: resumenResult.warehouses,
            errorSummary: {
              note:
                "Reporte resumen: se actualizaron bodegas, ubicaciones, productos y " +
                `existencias (${resumenResult.existencias} registros). ` +
                "Cada existencia es la suma de entradas menos la suma de salidas " +
                "del producto en su bodega.",
            },
          })
          .where(eq(siigoImportRuns.id, runId))
          .returning();

        return toSummary(updated);
      }

      // ---------- 2. Catálogo de productos ----------
      const productCount = await timed("catálogo de productos", () =>
        upsertProducts(tx, runId)
      );

      // ---------- 2. Carga de las filas del staging ----------
      const staging = await tx
        .select()
        .from(siigoImportRows)
        .where(eq(siigoImportRows.runId, runId));

      const toMovementRow = (row: (typeof staging)[number]): SiigoMovementRow => ({
        rowNumber: row.rowNumber,
        productCode: row.productCode,
        lin: row.lin,
        grup: row.grup,
        elemet: row.elemet,
        productName: row.productName ?? "",
        reference: row.referenceText ?? "",
        unit: row.unitCode ?? "",
        brand: row.brandText ?? "",
        description: row.descriptionText ?? "",
        document: row.documentRaw ?? "",
        documentType: null,
        documentNumber: null,
        documentSequence: null,
        date: row.movementDate,
        isOpening: row.isOpening,
        bodega: row.siigoBodegaCode,
        ubicacion: row.locationCode,
        qtyBefore: Number(row.qtyBefore ?? 0),
        valueMovement: Number(row.valueMovement ?? 0),
        qtyIn: Number(row.qtyIn ?? 0),
        valueIn: 0,
        qtyOut: Number(row.qtyOut ?? 0),
        valueOut: 0,
        qtyNet: Number(row.qtyNet ?? 0),
        qtyAccum: Number(row.qtyAccum ?? 0),
        qty2In: Number(row.qty2In ?? 0),
        qty2Out: Number(row.qty2Out ?? 0),
        qty2Balance: Number(row.qty2Balance ?? 0),
      });

      // Todas las filas (movimientos y aperturas) para el cálculo de saldos.
      const allRows = staging.map(toMovementRow);

      // ---------- 3. Saldos por grupo ----------
      // IMPORTANTE: se usan TODAS las filas, incluidas las de apertura.
      // La fila de apertura (FECHA 0000/00/00) es la que trae el
      // `CANT. ANTERIOR` del grupo; sin ella el saldo quedaría mal.
      const computation = computeGroupBalances(allRows);

      // La conciliación solo compara importaciones consecutivas. Un reintento
      // del mismo archivo no genera alertas nuevas.
      const repeated = await isRepeatedFile(tx, runId, run.fileSha256);
      const previousRun = repeated
        ? null
        : await getPreviousCompletedRun(tx, runId, run.fileSha256);

      // Se capturan los saldos ANTERIORES antes de sobrescribirlos: la
      // diferencia entre el saldo viejo y el nuevo es lo que explica qué
      // salidas de almacén quedaron reflejadas en Siigo.
      const previousBalances = previousRun
        ? await timed("snapshot de saldos", () => snapshotActiveBalances(tx))
        : new Map<string, { productId: string; quantity: number }>();

      const balancesCount = await timed("saldos", () =>
        upsertBalances(tx, runId, computation.balances)
      );

      // ---------- 4. Movimientos (idempotentes por clave natural) ----------
      const movementsCount = await timed("movimientos", () =>
        upsertMovements(tx, runId)
      );

      // ---------- 5. Diferencias y conciliación de reservas ----------
      const diffs = previousRun
        ? await timed("diferencias", () =>
            computeAndStoreDiffs(tx, runId, previousBalances, previousRun)
          )
        : [];
      const reconciliation = await timed("conciliación", () =>
        reconcileReservations(tx, runId, diffs)
      );

      // ---------- 6. Cierre ----------
      // Se refresca la vista materializada para que el inventario y el
      // buscador de la orden vean los datos nuevos de inmediato.
      await refreshConsolidatedView(tx);
      await supersedePreviousRun(tx, runId, run.fileSha256);

      const [updated] = await tx
        .update(siigoImportRuns)
        .set({
          status: "COMPLETED",
          stage: "DONE",
          finishedAt: new Date(),
          durationMs: Date.now() - started,
          productsCount: productCount,
          balancesCount,
          movementsCount,
          groupsReview: computation.stats.groupsUnderReview,
          diffsFound: diffs.length,
          errorSummary: {
            issues: computation.issues.slice(0, 100),
            issueCount: computation.issues.length,
            reconciliation,
          },
        })
        .where(eq(siigoImportRuns.id, runId))
        .returning();

      return toSummary(updated);
    });

    return { ...summary, alreadyProcessed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(siigoImportRuns)
      .set({
        status: "FAILED",
        stage: "ERROR",
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        errorSummary: { message },
      })
      .where(eq(siigoImportRuns.id, runId));
    throw error;
  }
}

// ============================================================
// CATÁLOGO DE PRODUCTOS
// ============================================================

/**
 * Crea o actualiza el catálogo de productos a partir de las filas importadas.
 *
 * Regla importante: NO se sobrescribe un dato válido con un valor vacío o
 * incompleto de la importación.
 */
async function upsertProducts(
  tx: DbExecutor,
  runId: string
): Promise<number> {
  // Catálogo base: una fila por producto.
  //
  // Se agrega con GROUP BY (no con LATERAL por fila) porque el reporte tiene
  // 65.000 filas y 4.862 productos: la versión con LATERAL recorría el
  // staging una vez por cada fila y era órdenes de magnitud más lenta.
  //
  // Para cada producto se toma el primer valor NO VACÍO de cada atributo
  // (por número de fila), de modo que una fila incompleta no pisa un dato
  // válido de otra fila del mismo producto.
  await tx.execute(sql`
    INSERT INTO products (
      code, name, unit, stock_unit, unit_kind, source,
      siigo_reference, siigo_brand, siigo_lin, siigo_grup, siigo_elemet,
      tracks_expiration, status, description
    )
    SELECT
      a.product_code,
      a.product_name,
      COALESCE(a.unit, 'UND'),
      COALESCE(a.unit, 'UND'),
      CASE
        WHEN UPPER(a.unit) IN ('GR','G','KG','KGM') THEN 'MASS'::stock_unit_kind
        WHEN UPPER(a.unit) IN ('ML','MLT','L','LTS','LTR','LT') THEN 'VOLUME'::stock_unit_kind
        WHEN UPPER(a.unit) IN ('UN','UND') THEN 'COUNT'::stock_unit_kind
        ELSE 'UNKNOWN'::stock_unit_kind
      END,
      'SIIGO',
      a.reference_text,
      a.brand_text,
      a.lin, a.grup, a.elemet,
      false,
      'ACTIVE',
      a.description_text
    FROM (
      SELECT
        product_code,
        (array_agg(NULLIF(btrim(product_name), '') ORDER BY row_number))[1] AS product_name,
        (array_agg(NULLIF(btrim(unit_code), '') ORDER BY row_number))[1] AS unit,
        (array_agg(NULLIF(btrim(reference_text), '') ORDER BY row_number))[1] AS reference_text,
        (array_agg(NULLIF(btrim(brand_text), '') ORDER BY row_number))[1] AS brand_text,
        (array_agg(NULLIF(btrim(description_text), '') ORDER BY row_number))[1] AS description_text,
        MIN(lin) AS lin, MIN(grup) AS grup, MIN(elemet) AS elemet
      FROM siigo_import_rows
      WHERE run_id = ${runId}
      GROUP BY product_code
    ) a
    ON CONFLICT (code) DO UPDATE SET
      name = COALESCE(NULLIF(excluded.name, ''), products.name),
      description = COALESCE(NULLIF(excluded.description, ''), products.description),
      unit = CASE WHEN excluded.unit <> 'UND' THEN excluded.unit ELSE products.unit END,
      stock_unit = CASE WHEN excluded.stock_unit <> 'UND' THEN excluded.stock_unit ELSE products.stock_unit END,
      unit_kind = CASE WHEN excluded.unit_kind <> 'UNKNOWN'::stock_unit_kind
                       THEN excluded.unit_kind ELSE products.unit_kind END,
      source = 'SIIGO',
      siigo_reference = COALESCE(excluded.siigo_reference, products.siigo_reference),
      siigo_brand = COALESCE(excluded.siigo_brand, products.siigo_brand),
      siigo_lin = COALESCE(excluded.siigo_lin, products.siigo_lin),
      siigo_grup = COALESCE(excluded.siigo_grup, products.siigo_grup),
      siigo_elemet = COALESCE(excluded.siigo_elemet, products.siigo_elemet),
      tracks_expiration = false,
      updated_at = now()
  `);

  // Peso unitario derivado del nombre (solo bajo reglas estrictas).
  await timed("pesos derivados", () => applyDerivedWeights(tx, runId));

  const [count] = await tx.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT product_code)::int AS count
    FROM siigo_import_rows
    WHERE run_id = ${runId}
  `);

  return Number((count as unknown as { count: number })?.count ?? 0);
}

/**
 * Deriva el peso unitario a partir del nombre del producto.
 *
 * Solo se aplica si: (a) la unidad es de masa, (b) el nombre casa con el
 * patrón "X <número> GR|KG" y (c) el producto no trae segunda unidad.
 * El resultado se marca como estimación y es sobrescribible.
 */
async function applyDerivedWeights(tx: DbExecutor, runId: string): Promise<void> {
  const rows = await tx.execute<{
    code: string;
    name: string;
    unit: string;
  }>(sql`
    SELECT DISTINCT ON (product_code)
      product_code AS code,
      COALESCE(NULLIF(btrim(product_name), ''), '') AS name,
      COALESCE(NULLIF(btrim(unit_code), ''), '') AS unit
    FROM siigo_import_rows
    WHERE run_id = ${runId}
    ORDER BY product_code, row_number
  `);

  const list = (rows as unknown as { code: string; name: string; unit: string }[]) ?? [];

  const derived: { code: string; grams: number }[] = [];
  for (const row of list) {
    const grams = deriveUnitWeight(row.name, row.unit);
    if (grams !== null) derived.push({ code: row.code, grams });
  }

  if (derived.length === 0) return;

  // Actualización por lotes (VALUES + JOIN). Los valores se interpolan en el
  // fragmento SQL: Drizzle los envía como parámetros vinculados, nunca
  // concatenados en la consulta.
  const CHUNK = 200;
  for (let i = 0; i < derived.length; i += CHUNK) {
    const chunk = derived.slice(i, i + CHUNK);
    const values = sql.join(
      chunk.map((item) => sql`(${item.code}::text, ${item.grams}::numeric)`),
      sql`, `
    );
    await tx.execute(sql`
      UPDATE products p
      SET net_weight_grams = v.grams,
          weight = ROUND((v.grams / 1000)::numeric, 3),
          weight_is_estimate = true,
          weight_source = 'DERIVADO_NOMBRE',
          updated_at = now()
      FROM (VALUES ${values}) AS v(code, grams)
      WHERE p.code = v.code
        AND (p.net_weight_grams IS NULL OR p.weight_source = 'DERIVADO_NOMBRE')
    `);
  }
}

// ============================================================
// SALDOS
// ============================================================

async function upsertBalances(
  tx: DbExecutor,
  runId: string,
  balances: GroupBalance[]
): Promise<number> {
  if (balances.length === 0) return 0;

  // Identificadores de producto y bodega mapeada.
  const productIds = await tx.execute<{ code: string; id: string }>(sql`
    SELECT code, id FROM products WHERE source = 'SIIGO'
  `);
  const productIdByCode = new Map(
    (productIds as unknown as { code: string; id: string }[]).map((r) => [r.code, r.id])
  );

  const warehouseIds = await tx.execute<{ code: number; id: string }>(sql`
    SELECT siigo_bodega_code AS code, warehouse_id AS id
    FROM siigo_warehouse_map
    WHERE is_active AND warehouse_id IS NOT NULL
  `);
  const warehouseIdByCode = new Map(
    (warehouseIds as unknown as { code: number; id: string }[]).map((r) => [
      Number(r.code),
      r.id,
    ])
  );

  const CHUNK = 500;
  let written = 0;

  for (let i = 0; i < balances.length; i += CHUNK) {
    const chunk = balances.slice(i, i + CHUNK);
    const rows = chunk
      .map((group) => {
        const productId = productIdByCode.get(group.productCode);
        if (!productId) return null;
        const warehouseId = warehouseIdByCode.get(group.bodega) ?? null;
        return sql`(
          ${productId}::uuid,
          ${warehouseId}::uuid,
          ${group.bodega}::int,
          ${group.ubicacion}::int,
          ${group.calculatedQuantity}::numeric,
          ${group.reportedQuantity}::numeric,
          ${group.secondaryBalance}::numeric,
          ${group.openingQuantity}::numeric,
          ${group.reviewRequired}::boolean,
          ${group.reviewNote}::text,
          ${group.isNegative}::boolean,
          ${runId}::uuid,
          now(),
          true
        )`;
      })
      .filter((v): v is SQL => v !== null);

    if (rows.length === 0) continue;

    const values = sql.join(rows, sql`, `);

    // El reporte DETALLADO guarda el detalle por ubicación. La existencia
    // consolidada que dejó el reporte RESUMEN (location_code = 0) pasa a ser
    // histórica para que la misma bodega no se cuente dos veces. No se borra
    // nada: esas filas quedan con is_active = false.
    await tx.execute(sql`
      UPDATE siigo_balances b
      SET is_active = false, synced_at = now()
      WHERE b.is_active
        AND b.location_code = 0
        AND EXISTS (
          SELECT 1 FROM (VALUES ${values}) AS v
          WHERE v.column1::uuid = b.product_id
            AND v.column3::int = b.siigo_bodega_code
        )
    `);

    await tx.execute(sql`
      INSERT INTO siigo_balances (
        product_id, warehouse_id, siigo_bodega_code, location_code,
        quantity, reported_quantity, qty_secondary, opening_quantity,
        review_required, review_note, is_negative, import_run_id, synced_at, is_active
      )
      VALUES ${values}
      ON CONFLICT (product_id, siigo_bodega_code, location_code) DO UPDATE SET
        warehouse_id = COALESCE(excluded.warehouse_id, siigo_balances.warehouse_id),
        quantity = excluded.quantity,
        reported_quantity = excluded.reported_quantity,
        qty_secondary = excluded.qty_secondary,
        opening_quantity = excluded.opening_quantity,
        review_required = excluded.review_required,
        review_note = excluded.review_note,
        is_negative = excluded.is_negative,
        import_run_id = excluded.import_run_id,
        synced_at = now(),
        is_active = true
    `);
    written += rows.length;
  }

  // NO se desactivan existencias autom?ticamente.
  //
  // Un reporte parcial (por ejemplo, una carga de prueba o una actualizaci?n
  // de unas pocas bodegas) NO puede poner en cero el inventario completo:
  // se perder?a informaci?n real. La clave que Siigo dej? de reportar
  // conserva su ?ltimo valor conocido y su fecha de ?ltima sincronizaci?n,
  // y la interfaz la marca como "no reportada en la ?ltima importaci?n"
  // (sb.import_run_id distinto al de la ?ltima corrida).
  //
  // Las existencias que el Banco retire de Siigo se corrigen en Siigo, no
  // aqu?: este sistema refleja, no decide.

  return written;
}

// ============================================================
// MOVIMIENTOS
// ============================================================

/**
 * Guarda los movimientos de Siigo.
 *
 * La clave natural (producto, bodega, ubicación, fecha, documento) tiene
 * restricción UNIQUE: reimportar el mismo reporte actualiza en vez de
 * duplicar. Las filas de apertura no se guardan como movimiento: su
 * información ya está incorporada en el saldo del grupo.
 */
async function upsertMovements(tx: DbExecutor, runId: string): Promise<number> {
  await tx.execute<{ count: number }>(sql`
    INSERT INTO siigo_movements (
      product_id, warehouse_id, siigo_bodega_code, location_code,
      movement_date, is_opening, document_raw, description_text,
      qty_in, qty_out, qty_net, balance_after, value_movement,
      content_hash, import_run_id, created_at
    )
    SELECT
      p.id,
      m.warehouse_id,
      r.siigo_bodega_code,
      r.location_code,
      r.movement_date,
      r.is_opening,
      r.document_raw,
      r.description_text,
      r.qty_in,
      r.qty_out,
      r.qty_net,
      r.qty_accum,
      r.value_movement,
      md5(concat_ws('|', r.product_code, r.siigo_bodega_code, r.location_code,
                    coalesce(r.movement_date::text, ''), r.document_raw,
                    coalesce(r.qty_in::text, '0'), coalesce(r.qty_out::text, '0'))),
      ${runId}::uuid,
      now()
    FROM siigo_import_rows r
    JOIN products p ON p.code = r.product_code
    LEFT JOIN LATERAL (
      SELECT warehouse_id FROM siigo_warehouse_map m
      WHERE m.siigo_bodega_code = r.siigo_bodega_code
        AND m.is_active AND m.warehouse_id IS NOT NULL
      LIMIT 1
    ) m ON true
    WHERE r.run_id = ${runId}
      AND r.movement_date IS NOT NULL
    ON CONFLICT (product_id, siigo_bodega_code, location_code, movement_date, document_raw)
    DO UPDATE SET
      qty_in = excluded.qty_in,
      qty_out = excluded.qty_out,
      qty_net = excluded.qty_net,
      balance_after = excluded.balance_after,
      value_movement = excluded.value_movement,
      description_text = COALESCE(excluded.description_text, siigo_movements.description_text),
      content_hash = excluded.content_hash,
      import_run_id = excluded.import_run_id
  `);

  // El INSERT ... SELECT no devuelve filas: se cuenta lo que quedó asociado
  // a esta corrida.
  const counted = await tx.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM siigo_movements
    WHERE import_run_id = ${runId}
  `);

  return Number((counted as unknown as { count: number }[])[0]?.count ?? 0);
}

// ============================================================
// IMPORTACIÓN DEL REPORTE «RESUMEN POR BODEGA»
// ============================================================

/**
 * Actualiza el catálogo de bodegas, ubicaciones y productos a partir del
 * reporte resumido, y guarda los movimientos agregados del periodo.
 *
 * IMPORTANTE: este reporte NO contiene saldos. Lo que se guarda en
 * `siigo_resumen_movements` son MOVIMIENTOS (entradas y salidas del
 * periodo), nunca existencias disponibles. Las existencias solo pueden
 * venir del reporte detallado.
 */
async function importResumen(
  tx: DbExecutor,
  runId: string,
  report: NormalizedReport
): Promise<{
  warehouses: number;
  locations: number;
  products: number;
  movements: number;
  existencias: number;
}> {
  // ---------- Bodegas ----------
  //
  // La bodega se identifica EXCLUSIVAMENTE por su código numérico (columna B
  // del reporte). Los rótulos de las columnas A y C pueden cambiar entre
  // reportes (campañas, nombres alternativos) y se guardan como NOMBRES
  // ASOCIADOS de la misma bodega: nunca crean una bodega aparte.
  const bodegaRows = report.resumen.reduce((map, row) => {
    let entry = map.get(row.bodegaCode);

    if (!entry) {
      entry = { name: "", aliases: [] as string[] };
      map.set(row.bodegaCode, entry);
    }

    for (const candidate of [row.bodegaName, row.bodegaLabel]) {
      const value = (candidate ?? "").trim();
      if (!value) continue;
      if (!entry.aliases.includes(value)) entry.aliases.push(value);
    }

    // El nombre principal es el de la columna C (descripción de la bodega).
    if (!entry.name && row.bodegaName?.trim()) {
      entry.name = row.bodegaName.trim();
    }

    return map;
  }, new Map<number, { name: string; aliases: string[] }>());

  let newWarehouses = 0;
  let updatedWarehouses = 0;

  // Las bodegas también se insertan en lote (son pocas, pero el viaje de
  // ida y vuelta a la base de datos es lo más caro).
  const warehouseItems = [...bodegaRows.entries()];
  if (warehouseItems.length > 0) {
    const values = sql.join(
      warehouseItems.map(
        ([code, info]) =>
          sql`(${code}::int, ${
            info.name || `Bodega Siigo ${code}`
          }::text, ${info.aliases.join(" · ")}::text)`
      ),
      sql`, `
    );

    const inserted = await tx.execute<{ siigo_code: number; is_new: boolean }>(sql`
      INSERT INTO warehouses (
        code, name, description, type, status, source, siigo_code,
        alias_names, observations, created_at, updated_at
      )
      SELECT 'S' || v.code::text, v.name,
             'Bodega importada desde Siigo Pyme (código ' || v.code::text || ')',
             'PROPIA'::warehouse_type, 'ACTIVE'::warehouse_status, 'SIIGO',
             v.code, v.aliases, 'Importada desde el reporte de Siigo Pyme', now(), now()
      FROM (VALUES ${values}) AS v(code, name, aliases)
      WHERE NOT EXISTS (
        SELECT 1 FROM warehouses w WHERE w.siigo_code = v.code
      )
      RETURNING siigo_code, true AS is_new
    `);
    newWarehouses = (inserted as unknown as unknown[]).length;

    // Actualización de nombres (idempotente: no duplica bodegas).
    await tx.execute(sql`
      UPDATE warehouses w
      SET name = v.name,
          alias_names = v.aliases,
          updated_at = now()
      FROM (VALUES ${values}) AS v(code, name, aliases)
      WHERE w.siigo_code = v.code AND v.name <> '' AND w.name <> v.name
    `);

    // Los nombres asociados se actualizan aunque el nombre principal no
    // haya cambiado (pueden aparecer rótulos nuevos con el mismo código).
    await tx.execute(sql`
      UPDATE warehouses w
      SET alias_names = v.aliases, updated_at = now()
      FROM (VALUES ${values}) AS v(code, name, aliases)
      WHERE w.siigo_code = v.code AND w.alias_names IS DISTINCT FROM v.aliases
    `);

    updatedWarehouses = Math.max(
      0,
      warehouseItems.length - newWarehouses
    );
    void updatedWarehouses;
  }

  // ---------- Ubicaciones ----------
  const locationRows = report.resumen.reduce((map, row) => {
    const key = `${row.bodegaCode}|${row.locationCode}`;
    if (!map.has(key)) {
      map.set(key, {
        bodegaCode: row.bodegaCode,
        locationCode: row.locationCode,
        name: row.locationName,
      });
    }
    return map;
  }, new Map<string, { bodegaCode: number; locationCode: number; name: string }>());

  const locationItems = [...locationRows.values()];
  const LOCATION_CHUNK = 500;
  for (let i = 0; i < locationItems.length; i += LOCATION_CHUNK) {
    const chunk = locationItems.slice(i, i + LOCATION_CHUNK);
    const values = sql.join(
      chunk.map(
        (location) =>
          sql`(${location.bodegaCode}::int, ${location.locationCode}::int, ${
            location.name || `Ubicación ${location.locationCode}`
          }::text)`
      ),
      sql`, `
    );

    await tx.execute(sql`
      INSERT INTO siigo_locations (
        siigo_bodega_code, location_code, name, import_run_id, synced_at
      )
      SELECT v.bodega_code, v.location_code, v.name, ${runId}::uuid, now()
      FROM (VALUES ${values}) AS v(bodega_code, location_code, name)
      ON CONFLICT (siigo_bodega_code, location_code) DO UPDATE SET
        name = excluded.name,
        import_run_id = excluded.import_run_id,
        synced_at = now()
    `);
  }

  // ---------- Productos ----------
  const productRows = report.resumen.reduce((map, row) => {
    if (!map.has(row.productCode)) {
      map.set(row.productCode, row.productName);
    }
    return map;
  }, new Map<string, string>());

  const productIds = new Map<string, string>();

  // Se insertan en lote (un solo enunciado por bloque): hacerlo de uno en uno
  // costaba más de 400 s por el viaje de ida y vuelta a la base de datos.
  const productItems = [...productRows.entries()];
  const PRODUCT_CHUNK = 500;
  for (let i = 0; i < productItems.length; i += PRODUCT_CHUNK) {
    const chunk = productItems.slice(i, i + PRODUCT_CHUNK);
    const values = sql.join(
      chunk.map(
        ([code, name]) => sql`(${code}::text, ${name || code}::text)`
      ),
      sql`, `
    );

    const rows = await tx.execute<{ code: string; id: string }>(sql`
      INSERT INTO products (
        code, name, unit, stock_unit, unit_kind, source,
        tracks_expiration, status, created_at, updated_at
      )
      SELECT v.code, v.name, 'UND', 'UND', 'UNKNOWN'::stock_unit_kind,
             'SIIGO', false, 'ACTIVE', now(), now()
      FROM (VALUES ${values}) AS v(code, name)
      ON CONFLICT (code) DO UPDATE SET
        -- No se sobrescribe un nombre válido con uno vacío.
        name = COALESCE(NULLIF(products.name, ''), products.name),
        source = 'SIIGO',
        updated_at = now()
      RETURNING code, id
    `);

    for (const row of (rows as unknown as { code: string; id: string }[]) ?? []) {
      productIds.set(row.code, row.id);
    }
  }

  // ---------- Existencias ----------
  //
  // REGLA DE NEGOCIO DEL BANCO:
  //
  //     existencia = Σ(ENTRADAS, col I) − Σ(SALIDAS, col L)
  //
  // agrupado por CÓDIGO DE PRODUCTO (col G) + CÓDIGO DE BODEGA (col B).
  //
  // Primero se suman TODAS las filas del mismo producto en la misma bodega
  // y después se restan. Las columnas D, E, F (ubicación) se IGNORAN: la
  // existencia es una por bodega. La columna O tampoco se usa para el
  // cálculo.
  const existencias = report.resumen.reduce((map, row) => {
    const key = `${row.productCode}|${row.bodegaCode}`;
    const current = map.get(key) ?? {
      productCode: row.productCode,
      bodegaCode: row.bodegaCode,
      qtyIn: 0,
      qtyOut: 0,
    };
    current.qtyIn = round3(current.qtyIn + row.qtyIn);
    current.qtyOut = round3(current.qtyOut + row.qtyOut);
    map.set(key, current);
    return map;
  }, new Map<string, {
    productCode: string;
    bodegaCode: number;
    qtyIn: number;
    qtyOut: number;
  }>());

  const existenciasItems = [...existencias.values()].filter((item) =>
    productIds.has(item.productCode)
  );

  // El reporte es la fuente de las existencias de sus bodegas: se apaga el
  // detalle por ubicación que hubiera de una importación anterior para que
  // la misma bodega no se cuente dos veces. No se borra nada: las filas
  // quedan como histórico con is_active = false.
  const bodegasDelArchivo = [...new Set(existenciasItems.map((i) => i.bodegaCode))];
  if (bodegasDelArchivo.length > 0) {
    await tx.execute(sql`
      UPDATE siigo_balances
      SET is_active = false, synced_at = now()
      WHERE ${siigoBalances.isActive}
        AND ${siigoBalances.locationCode} <> 0
        AND ${inArray(siigoBalances.siigoBodegaCode, bodegasDelArchivo)}
    `);
  }

  let existenciasEscritas = 0;
  const EXISTENCIAS_CHUNK = 500;
  for (let i = 0; i < existenciasItems.length; i += EXISTENCIAS_CHUNK) {
    const chunk = existenciasItems.slice(i, i + EXISTENCIAS_CHUNK);
    const values = sql.join(
      chunk.map((item) => {
        const productId = productIds.get(item.productCode)!;
        const quantity = round3(item.qtyIn - item.qtyOut);
        return sql`(
          ${productId}::uuid,
          ${item.bodegaCode}::int,
          0::int,
          ${quantity}::numeric,
          ${quantity}::numeric,
          ${item.qtyIn}::numeric,
          ${item.qtyOut}::numeric,
          ${quantity < 0}
        )`;
      }),
      sql`, `
    );

    await tx.execute(sql`
      INSERT INTO siigo_balances (
        product_id, warehouse_id, siigo_bodega_code, location_code,
        quantity, reported_quantity, qty_secondary, opening_quantity,
        review_required, review_note, is_negative, import_run_id, synced_at, is_active
      )
      SELECT
        v.p,
        w.id,
        v.bod,
        v.ubi,
        v.qty,
        v.qty,
        0,
        0,
        false,
        NULL,
        v.neg,
        ${runId}::uuid,
        now(),
        true
      FROM (VALUES ${values}) AS v(p, bod, ubi, qty, rep, qin, qout, neg)
      LEFT JOIN warehouses w ON w.siigo_code = v.bod
      ON CONFLICT (product_id, siigo_bodega_code, location_code) DO UPDATE SET
        warehouse_id = COALESCE(excluded.warehouse_id, siigo_balances.warehouse_id),
        quantity = excluded.quantity,
        reported_quantity = excluded.reported_quantity,
        opening_quantity = excluded.opening_quantity,
        qty_secondary = 0,
        review_required = false,
        review_note = NULL,
        is_negative = excluded.is_negative,
        import_run_id = excluded.import_run_id,
        synced_at = now(),
        is_active = true
    `);
    existenciasEscritas += chunk.length;
  }

  // El reporte es la fuente completa de sus bodegas. Cualquier existencia
  // activa que no haya sido reescrita en esta corrida (por ejemplo, saldos
  // por ubicación o grupos que ya no aparecen) queda como histórica. No se
  // borra nada: solo deja de contarse en el inventario.
  if (bodegasDelArchivo.length > 0) {
    await tx.execute(sql`
      UPDATE siigo_balances
      SET is_active = false, synced_at = now()
      WHERE is_active
        AND ${inArray(siigoBalances.siigoBodegaCode, bodegasDelArchivo)}
        AND import_run_id <> ${runId}::uuid
    `);
  }

  // ---------- Movimientos agregados ----------
  //
  // Se agrupa por (producto, bodega, ubicaci?n) conservando la trazabilidad
  // original. La CANTIDAD es la columna O del reporte (diferencia entre
  // entradas y salidas del periodo). Las columnas J, K, M y N se ignoran.
  const aggregated = report.resumen.reduce((map, row) => {
    const key = `${row.productCode}|${row.bodegaCode}|${row.locationCode}`;
    const current = map.get(key) ?? {
      productCode: row.productCode,
      bodegaCode: row.bodegaCode,
      locationCode: row.locationCode,
      qtyIn: 0,
      qtyOut: 0,
      netQuantity: 0,
    };
    current.qtyIn = round3(current.qtyIn + row.qtyIn);
    current.qtyOut = round3(current.qtyOut + row.qtyOut);
    // La cantidad es la columna O tal como la entrega Siigo.
    current.netQuantity = round3(current.netQuantity + row.netQuantity);
    map.set(key, current);
    return map;
  }, new Map<string, {
    productCode: string;
    bodegaCode: number;
    locationCode: number;
    qtyIn: number;
    qtyOut: number;
    netQuantity: number;
  }>());

  let movements = 0;
  const items = [...aggregated.values()].filter((item) =>
    productIds.has(item.productCode)
  );

  const periodFrom = report.meta.periodFrom;
  const periodTo = report.meta.periodTo;

  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const values = sql.join(
      chunk.map((item) => {
        const productId = productIds.get(item.productCode)!;
        return sql`(
          ${productId}::uuid,
          ${item.bodegaCode}::int,
          ${item.locationCode}::int,
          ${item.qtyIn}::numeric,
          ${item.qtyOut}::numeric,
          ${item.netQuantity}::numeric,
          ${runId}::uuid
        )`;
      }),
      sql`, `
    );

    // El upsert REEMPLAZA el movimiento del grupo; nunca acumula sobre la
    // importaci?n anterior. Reimportar el mismo archivo no duplica ni suma.
    await tx.execute(sql`
      INSERT INTO siigo_resumen_movements (
        product_id, siigo_bodega_code, location_code,
        qty_in, qty_out, net_quantity,
        qty2_in, value_in, qty2_out, value_out,
        quantity_nature, period_from, period_to,
        import_run_id, synced_at
      )
      SELECT
        v.p, v.bod, v.ubi, v.qi, v.qo, v.net,
        -- J, K, M y N se ignoran: se dejan en cero para que no queden
        -- valores de importaciones anteriores.
        0, 0, 0, 0,
        'MOVIMIENTO_NETO_PERIODO',
        ${periodFrom}::date,
        ${periodTo}::date,
        ${runId}::uuid,
        now()
      FROM (VALUES ${values}) AS v(p, bod, ubi, qi, qo, net, run)
      ON CONFLICT (product_id, siigo_bodega_code, location_code) DO UPDATE SET
        qty_in = excluded.qty_in,
        qty_out = excluded.qty_out,
        net_quantity = excluded.net_quantity,
        qty2_in = 0, value_in = 0, qty2_out = 0, value_out = 0,
        quantity_nature = excluded.quantity_nature,
        period_from = excluded.period_from,
        period_to = excluded.period_to,
        import_run_id = excluded.import_run_id,
        synced_at = now()
    `);
    movements += chunk.length;
  }

  return {
    warehouses: bodegaRows.size,
    locations: locationRows.size,
    products: productRows.size,
    movements,
    existencias: existenciasEscritas,
  };
}

// ============================================================
// DIFERENCIAS
// ============================================================

export interface BalanceDiff {
  productId: string;
  /** Clave del grupo de existencias (c?digo de Siigo|bodega). */
  groupKey: string;
  siigoBodegaCode: number;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reservedQuantity: number;
  /** Saldo que debía quedar: anterior - unidades comprometidas del intervalo. */
  expectedQuantity: number;
  /** newQuantity - expectedQuantity. */
  difference: number;
  /** Unidades de órdenes creadas en el intervalo que debían reflejarse. */
  committedQuantity: number;
  /** Importación anterior con la que se comparó. */
  previousRunId: string | null;
  /** NOT_REQUIRED | PENDING | DEFERRED | VALIDATED. */
  reviewStatus: "NOT_REQUIRED" | "PENDING" | "DEFERRED" | "VALIDATED";
  status: "MATCHED" | "PARTIAL" | "UNMATCHED" | "NO_CHANGE" | "REVIEW";
  matchedSalidaId: string | null;
  note: string;
}

/** Tolerancia inicial para que una salida se refleje en Siigo Pyme. */
function reconciliationToleranceMinutes(): number {
  const raw = Number(process.env.SIIGO_RECONCILIATION_TOLERANCE_MINUTES ?? 30);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
}

/**
 * Compara el saldo nuevo con el anterior (por producto y bodega) y registra
 * las diferencias para revisión.
 */
/**
 * Lee los saldos activos por producto y bodega ANTES de actualizarlos.
 *
 * Es indispensable capturar este snapshot antes del `upsert`: al escribir el
 * saldo nuevo, el anterior se sobrescribe y la diferencia (que es la que
 * explica qu� salidas quedaron reflejadas en Siigo) se perder�a.
 */
async function snapshotActiveBalances(
  executor: DbExecutor
): Promise<Map<string, { productId: string; quantity: number }>> {
  // La comparación es por CÓDIGO de producto + bodega. Nunca por descripción:
  // dos productos distintos pueden compartir nombre y no deben mezclarse.
  const rows = await executor.execute<{
    group_key: string;
    product_id: string;
    quantity: string;
  }>(sql`
    SELECT
      lower(btrim(p.code)) || '|' || b.siigo_bodega_code::text AS group_key,
      (array_agg(b.product_id ORDER BY b.location_code))[1] AS product_id,
      SUM(b.quantity) AS quantity
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.is_active
    GROUP BY 1
  `);

  const map = new Map<string, { productId: string; quantity: number }>();
  for (const row of (rows as unknown as {
    group_key: string;
    product_id: string;
    quantity: string;
  }[]) ?? []) {
    map.set(row.group_key, {
      productId: row.product_id,
      quantity: Number(row.quantity ?? 0),
    });
  }
  return map;
}


/** Importación COMPLETED inmediatamente anterior (nunca la misma). */
async function getPreviousCompletedRun(
  executor: DbExecutor,
  runId: string,
  fileSha256: string
): Promise<{ id: string; finishedAt: Date } | null> {
  const rows = await executor.execute<{
    id: string;
    finished_at: Date | null;
  }>(sql`
    SELECT id, finished_at
    FROM siigo_import_runs
    WHERE status = 'COMPLETED'
      AND id <> ${runId}::uuid
      AND file_sha256 <> ${fileSha256}
      AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `);

  const row = (rows as unknown as { id: string; finished_at: Date | null }[])[0];
  return row?.finished_at ? { id: row.id, finishedAt: row.finished_at } : null;
}

/** ¿Este archivo ya se había importado antes? Evita duplicar alertas. */
async function isRepeatedFile(
  executor: DbExecutor,
  runId: string,
  fileSha256: string
): Promise<boolean> {
  const rows = await executor.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM siigo_import_runs
      WHERE file_sha256 = ${fileSha256}
        AND id <> ${runId}::uuid
    ) AS exists
  `);
  return Boolean((rows as unknown as { exists: boolean }[])[0]?.exists);
}

/**
 * Compara el saldo nuevo con el anterior por CÓDIGO de producto + bodega.
 *
 * Saldo esperado = saldo anterior − unidades comprometidas en órdenes del
 * intervalo que ya debían estar registradas en Siigo.
 * Diferencia = saldo nuevo − saldo esperado.
 */
async function computeAndStoreDiffs(
  tx: DbExecutor,
  runId: string,
  previous: Map<string, { productId: string; quantity: number }>,
  previousRun: { id: string; finishedAt: Date } | null
): Promise<BalanceDiff[]> {
  if (!previousRun) return [];

  // Saldos de la corrida actual, por código de producto + bodega.
  const currentRows = await tx.execute<{
    group_key: string;
    product_id: string;
    siigo_bodega_code: number;
    quantity: string;
  }>(sql`
    SELECT
      lower(btrim(p.code)) || '|' || b.siigo_bodega_code::text AS group_key,
      (array_agg(b.product_id ORDER BY b.location_code))[1] AS product_id,
      b.siigo_bodega_code,
      SUM(b.quantity) AS quantity
    FROM siigo_balances b
    JOIN products p ON p.id = b.product_id
    WHERE b.import_run_id = ${runId} AND b.is_active
    GROUP BY 1, 3
  `);

  const current = (currentRows as unknown as {
    group_key: string;
    product_id: string;
    siigo_bodega_code: number;
    quantity: string;
  }[]) ?? [];

  // Solo se comparan los productos presentes en la importación nueva. Un
  // reporte parcial (una bodega o unos pocos productos) NO significa que el
  // resto del inventario quedó en cero: esas existencias conservan su último
  // saldo conocido.

  // Reservas vigentes por código + bodega.
  const reservationRows = await tx.execute<{
    group_key: string;
    reserved: string;
  }>(sql`
    SELECT
      COALESCE(
        r.group_key,
        lower(btrim(p.code)) || '|' || r.siigo_bodega_code::text
      ) AS group_key,
      SUM(r.reserved_quantity) AS reserved
    FROM siigo_reservations r
    JOIN products p ON p.id = r.product_id
    WHERE r.state = 'PENDING'
    GROUP BY 1
  `);

  const reservedByKey = new Map(
    (reservationRows as unknown as { group_key: string; reserved: string }[]).map(
      (r) => [r.group_key, Number(r.reserved ?? 0)]
    )
  );

  // Órdenes creadas entre la importación anterior y esta, con su cantidad
  // comprometida. Las recién creadas quedan en tolerancia antes de alertar.
  const toleranceMinutes = reconciliationToleranceMinutes();
  const committedRows = await tx.execute<{
    group_key: string;
    committed: string;
    mature: boolean;
  }>(sql`
    SELECT
      lower(btrim(p.code)) || '|' || si.siigo_bodega_code::text AS group_key,
      SUM(si.quantity) AS committed,
      bool_or(
        s.created_at <= now() - (${toleranceMinutes}::int * interval '1 minute')
        OR s.status IN ('DELIVERED', 'CONFIRMED_SIIGO')
      ) AS mature
    FROM salida_items si
    JOIN salidas s ON s.id = si.salida_id
    JOIN products p ON p.id = si.product_id
    WHERE s.created_at > ${previousRun.finishedAt}
      AND s.created_at <= now()
      AND s.deleted_at IS NULL
      AND s.status IN ('GENERATED', 'DELIVERED', 'CONFIRMED_SIIGO')
    GROUP BY 1
  `);

  const committedByKey = new Map(
    (committedRows as unknown as {
      group_key: string;
      committed: string;
      mature: boolean;
    }[]).map((row) => [
      row.group_key,
      { quantity: Number(row.committed ?? 0), mature: Boolean(row.mature) },
    ])
  );

  const diffs: BalanceDiff[] = current
    .map((row) => {
      const previousEntry = previous.get(row.group_key);
      const previousQuantity = previousEntry?.quantity ?? 0;
      const newQuantity = Number(row.quantity ?? 0);
      const reservedQuantity = reservedByKey.get(row.group_key) ?? 0;
      const committed = committedByKey.get(row.group_key);
      const committedQuantity = committed?.quantity ?? 0;

      const calculation = calculateReconciliation({
        previousQuantity,
        newQuantity,
        committedQuantity,
        matureOrder: committed ? committed.mature : null,
        toleranceMinutes,
      });

      return {
        productId: row.product_id,
        groupKey: row.group_key,
        siigoBodegaCode: Number(row.siigo_bodega_code),
        previousQuantity,
        newQuantity,
        delta: calculation.delta,
        reservedQuantity,
        expectedQuantity: calculation.expectedQuantity,
        difference: calculation.difference,
        committedQuantity,
        previousRunId: previousRun.id,
        reviewStatus: calculation.reviewStatus,
        status: calculation.status,
        matchedSalidaId: null,
        note: calculation.note,
      };
    })
    .filter(
      (diff) =>
        diff.delta !== 0 ||
        diff.committedQuantity !== 0 ||
        diff.reviewStatus !== "NOT_REQUIRED"
    );

  if (diffs.length === 0) return [];

  const CHUNK = 500;
  for (let i = 0; i < diffs.length; i += CHUNK) {
    const chunk = diffs.slice(i, i + CHUNK);
    const values = sql.join(
      chunk.map(
        (diff) => sql`(
          ${runId}::uuid,
          ${diff.productId}::uuid,
          ${diff.siigoBodegaCode}::int,
          ${diff.previousQuantity}::numeric,
          ${diff.newQuantity}::numeric,
          ${diff.delta}::numeric,
          ${diff.reservedQuantity}::numeric,
          ${diff.status}::text,
          ${diff.note}::text,
          ${diff.groupKey}::text,
          ${diff.previousRunId}::uuid,
          ${diff.expectedQuantity}::numeric,
          ${diff.difference}::numeric,
          ${diff.committedQuantity}::numeric,
          ${diff.reviewStatus}::text
        )`
      ),
      sql`, `
    );

    await tx.execute(sql`
      INSERT INTO siigo_balance_diffs (
        import_run_id, product_id, siigo_bodega_code,
        previous_quantity, new_quantity, delta, reserved_quantity, status, note,
        group_key, previous_run_id, expected_quantity, difference,
        committed_quantity, review_status
      )
      VALUES ${values}
    `);
  }

  return diffs;
}

/**
 * Servicio de importación de reportes de Siigo Pyme.
 *
 * PRINCIPIOS
 *
 *  1. IDEMPOTENCIA. Un archivo se identifica por su hash SHA-256. Si ya se
 *     importó con éxito, no se vuelve a procesar. Los movimientos se
 *     identifican por una clave natural estable
 *     (producto, bodega, ubicación, fecha, documento) con restricción UNIQUE,
 *     de modo que reimportar un reporte histórico que vuelve a incluir
 *     movimientos ya procesados NO los duplica.
 *
 *  2. SEPARACIÓN DE FUENTES. El saldo que informa Siigo vive en
 *     `siigo_balances` y SOLO lo escribe este servicio. El módulo de salidas
 *     nunca lo modifica: 工作 de las existencias se hace con reservas.
 *
 *  3. TRANSPARENCIA. Cada corrida queda registrada con sus contadores
 *     (procesadas, omitidas, rechazadas), las advertencias y los errores.
 *     Las filas que no cumplen las reglas se rechazan con su motivo; nunca
 *     se descartan en silencio.
 */

function toSummary(run: typeof siigoImportRuns.$inferSelect): RunSummary {
  return {
    id: run.id,
    status: run.status,
    fileName: run.fileName,
    fileSha256: run.fileSha256,
    source: run.source,
    reportDate: run.reportDate,
    periodFrom: run.periodFrom,
    periodTo: run.periodTo,
    generatedAt: run.generatedAt?.toISOString() ?? null,
    totalRows: run.totalRows,
    dataRows: run.dataRows,
    processedRows: run.processedRows,
    skippedRows: run.skippedRows,
    rejectedRows: run.rejectedRows,
    productsCount: run.productsCount,
    balancesCount: run.balancesCount,
    movementsCount: run.movementsCount,
    groupsReview: run.groupsReview,
    diffsFound: run.diffsFound,
    durationMs: run.durationMs,
    errorSummary: run.errorSummary,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    reportFormat: run.reportFormat,
    warehousesCount: run.warehousesCount,
    locationsCount: run.locationsCount,
    newRecords: run.newRecords,
    updatedRecords: run.updatedRecords,
    alreadyProcessed: false,
  };
}

/** Historial de importaciones. */
export async function listRuns(
  limit = 20,
  offset = 0
): Promise<{ items: RunSummary[]; total: number }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(siigoImportRuns)
    .orderBy(desc(siigoImportRuns.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM siigo_import_runs
  `);

  return {
    items: rows.map((run) => ({ ...toSummary(run), alreadyProcessed: false })),
    total: Number((countRow as unknown as { count: number })?.count ?? 0),
  };
}

/** Detalle de una corrida. */
export async function getRun(runId: string): Promise<RunSummary | null> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.id, runId))
    .limit(1);
  return run ? { ...toSummary(run), alreadyProcessed: false } : null;
}

/** Filas rechazadas de una corrida. */
export async function getRunRejections(
  runId: string,
  limit = 100
): Promise<
  { rowNumber: number; reasonCode: string; reason: string }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      rowNumber: siigoImportRejections.rowNumber,
      reasonCode: siigoImportRejections.reasonCode,
      reason: siigoImportRejections.reason,
    })
    .from(siigoImportRejections)
    .where(eq(siigoImportRejections.runId, runId))
    .limit(limit);
  return rows;
}

/** Estado de la última sincronización exitosa. */
export async function getLastSuccessfulRun(): Promise<RunSummary | null> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(siigoImportRuns)
    .where(eq(siigoImportRuns.status, "COMPLETED"))
    .orderBy(desc(siigoImportRuns.finishedAt))
    .limit(1);
  return run ? { ...toSummary(run), alreadyProcessed: false } : null;
}

// ============================================================
// MAPEO DE BODEGAS
// ============================================================

export interface WarehouseMapItem {
  siigoBodegaCode: number;
  label: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  isActive: boolean;
  productCount: number;
  totalQuantity: number;
  lastSyncedAt: Date | null;
}

/**
 * Lista el mapeo entre bodegas de Siigo y bodegas de la aplicación.
 *
 * Se basea en las bodegas QUE EXISTEN EN LAS EXISTENCIAS (no solo en las que
 * el administrador ya mapeó): así se ve de inmediato cuántas bodegas de
 * Siigo hay y cuáles falta asignar. Nunca se inventa un nombre.
 */
export async function listWarehouseMap(): Promise<WarehouseMapItem[]> {
  const db = getDb();
  const rows = await db.execute<{
    siigo_bodega_code: number;
    label: string | null;
    warehouse_id: string | null;
    warehouse_code: string | null;
    warehouse_name: string | null;
    is_active: boolean;
    product_count: number;
    total_quantity: string;
    last_synced_at: Date | null;
  }>(sql`
    SELECT
      b.siigo_bodega_code,
      m.label,
      m.warehouse_id,
      w.code AS warehouse_code,
      w.name AS warehouse_name,
      COALESCE(m.is_active, true) AS is_active,
      l.products AS product_count,
      l.total AS total_quantity,
      l.last_synced_at AS last_synced_at
    FROM (
      SELECT DISTINCT siigo_bodega_code
      FROM siigo_balances
      WHERE is_active
    ) b
    LEFT JOIN siigo_warehouse_map m
      ON m.siigo_bodega_code = b.siigo_bodega_code
    LEFT JOIN warehouses w ON w.id = m.warehouse_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS products, SUM(quantity) AS total, MAX(synced_at) AS last_synced_at
      FROM siigo_balances sb
      WHERE sb.siigo_bodega_code = b.siigo_bodega_code AND sb.is_active
    ) l ON true
    ORDER BY b.siigo_bodega_code
  `);

  return (rows as unknown as {
    siigo_bodega_code: number;
    label: string | null;
    warehouse_id: string | null;
    warehouse_code: string | null;
    warehouse_name: string | null;
    is_active: boolean;
    product_count: number;
    total_quantity: string;
    last_synced_at: Date | null;
  }[]).map((row) => ({
    siigoBodegaCode: Number(row.siigo_bodega_code),
    label: row.label,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    warehouseName: row.warehouse_name,
    isActive: row.is_active !== false,
    productCount: Number(row.product_count ?? 0),
    totalQuantity: Number(row.total_quantity ?? 0),
    lastSyncedAt: row.last_synced_at,
  }));
}

/** Registra o actualiza el mapeo de una bodega de Siigo. */
export async function setWarehouseMap(
  siigoBodegaCode: number,
  warehouseId: string | null,
  label: string | null,
  isActive: boolean,
  userId: string
): Promise<void> {
  const db = getDb();

  if (warehouseId) {
    const [exists] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId))
      .limit(1);
    if (!exists) throw notFoundError("Bodega");
  }

  await db
    .insert(siigoWarehouseMap)
    .values({
      siigoBodegaCode,
      warehouseId,
      label,
      isActive,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: siigoWarehouseMap.siigoBodegaCode,
      set: {
        warehouseId,
        label,
        isActive,
        updatedAt: new Date(),
        updatedBy: userId,
      },
    });

  // Propaga la bodega mapeada a las existencias de ese código Siigo.
  await db.execute(sql`
    UPDATE siigo_balances
    SET warehouse_id = ${warehouseId}::uuid
    WHERE siigo_bodega_code = ${siigoBodegaCode}
  `);
}

/** Crea una bodega de la aplicación a partir de un código de Siigo. */
export async function createWarehouseFromSiigoCode(
  siigoBodegaCode: number,
  name: string,
  userId: string
): Promise<string> {
  const db = getDb();
  const code = `S${siigoBodegaCode}`;

  const [existing] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.code, code))
    .limit(1);

  let warehouseId = existing?.id;
  if (!warehouseId) {
    const [created] = await db
      .insert(warehouses)
      .values({
        code,
        name,
        description: `Bodega importada desde Siigo Pyme (código ${siigoBodegaCode})`,
        type: "PROPIA",
        status: "ACTIVE",
        observations: `Creada automáticamente por la importación de Siigo. Código Siigo: ${siigoBodegaCode}`,
      })
      .returning({ id: warehouses.id });
    warehouseId = created.id;
  }

  await setWarehouseMap(siigoBodegaCode, warehouseId, name, true, userId);
  return warehouseId;
}

// ============================================================
// API DEL AGENTE LOCAL
// ============================================================

/**
 * Valida la clave del agente local contra la tabla `api_keys`.
 * La clave se guarda solo hasheada; nunca en texto plano.
 */
export async function authenticateAgent(key: string): Promise<boolean> {
  if (!key) return false;
  const db = getDb();
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(key).digest("hex");

  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hash),
        eq(apiKeys.isActive, true),
        eq(apiKeys.scope, "SIIGO_IMPORT")
      )
    )
    .limit(1);

  if (!row) return false;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return true;
}

/** Genera una clave de agente y devuelve el valor en texto plano (una sola vez). */
export async function createAgentKey(
  label: string,
  userId: string
): Promise<{ id: string; key: string }> {
  const db = getDb();
  const { createHash, randomBytes } = await import("node:crypto");
  const key = `bai_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");

  const [row] = await db
    .insert(apiKeys)
    .values({ keyHash: hash, label, scope: "SIIGO_IMPORT", createdBy: userId })
    .returning({ id: apiKeys.id });

  return { id: row.id, key };
}

/** Revoca una clave de agente. */
export async function revokeAgentKey(keyId: string): Promise<void> {
  const db = getDb();
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, keyId));
}

/** Lista las claves de agente (sin exponer el valor). */
export async function listAgentKeys(): Promise<
  { id: string; label: string; isActive: boolean; lastUsedAt: Date | null; createdAt: Date }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
  return rows;
}

/** Elimina las filas de staging de corridas antiguas (conservando el histórico). */
export async function purgeStaging(keepRuns = 10): Promise<number> {
  const db = getDb();
  const result = await db.execute<{ purged: number }>(sql`
    DELETE FROM siigo_import_rows
    WHERE run_id IN (
      SELECT id FROM siigo_import_runs
      WHERE created_at < now() - interval '7 days'
        AND id NOT IN (
          SELECT id FROM siigo_import_runs ORDER BY created_at DESC LIMIT ${keepRuns}
        )
    )
  `);
  return Number((result as unknown as { purged: number })?.purged ?? 0);
}

/** Consulta las existencias por producto (usado por el módulo de inventario). */
export async function listStockBalances(options: {
  search?: string;
  siigoBodegaCode?: number;
  warehouseId?: string;
  productId?: string;
  onlyWithStock?: boolean;
  reviewOnly?: boolean;
  page: number;
  pageSize: number;
}): Promise<{
  items: unknown[];
  total: number;
  totals: { productCount: number; totalQuantity: number; totalWeightKg: number; negativeCount: number };
}> {
  const db = getDb();
  const conditions = [sql`sb.is_active`];

  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    conditions.push(sql`
      (lower(p.name) LIKE ${term} OR lower(p.code) LIKE ${term}
       OR lower(COALESCE(p.siigo_reference, '')) LIKE ${term})
    `);
  }
  if (options.siigoBodegaCode !== undefined) {
    conditions.push(sql`sb.siigo_bodega_code = ${options.siigoBodegaCode}`);
  }
  if (options.warehouseId) {
    conditions.push(sql`sb.warehouse_id = ${options.warehouseId}::uuid`);
  }
  if (options.productId) {
    conditions.push(sql`sb.product_id = ${options.productId}::uuid`);
  }
  if (options.onlyWithStock) {
    conditions.push(sql`sb.quantity <> 0`);
  }
  if (options.reviewOnly) {
    conditions.push(sql`sb.review_required`);
  }

  const where = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      sb.id, sb.product_id, sb.warehouse_id, sb.siigo_bodega_code, sb.location_code,
      sb.quantity, sb.reported_quantity, sb.qty_secondary, sb.opening_quantity,
      sb.review_required, sb.review_note, sb.is_negative, sb.synced_at,
      p.code AS product_code, p.name AS product_name, p.unit, p.stock_unit,
      p.siigo_reference, p.siigo_brand, p.description,
      p.net_weight_grams, p.weight_is_estimate,
      w.code AS warehouse_code, w.name AS warehouse_name,
      COALESCE(r.reserved, 0) AS reserved_quantity,
      COALESCE(r.reserved, 0) AS reserved_qty
    FROM siigo_balances sb
    JOIN products p ON p.id = sb.product_id
    LEFT JOIN warehouses w ON w.id = sb.warehouse_id
    LEFT JOIN LATERAL (
      SELECT SUM(reserved_quantity) AS reserved
      FROM siigo_reservations sr
      WHERE sr.product_id = sb.product_id
        AND sr.siigo_bodega_code = sb.siigo_bodega_code
        AND sr.location_code = sb.location_code
        AND sr.state = 'PENDING'
    ) r ON true
    WHERE ${where}
    ORDER BY p.name, sb.siigo_bodega_code, sb.location_code
    LIMIT ${options.pageSize} OFFSET ${options.page * options.pageSize}
  `);

  const countRow = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM siigo_balances sb
    JOIN products p ON p.id = sb.product_id
    WHERE ${where}
  `);

  const totalsRow = await db.execute<{
    product_count: number;
    total_quantity: string;
    total_weight: string;
    negative_count: number;
  }>(sql`
    SELECT
      COUNT(DISTINCT sb.product_id)::int AS product_count,
      COALESCE(SUM(sb.quantity), 0) AS total_quantity,
      COALESCE(SUM(sb.quantity * COALESCE(p.net_weight_grams, 0) / 1000), 0) AS total_weight,
      COUNT(*) FILTER (WHERE sb.is_negative)::int AS negative_count
    FROM siigo_balances sb
    JOIN products p ON p.id = sb.product_id
    WHERE ${where}
  `);

  const totals = (totalsRow as unknown as {
    product_count: number;
    total_quantity: string;
    total_weight: string;
    negative_count: number;
  }[])[0];

  return {
    items: (rows as unknown as unknown[]) ?? [],
    total: Number((countRow as unknown as { count: number }[])[0]?.count ?? 0),
    totals: {
      productCount: Number(totals?.product_count ?? 0),
      totalQuantity: Number(totals?.total_quantity ?? 0),
      totalWeightKg: Number(totals?.total_weight ?? 0),
      negativeCount: Number(totals?.negative_count ?? 0),
    },
  };
}


/**
 * Refresca la vista materializada de existencias consolidadas.
 *
 * Se ejecuta al cerrar cada importaci?n. Es r?pida (5.000 filas) y evita que
 * el inventario y el buscador de la orden paguen el costo de la agregaci?n
 * en cada consulta.
 */
export async function refreshConsolidatedView(
  executor: DbExecutor = getDb()
): Promise<void> {
  try {
    await executor.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_consolidated`);
  } catch (error) {
    // Si la vista no existe todav?a (base sin migrar), no se interrumpe la
    // importaci?n: los datos ya quedaron guardados.
    console.warn("No se pudo refrescar mv_stock_consolidated:", error);
  }
}
