/**
 * Vencimientos y alertas.
 *
 * OBJETIVO PRINCIPAL
 *
 *   Anticiparse a los productos que vencen la SEMANA SIGUIENTE. El rango se
 *   calcula automáticamente a partir de la fecha actual en la zona horaria
 *   de Colombia (America/Bogota): no hay fechas fijas en el código.
 *
 * ESTADO DE LA IMPORTACIÓN
 *
 *   El Banco todavía no ha entregado el archivo de vencimientos. Por eso la
 *   estructura de datos (`vencimiento_lotes`), las alertas y la interfaz
 *   están listas, y el importador acepta filas normalizadas. Lo único que
 *   falta cuando llegue el archivo es escribir el lector de sus columnas
 *   (ver `docs/IMPORTACION_SIIGO.md`).
 */

import { sql } from "drizzle-orm";
import { getDb, withTransaction, type DbExecutor } from "@/lib/db/client";

// ============================================================
// FECHAS (zona horaria de Colombia)
// ============================================================

const BOGOTA_TIME_ZONE = "America/Bogota";

/** Fecha de hoy en Colombia, como 'YYYY-MM-DD'. */
export function bogotaToday(): string {
  // `en-CA` produce el formato ISO (YYYY-MM-DD).
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Semana (lunes a domingo) desplazada `offsetWeeks` semanas desde la actual.
 *
 *   offsetWeeks = 0  → semana actual
 *   offsetWeeks = 1  → semana siguiente
 */
export function weekRange(offsetWeeks = 0, baseIso = bogotaToday()): DateRange {
  const date = new Date(`${baseIso}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = domingo … 6 = sábado
  const daysSinceMonday = (weekday + 6) % 7;

  const monday = new Date(date);
  monday.setUTCDate(
    date.getUTCDate() - daysSinceMonday + offsetWeeks * 7
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { from: iso(monday), to: iso(sunday) };
}

/** Rangos que usa el módulo. */
export function vencimientoRanges(baseIso = bogotaToday()) {
  return {
    today: baseIso,
    currentWeek: weekRange(0, baseIso),
    nextWeek: weekRange(1, baseIso),
    next15: { from: baseIso, to: addDays(baseIso, 15) },
    next30: { from: baseIso, to: addDays(baseIso, 30) },
  };
}

// ============================================================
// TIPOS
// ============================================================

export type VencimientoCategory =
  | "next_week"
  | "current_week"
  | "expired"
  | "next_15"
  | "next_30"
  | "all";

export interface VencimientoRow {
  id: string;
  productCode: string;
  productName: string | null;
  lotCode: string | null;
  siigoBodegaCode: number | null;
  locationCode: number | null;
  quantity: number | null;
  unit: string | null;
  expirationDate: string | null;
  /** Días restantes (negativo si ya venció). */
  daysLeft: number | null;
  syncedAt: Date | null;
}

export interface AlertsSummary {
  nextWeek: number;
  currentWeek: number;
  expired: number;
  next15: number;
  next30: number;
  /** Productos consolidados con disponibilidad < 0. */
  negativeStock: number;
  /** Productos consolidados con disponibilidad = 0. */
  zeroStock: number;
  /** Inconsistencias detectadas en lo importado. */
  discrepancies: number;
  /** Lotes con vencimiento cargados. */
  expirationRecords: number;
}

export interface Discrepancy {
  code: string;
  label: string;
  count: number;
  detail: string;
}

// ============================================================
// CONSULTAS
// ============================================================

/**
 * Lista lotes con vencimiento según la categoría.
 */
export async function listVencimientos(
  options: {
    category?: VencimientoCategory;
    search?: string;
    page?: number;
    pageSize?: number;
  },
  executor: DbExecutor = getDb()
): Promise<{ items: VencimientoRow[]; total: number; range: DateRange | null }> {
  const ranges = vencimientoRanges();
  const page = options.page ?? 0;
  const pageSize = Math.min(options.pageSize ?? 50, 200);

  const conditions = [sql`1 = 1`];
  let range: DateRange | null = null;

  switch (options.category) {
    case "next_week":
      range = ranges.nextWeek;
      conditions.push(
        sql`v.expiration_date BETWEEN ${range.from}::date AND ${range.to}::date`
      );
      break;
    case "current_week":
      range = ranges.currentWeek;
      conditions.push(
        sql`v.expiration_date BETWEEN ${range.from}::date AND ${range.to}::date`
      );
      break;
    case "expired":
      conditions.push(sql`v.expiration_date < ${ranges.today}::date`);
      break;
    case "next_15":
      range = ranges.next15;
      conditions.push(
        sql`v.expiration_date BETWEEN ${range.from}::date AND ${range.to}::date`
      );
      break;
    case "next_30":
      range = ranges.next30;
      conditions.push(
        sql`v.expiration_date BETWEEN ${range.from}::date AND ${range.to}::date`
      );
      break;
    default:
      conditions.push(sql`v.expiration_date IS NOT NULL`);
      break;
  }

  if (options.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim().toLowerCase()}%`;
    const compact = `%${options.search.trim().toLowerCase().replace(/-/g, "")}%`;
    conditions.push(sql`
      (
        lower(coalesce(v.product_name, '')) LIKE ${term}
        OR lower(v.product_code) LIKE ${term}
        OR lower(replace(v.product_code, '-', '')) LIKE ${compact}
        OR lower(coalesce(v.lot_code, '')) LIKE ${term}
      )
    `);
  }

  const where = sql.join(conditions, sql` AND `);

  const rows = await executor.execute(sql`
    SELECT
      v.id, v.product_code, v.product_name, v.lot_code,
      v.siigo_bodega_code, v.location_code, v.quantity, v.unit,
      to_char(v.expiration_date, 'YYYY-MM-DD') AS expiration_date,
      (v.expiration_date - ${ranges.today}::date) AS days_left,
      v.synced_at
    FROM vencimiento_lotes v
    WHERE ${where}
    ORDER BY
      CASE WHEN v.expiration_date < ${ranges.today}::date THEN 1 ELSE 0 END,
      v.expiration_date ASC,
      v.product_name ASC
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `);

  const countRows = await executor.execute<{ total: number }>(sql`
    SELECT COUNT(*)::int AS total
    FROM vencimiento_lotes v
    WHERE ${where}
  `);

  const items = (rows as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    productCode: String(row.product_code),
    productName: (row.product_name as string | null) ?? null,
    lotCode: (row.lot_code as string | null) ?? null,
    siigoBodegaCode:
      row.siigo_bodega_code === null || row.siigo_bodega_code === undefined
        ? null
        : Number(row.siigo_bodega_code),
    locationCode:
      row.location_code === null || row.location_code === undefined
        ? null
        : Number(row.location_code),
    quantity:
      row.quantity === null || row.quantity === undefined
        ? null
        : Number(row.quantity),
    unit: (row.unit as string | null) ?? null,
    expirationDate: (row.expiration_date as string | null) ?? null,
    daysLeft:
      row.days_left === null || row.days_left === undefined
        ? null
        : Number(row.days_left),
    syncedAt: (row.synced_at as Date | null) ?? null,
  }));

  return {
    items,
    total: Number((countRows as unknown as { total: number }[])[0]?.total ?? 0),
    range,
  };
}

/** Cuenta los lotes de un rango de fechas. */
async function countRange(
  executor: DbExecutor,
  from: string,
  to: string
): Promise<number> {
  const rows = await executor.execute<{ total: number }>(sql`
    SELECT COUNT(*)::int AS total
    FROM vencimiento_lotes
    WHERE expiration_date BETWEEN ${from}::date AND ${to}::date
  `);
  return Number((rows as unknown as { total: number }[])[0]?.total ?? 0);
}

/** Resumen de todas las alertas. */
export async function getAlertsSummary(
  executor: DbExecutor = getDb()
): Promise<AlertsSummary> {
  const ranges = vencimientoRanges();

  const [nextWeek, currentWeek, next15, next30] = await Promise.all([
    countRange(executor, ranges.nextWeek.from, ranges.nextWeek.to),
    countRange(executor, ranges.currentWeek.from, ranges.currentWeek.to),
    countRange(executor, ranges.next15.from, ranges.next15.to),
    countRange(executor, ranges.next30.from, ranges.next30.to),
  ]);

  const rows = await executor.execute<{
    expired: number;
    expiration_records: number;
    negative_stock: number;
    zero_stock: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM vencimiento_lotes
        WHERE expiration_date < ${ranges.today}::date) AS expired,
      (SELECT COUNT(*)::int FROM vencimiento_lotes) AS expiration_records,
      (SELECT COUNT(*)::int FROM v_stock_consolidated
        WHERE (quantity - reserved) < 0) AS negative_stock,
      (SELECT COUNT(*)::int FROM v_stock_consolidated
        WHERE (quantity - reserved) = 0) AS zero_stock
  `);

  const row = (rows as unknown as Record<string, number>[])[0];
  const discrepancies = await getDiscrepancies(executor);

  return {
    nextWeek,
    currentWeek,
    expired: Number(row?.expired ?? 0),
    next15,
    next30,
    negativeStock: Number(row?.negative_stock ?? 0),
    zeroStock: Number(row?.zero_stock ?? 0),
    discrepancies: discrepancies.reduce((sum, d) => sum + d.count, 0),
    expirationRecords: Number(row?.expiration_records ?? 0),
  };
}

/**
 * Inconsistencias de la información importada.
 *
 * NO se cuenta como discrepancia que un producto aparezca en varias
 * ubicaciones: la consolidación por descripción lo resuelve correctamente.
 */
export async function getDiscrepancies(
  executor: DbExecutor = getDb()
): Promise<Discrepancy[]> {
  const rows = await executor.execute<{
    sin_codigo: number;
    sin_descripcion: number;
    bodega_desconocida: number;
    rechazos: number;
    vencimiento_sin_fecha: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM siigo_balances b
        JOIN products p ON p.id = b.product_id
        WHERE b.is_active AND btrim(p.code) = '') AS sin_codigo,
      (SELECT COUNT(*)::int FROM siigo_balances b
        JOIN products p ON p.id = b.product_id
        WHERE b.is_active AND btrim(p.name) = '') AS sin_descripcion,
      (SELECT COUNT(*)::int FROM siigo_balances b
        WHERE b.is_active AND NOT EXISTS (
          SELECT 1 FROM siigo_locations l
          WHERE l.siigo_bodega_code = b.siigo_bodega_code
        )) AS bodega_desconocida,
      (SELECT COUNT(*)::int FROM siigo_import_rejections
        WHERE reason_code IN ('CANTIDAD_INCONSISTENTE', 'DIFERENCIA_NO_COINCIDE')) AS rechazos,
      (SELECT COUNT(*)::int FROM vencimiento_lotes
        WHERE expiration_date IS NULL) AS vencimiento_sin_fecha
  `);

  const row = (rows as unknown as Record<string, number>[])[0] ?? {};

  const items: Discrepancy[] = [
    {
      code: "SIN_CODIGO",
      label: "Registros sin código de producto",
      count: Number(row.sin_codigo ?? 0),
      detail:
        "Filas del inventario cuyo producto no tiene código de Siigo. No se pueden relacionar con una orden.",
    },
    {
      code: "SIN_DESCRIPCION",
      label: "Registros sin descripción",
      count: Number(row.sin_descripcion ?? 0),
      detail:
        "Filas del inventario sin nombre de producto. Se conservan, pero no se pueden consolidar por descripción.",
    },
    {
      code: "BODEGA_DESCONOCIDA",
      label: "Bodegas desconocidas",
      count: Number(row.bodega_desconocida ?? 0),
      detail:
        "Existencias en un código de bodega que no aparece en el catálogo importado.",
    },
    {
      code: "CANTIDAD_NO_INTERPRETABLE",
      label: "Cantidades no interpretables",
      count: Number(row.rechazos ?? 0),
      detail:
        "Filas rechazadas por cantidades inconsistentes o por una diferencia que no coincide con entradas − salidas.",
    },
    {
      code: "VENCIMIENTO_SIN_FECHA",
      label: "Lotes sin fecha de vencimiento",
      count: Number(row.vencimiento_sin_fecha ?? 0),
      detail:
        "Registros del archivo de vencimientos sin fecha válida (cuando el archivo esté disponible).",
    },
  ];

  return items.filter((item) => item.count > 0);
}

/** Historial de importaciones de vencimientos. */
export async function listVencimientoImports(
  executor: DbExecutor = getDb()
): Promise<
  {
    id: string;
    fileName: string | null;
    status: string;
    processedRows: number;
    rejectedRows: number;
    createdAt: Date;
  }[]
> {
  const rows = await executor.execute<Record<string, unknown>>(sql`
    SELECT id, file_name, status, processed_rows, rejected_rows, created_at
    FROM siigo_import_runs
    WHERE report_format = 'VENCIMIENTOS'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  return (rows as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    fileName: (row.file_name as string | null) ?? null,
    status: String(row.status),
    processedRows: Number(row.processed_rows ?? 0),
    rejectedRows: Number(row.rejected_rows ?? 0),
    createdAt: row.created_at as Date,
  }));
}

// ============================================================
// IMPORTACIÓN (preparada)
// ============================================================

/** Fila normalizada que producirá el lector del archivo de vencimientos. */
export interface NormalizedVencimientoRow {
  productCode: string;
  productName?: string | null;
  lotCode?: string | null;
  siigoBodegaCode?: number | null;
  locationCode?: number | null;
  quantity?: number | null;
  unit?: string | null;
  /** Fecha 'YYYY-MM-DD'. */
  expirationDate: string;
}

export interface VencimientoImportResult {
  runId: string;
  accepted: number;
  rejected: number;
  issues: { rowNumber: number; reason: string }[];
}

/**
 * Importa filas normalizadas de vencimientos.
 *
 * El endpoint existe y funciona; lo que falta es el LECTOR del archivo real,
 * que se escribirá cuando el Banco lo entregue (su estructura es
 * desconocida y no se debe suponer). Las filas se validan y se guardan con
 * identificadores confiables (código de Siigo + código de lote + bodega +
 * ubicación), nunca por nombre.
 */
export async function importVencimientos(
  rows: NormalizedVencimientoRow[],
  options: { fileName?: string | null; userId?: string | null }
): Promise<VencimientoImportResult> {
  const issues: { rowNumber: number; reason: string }[] = [];
  const valid: NormalizedVencimientoRow[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row.productCode || row.productCode.trim() === "") {
      issues.push({ rowNumber, reason: "Sin código de producto" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expirationDate ?? "")) {
      issues.push({ rowNumber, reason: "Fecha de vencimiento inválida" });
      return;
    }
    const date = new Date(`${row.expirationDate}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      issues.push({ rowNumber, reason: "Fecha de vencimiento inválida" });
      return;
    }
    valid.push(row);
  });

  if (valid.length === 0) {
    return { runId: "", accepted: 0, rejected: issues.length, issues };
  }

  return withTransaction(async (tx) => {
    const [run] = await tx.execute<{ id: string }>(sql`
      INSERT INTO siigo_import_runs (
        file_sha256, file_name, source, status, report_format, period_nature,
        total_rows, data_rows, processed_rows, rejected_rows,
        started_at, finished_at, created_by
      )
      VALUES (
        ${`vencimientos-${Date.now()}`},
        ${options.fileName ?? "vencimientos.xlsx"},
        'MANUAL',
        'COMPLETED',
        'VENCIMIENTOS',
        'FECHAS_DE_VENCIMIENTO',
        ${rows.length},
        ${valid.length},
        ${valid.length},
        ${issues.length},
        now(),
        now(),
        ${options.userId ?? null}
      )
      RETURNING id
    `);

    const runId = String((run as unknown as { id: string }).id);

    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      const values = sql.join(
        chunk.map(
          (row) => sql`(
            ${row.productCode.trim()}::text,
            ${row.productName ?? null}::text,
            ${row.lotCode ?? null}::text,
            ${row.siigoBodegaCode ?? null}::int,
            ${row.locationCode ?? null}::int,
            ${row.quantity ?? null}::numeric,
            ${row.unit ?? null}::text,
            ${row.expirationDate}::date,
            ${runId}::uuid
          )`
        ),
        sql`, `
      );

      await tx.execute(sql`
        INSERT INTO vencimiento_lotes (
          product_code, product_name, lot_code,
          siigo_bodega_code, location_code, quantity, unit,
          expiration_date, import_run_id, synced_at
        )
        SELECT v.code, v.name, v.lot, v.bod, v.ubi, v.qty, v.unit,
               v.exp::date, v.run, now()
        FROM (VALUES ${values}) AS v(code, name, lot, bod, ubi, qty, unit, exp, run)
        ON CONFLICT (product_code, (coalesce(lot_code, '')), (coalesce(siigo_bodega_code, -1)), (coalesce(location_code, -1)))
        DO UPDATE SET
          product_name = COALESCE(excluded.product_name, vencimiento_lotes.product_name),
          quantity = COALESCE(excluded.quantity, vencimiento_lotes.quantity),
          unit = COALESCE(excluded.unit, vencimiento_lotes.unit),
          expiration_date = excluded.expiration_date,
          import_run_id = excluded.import_run_id,
          synced_at = now()
      `);
    }

    // Se asocian los lotes con el catálogo por CÓDIGO (nunca por nombre).
    await tx.execute(sql`
      UPDATE vencimiento_lotes v
      SET product_id = p.id
      FROM products p
      WHERE p.code = v.product_code AND v.product_id IS NULL
    `);

    return {
      runId,
      accepted: valid.length,
      rejected: issues.length,
      issues,
    };
  });
}
