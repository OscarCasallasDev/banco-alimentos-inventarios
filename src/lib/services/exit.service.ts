/**
 * Servicio de Salidas de Almacén.
 *
 * Es el módulo central de la nueva operación: el almacenista prepara una
 * entrega, el sistema genera un documento verificable y la persona de despacho
 * lo usa para continuar el proceso en Siigo Pyme.
 *
 * REGLAS
 *
 *  - La salida es un REGISTRO OPERATIVO. No genera facturas, recibos ni
 *    documentos contables de Siigo.
 *  - La salida NO descuenta existencias: reserva cantidades comprometidas
 *    sobre el saldo informado por Siigo (ver `reservation.service.ts`).
 *  - El detalle guarda una FOTO de los datos (nombre, presentación, peso
 *    unitario) para que la reimpresión del documento histórico reproduzca
 *    exactamente lo que se registró al crearla.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTransaction, type DbExecutor } from "@/lib/db/client";import {
  programs,
  salidas,
  salidaItems,
  siigoBalances,
  siigoReservations,
} from "@/lib/db/schema";
import {
  businessRuleError,
  conflictError,
  insufficientStockError,
  notFoundError,
} from "@/lib/utils/errors";
import { nextSalidaDocumentCode } from "@/lib/services/sequence.service";
import { createDocument } from "@/lib/services/document.service";
import { calculateTotalWeightKg } from "@/lib/siigo/import/weight";
import { round3 } from "@/lib/siigo/import/parser";
import { createReservation, releaseReservations } from "@/lib/services/reservation.service";
import { groupKeyForProduct } from "@/lib/services/stock.service";

// ============================================================
// TIPOS
// ============================================================

export interface SalidaItemInput {
  productId: string;
  /** Bodega de SALIDA de esta l?nea (debe tener existencia del producto). */
  siigoBodegaCode: number;
  /** Ubicaci?n de origen (0 = consolidado / cualquiera). */
  locationCode?: number;
  quantity: number;
  /** Unidad de control del producto. */
  unit?: string | null;
  /** Peso registrado por el almacenista. */
  weight?: number | null;
  /** Unidad del peso: kg, g, ml, l. */
  weightUnit?: string | null;
  /** Fecha de vencimiento del producto en esta l?nea. */
  expirationDate?: string | null;
  notes?: string | null;
}

export interface CreateSalidaInput {
  /** Programa del cat?logo. Puede ser nulo si se usa un programa propio. */
  programId?: string | null;
  /** Nombre del programa escrito por el usuario ("Otro programa"). */
  customProgramName?: string | null;
  /** Destino (parroquia / grupo de familia) del cat?logo configurable. */
  destinationId?: string | null;
  warehouseId?: string | null;
  siigoBodegaCode?: number | null;
  locationCode?: number | null;
  date?: string;
  time?: string;
  /** Nombre del almacenista que ENTREGA (lo escribe al crear la orden). */
  delivererName?: string | null;
  /** Documento del almacenista que entrega. */
  delivererDocument?: string | null;
  notes?: string | null;
  items: SalidaItemInput[];
}

export interface SalidaListFilters {
  status?: string;
  programId?: string;
  search?: string;
  userId?: string;
  page: number;
  pageSize: number;
}

export interface SalidaDetail {
  id: string;
  number: string;
  date: string;
  time: string;
  status: string;
  reconciliationStatus: string;
  reconciliationNote: string | null;
  notes: string | null;
  /** Almacenista que entrega (registrado al crear la orden). */
  delivererName: string | null;
  delivererDocument: string | null;
  /** Quien recibe en despacho (se registra al confirmar la recepción). */
  receiverName: string | null;
  receiverDocument: string | null;
  receiverTime: string | null;
  /** Momento en que se confirmó la recepción (null si aún no se ha recibido). */
  receiverSignedAt: Date | null;
  siigoDocumentRef: string | null;
  totalQuantity: number;
  totalWeightKg: number | null;
  weightPartial: boolean;
  itemCount: number;
  programId: string | null;
  programName: string;
  programCode: string | null;
  /** Programa escrito por el usuario (opci?n ?Otro programa?). */
  customProgramName: string | null;
  /** Bodega de cada l?nea de la orden. */
  deletedAt: Date | null;
  destinationId: string | null;
  destinationName: string | null;
  destinationType: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  siigoBodegaCode: number | null;
  locationCode: number | null;
  userId: string;
  userName: string;
  createdAt: Date;
  documentGeneratedAt: Date | null;
  deliveredAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  items: SalidaItemDetail[];
}

export interface SalidaItemDetail {
  id: string;
  lineNo: number;
  productId: string;
  productCode: string;
  productName: string;
  productReference: string | null;
  unitCode: string | null;
  presentation: string | null;
  /** Descripción consolidada con la que se registró la línea. */
  consolidatedDescription: string | null;
  /** Códigos de Siigo del grupo consolidado (foto histórica). */
  consolidatedCodes: string[] | null;
  /** Bodega de salida de ESTA línea. */
  warehouseId: string | null;
  warehouseName: string | null;
  siigoBodegaCode: number;
  locationCode: number;
  quantity: number;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  weightKnown: boolean;
  /** Peso registrado por el almacenista. */
  weight: number | null;
  weightUnit: string | null;
  /** Fecha de vencimiento registrada en la l?nea. */
  expirationDate: string | null;
  availableAtCreation: number;
  notes: string | null;
}

// ============================================================
// UTILIDADES
// ============================================================

/** Fecha local en formato 'YYYY-MM-DD'. */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Hora local en formato 'HH:MM'. */
export function nowTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(11, 16);
}

// ============================================================
// CONSULTA DE EXISTENCIAS Y DISPONIBILIDAD
// ============================================================

export interface AvailabilityItem {
  productId: string;
  productCode: string;
  productName: string;
  productReference: string | null;
  brand: string | null;
  unit: string;
  presentation: string | null;
  description: string | null;
  siigoBodegaCode: number;
  locationCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  /** Existencia informada por Siigo. */
  siigoQuantity: number;
  /** Cantidad comprometida en salidas pendientes. */
  reservedQuantity: number;
  /** Disponibilidad operativa. */
  availableQuantity: number;
  unitWeightKg: number | null;
  weightKnown: boolean;
  isNegative: boolean;
  reviewRequired: boolean;
  /** true si esta existencia no venía en la última importación de Siigo. */
  notInLastImport: boolean;
  lastSyncedAt: Date | null;
}

/**
 * Consulta las existencias con su disponibilidad operativa.
 * Nunca mezcla bodegas: el resultado viene desagregado por bodega y
 * ubicación, y el consolidado es una consulta aparte.
 */
export async function listAvailability(options: {
  search?: string;
  siigoBodegaCode?: number;
  warehouseId?: string;
  productId?: string;
  onlyWithStock?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ items: AvailabilityItem[]; total: number }> {
  const db = getDb();
  const conditions = [sql`sb.is_active`];

  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    // El c?digo de Siigo se puede escribir con o sin guiones
    // ("001-0001-000001" o "0010001000001"): se buscan ambas formas.
    const compact = term.replace(/-/g, "");
    conditions.push(sql`
      (lower(p.name) LIKE ${term} OR lower(p.code) LIKE ${term}
       OR lower(COALESCE(p.siigo_reference, '')) LIKE ${term}
       OR lower(replace(p.code, '-', '')) LIKE ${compact})
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

  const where = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      sb.product_id, p.code AS product_code, p.name AS product_name,
      p.siigo_reference, p.siigo_brand, p.unit, p.presentation, p.description,
      p.net_weight_grams,
      sb.siigo_bodega_code, sb.location_code, sb.warehouse_id,
      w.name AS warehouse_name,
      sb.quantity, sb.is_negative, sb.review_required, sb.synced_at,
      (sb.import_run_id IS DISTINCT FROM lr.last_run_id) AS not_in_last_import,
      COALESCE(r.reserved, 0) AS reserved
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
    LEFT JOIN LATERAL (
      SELECT id AS last_run_id
      FROM siigo_import_runs
      WHERE status = 'COMPLETED'
      ORDER BY finished_at DESC
      LIMIT 1
    ) lr ON true
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

  const list = (rows as unknown as Record<string, unknown>[]) ?? [];

  return {
    items: list.map((row) => {
      const quantity = Number(row.quantity ?? 0);
      const reserved = Number(row.reserved ?? 0);
      const unitGrams =
        row.net_weight_grams === null || row.net_weight_grams === undefined
          ? null
          : Number(row.net_weight_grams);
      return {
        productId: String(row.product_id),
        productCode: String(row.product_code),
        productName: String(row.product_name),
        productReference: (row.siigo_reference as string | null) ?? null,
        brand: (row.siigo_brand as string | null) ?? null,
        unit: String(row.unit ?? ""),
        presentation: (row.presentation as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        siigoBodegaCode: Number(row.siigo_bodega_code),
        locationCode: Number(row.location_code),
        warehouseId: (row.warehouse_id as string | null) ?? null,
        warehouseName: (row.warehouse_name as string | null) ?? null,
        siigoQuantity: quantity,
        reservedQuantity: reserved,
        availableQuantity: round3(quantity - reserved),
        unitWeightKg: unitGrams === null ? null : round3(unitGrams / 1000),
        weightKnown: unitGrams !== null && unitGrams > 0,
        isNegative: Boolean(row.is_negative),
        reviewRequired: Boolean(row.review_required),
        notInLastImport: Boolean(row.not_in_last_import),
        lastSyncedAt: (row.synced_at as Date | null) ?? null,
      };
    }),
    total: Number((countRow as unknown as { count: number }[])[0]?.count ?? 0),
  };
}

// ============================================================
// CREACIÓN DE LA SALIDA
// ============================================================

/**
 * Crea una salida en estado DRAFT con sus líneas.
 *
 * La validación de existencias se hace dentro de la transacción, con un
 * bloqueo por producto y bodega para que dos salidas concurrentes no puedan
 * comprometer más de lo disponible.
 */
export async function createSalida(
  input: CreateSalidaInput,
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    cedula: string | null;
  }
): Promise<SalidaDetail> {
  const db = getDb();

  if (input.items.length === 0) {
    throw businessRuleError("La salida debe tener al menos un producto.");
  }

  // La identificación del almacenista sale SIEMPRE de la sesión autenticada.
  const delivererName = `${actor.firstName} ${actor.lastName}`
    .replace(/\s+/g, " ")
    .trim();
  const delivererDocument = (actor.cedula ?? "").trim();

  if (!delivererName) {
    throw businessRuleError(
      "El perfil del usuario no tiene nombre completo. Actualícelo antes de crear la orden."
    );
  }
  if (!delivererDocument) {
    throw businessRuleError(
      "Debe completar su cédula en Configuración antes de crear una orden de pedido."
    );
  }

  // Programa del catálogo o programa propio ("Otro programa").
  const programId = input.programId ?? null;
  const customProgramName = (input.customProgramName ?? "").trim() || null;

  if (!programId && !customProgramName) {
    throw businessRuleError(
      "Seleccione un programa o indique el nombre del programa."
    );
  }

  if (programId) {
    const [program] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);
    if (!program) throw notFoundError("Programa");
    if (program.status !== "ACTIVE") {
      throw businessRuleError(`El programa "${program.name}" no está activo.`);
    }
  }

  return withTransaction(async (tx) => {
    // Bloqueo por producto/bodega para serializar salidas concurrentes.
    const keys = [
      ...new Set(
        input.items.map(
          (item) => `${item.productId}:${item.siigoBodegaCode}:${item.locationCode}`
        )
      ),
    ].sort();
    for (const key of keys) {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
      `);
    }

    const [created] = await tx
      .insert(salidas)
      .values({
        number: `BORRADOR-${Date.now()}`,
        date: input.date ?? todayIso(),
        time: input.time ?? nowTime(),
        programId,
        customProgramName,
        destinationId: input.destinationId ?? null,
        // La bodega general qued? vac?a: cada producto define la suya.
        warehouseId: null,
        siigoBodegaCode: null,
        locationCode: null,
        userId: actor.id,
        // Copia histórica: si el perfil cambia después, la orden conserva
        // estos valores.
        delivererName,
        delivererDocument,
        status: "DRAFT",
        notes: input.notes ?? null,
      })
      .returning();

    const salidaId = created.id;

    let lineNo = 0;
    let totalQuantity = 0;
    let totalWeight = 0;
    let weightPartial = false;
    let anyWeight = false;

    for (const item of input.items) {
      lineNo++;

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw businessRuleError(
          `La cantidad del producto ${item.productId} debe ser mayor que cero.`
        );
      }

      const availability = await resolveAvailability(tx, item);
      if (!availability) {
        throw notFoundError(
          `Existencia del producto ${item.productId} en la bodega ${item.siigoBodegaCode}`
        );
      }

      // Solo se pueden agregar productos con disponibilidad > 0.
      if (availability.availableQuantity <= 0) {
        throw insufficientStockError(
          `Este producto no tiene unidades disponibles para agregar a la orden de pedido (${availability.productName}).`
        );
      }

      if (item.quantity > availability.availableQuantity + 0.0005) {
        throw insufficientStockError(
          `La cantidad solicitada supera las unidades disponibles de ${availability.productName} ` +
            `en la bodega ${availability.warehouseName ?? item.siigoBodegaCode}: ` +
            `disponible ${availability.availableQuantity} (existencia ${availability.siigoQuantity} ? comprometido ${availability.reservedQuantity}); ` +
            `solicitado ${item.quantity}.`
        );
      }

      const unitGrams =
        availability.unitWeightKg === null ? null : availability.unitWeightKg * 1000;
      const totalWeightKg = calculateTotalWeightKg(item.quantity, unitGrams);

      await tx.insert(salidaItems).values({
        salidaId,
        lineNo,
        productId: item.productId,
        // La bodega es de la L?NEA: cada producto sale de la bodega que
        // se eligi? para ?l.
        warehouseId: availability.warehouseId,
        siigoBodegaCode: item.siigoBodegaCode,
        locationCode: item.locationCode ?? 0,
        quantity: item.quantity,
        unitCode: availability.unit,
        presentation: availability.presentation,
        productName: availability.productName,
        productReference: availability.productCode,
        consolidatedDescription: availability.productName,
        consolidatedCodes: [availability.productCode],
        unitWeightKg: availability.unitWeightKg,
        totalWeightKg,
        weightKnown: totalWeightKg !== null,
        weight: item.weight ?? null,
        weightUnit: item.weightUnit ?? null,
        expirationDate: item.expirationDate ?? null,
        availableAtCreation: availability.availableQuantity,
        notes: item.notes ?? null,
      });

      totalQuantity = round3(totalQuantity + item.quantity);
      if (totalWeightKg !== null) {
        totalWeight = round3(totalWeight + totalWeightKg);
        anyWeight = true;
      } else {
        weightPartial = true;
      }
    }

    const [updated] = await tx
      .update(salidas)
      .set({
        totalQuantity,
        totalWeightKg: anyWeight ? totalWeight : null,
        weightPartial,
        itemCount: lineNo,
        updatedAt: new Date(),
      })
      .where(eq(salidas.id, salidaId))
      .returning();

    return getSalida(tx, updated.id);
  });
}

/** Resuelve la disponibilidad de una línea contra el saldo y las reservas. */
async function resolveAvailability(
  executor: DbExecutor,
  item: SalidaItemInput
): Promise<{
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  presentation: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  siigoQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitWeightKg: number | null;
} | null> {
  // La disponibilidad se valida sobre el GRUPO CONSOLIDADO
  // (descripci?n exacta + bodega).
  //
  // Las existencias de la misma descripci?n en la misma bodega se suman
  // (es el mismo producto repartido en varias ubicaciones), pero NUNCA se
  // mezclan con las de otras bodegas: la cantidad que se puede despachar
  // se contrasta contra este grupo en ESTA bodega.
  const rows = await executor.execute<Record<string, unknown>>(sql`
    SELECT
      v.representative_product_id AS product_id,
      v.warehouse_id,
      v.warehouse_name,
      v.description AS product_name,
      v.unit,
      v.representative_code AS product_code,
      v.product_codes,
      v.quantity,
      v.reserved,
      (v.quantity - v.reserved) AS available,
      p.presentation,
      p.net_weight_grams
    FROM v_stock_consolidated v
    LEFT JOIN products p ON p.id = v.representative_product_id
    WHERE v.siigo_bodega_code = ${item.siigoBodegaCode}
      AND EXISTS (
        SELECT 1 FROM unnest(v.product_codes) AS c(code)
        JOIN products p2 ON p2.code = c.code
        WHERE p2.id = ${item.productId}::uuid
      )
    LIMIT 1
  `);

  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) return null;

  const quantity = Number(row.quantity ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const available = Number(row.available ?? quantity - reserved);
  const unitGrams =
    row.net_weight_grams === null || row.net_weight_grams === undefined
      ? null
      : Number(row.net_weight_grams);

  return {
    productId: String(row.product_id ?? ""),
    productCode: String(row.product_code ?? ""),
    productName: String(row.product_name ?? ""),
    unit: String(row.unit ?? ""),
    presentation: (row.presentation as string | null) ?? null,
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    siigoQuantity: quantity,
    reservedQuantity: reserved,
    availableQuantity: round3(available),
    unitWeightKg: unitGrams === null ? null : round3(unitGrams / 1000),
  };
}

// ============================================================
// TRANSICIONES DE ESTADO
// ============================================================

/**
 * Genera el documento: asigna el número único, toma la foto de los datos y
 * activa las reservas.
 *
 * Es idempotente: si la salida ya está generada, devuelve el detalle sin
 * volver a numerar (protección contra doble clic).
 */
export async function generateSalida(
  salidaId: string,
  userId: string
): Promise<SalidaDetail> {
  return withTransaction(async (tx) => {
    const [salida] = await tx
      .select()
      .from(salidas)
      .where(eq(salidas.id, salidaId))
      .limit(1);

    if (!salida) throw notFoundError("Salida");

    if (salida.status !== "DRAFT") {
      if (salida.status === "CANCELLED") {
        throw conflictError("La salida está anulada y no se puede generar.");
      }
      // Ya generada: se devuelve tal cual (sin renumerar).
      return getSalida(tx, salidaId);
    }

    const items = await tx
      .select()
      .from(salidaItems)
      .where(eq(salidaItems.salidaId, salidaId));

    if (items.length === 0) {
      throw businessRuleError("La salida no tiene productos.");
    }

    // Número único e irrepetible.
    const date = new Date(`${salida.date}T12:00:00`);
    const number = await nextSalidaDocumentCode(tx, Number.isNaN(date.getTime()) ? new Date() : date);

    // Re-validación de existencias en el momento de generar (por si cambió
    // el inventario entre el borrador y la confirmación).
    for (const item of items) {
      const availability = await resolveAvailability(tx, {
        productId: item.productId,
        siigoBodegaCode: item.siigoBodegaCode,
        locationCode: item.locationCode ?? 0,
        quantity: Number(item.quantity),
      });
      if (!availability) {
        throw notFoundError(
          `Existencia del producto ${item.productId} en la bodega ${item.siigoBodegaCode}`
        );
      }
      if (Number(item.quantity) > availability.availableQuantity + 0.0005) {
        throw insufficientStockError(
          `Existencia insuficiente para ${availability.productCode} (${availability.productName}). ` +
            `Disponible: ${availability.availableQuantity}; solicitado: ${item.quantity}.`
        );
      }
    }

    // Se activa la reserva por cada línea, identificada con la clave del
    // grupo consolidado para que la conciliación con Siigo la encuentre
    // aunque el descuento aparezca en otra ubicación o en otro código de la
    // misma descripción.
    for (const item of items) {
      const groupKey = await groupKeyForProduct(
        item.productId,
        item.siigoBodegaCode,
        tx
      );
      await createReservation(tx, {
        salidaId,
        salidaItemId: item.id,
        productId: item.productId,
        siigoBodegaCode: item.siigoBodegaCode,
        locationCode: item.locationCode ?? 0,
        quantity: Number(item.quantity),
        groupKey,
      });
    }

    const [updated] = await tx
      .update(salidas)
      .set({
        number,
        status: "GENERATED",
        documentGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salidas.id, salidaId))
      .returning();

    await createDocument(tx, {
      type: "EXIT",
      number,
      relatedId: salidaId,
      generatedBy: userId,
    });

    return getSalida(tx, updated.id);
  });
}

/** Registra la recepción por parte de despacho. */
export async function deliverSalida(
  salidaId: string,
  receiverName?: string | null,
  receiverDocument?: string | null
): Promise<SalidaDetail> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.status === "DRAFT") {
    throw conflictError(
      "La salida aún no tiene documento generado. Genere el documento antes de registrarla como entregada."
    );
  }
  if (salida.status === "CANCELLED") {
    throw conflictError("La salida está anulada.");
  }
  if (salida.status === "DELIVERED" || salida.status === "CONFIRMED_SIIGO") {
    return getSalida(db, salidaId);
  }

  const [updated] = await db
    .update(salidas)
    .set({
      status: "DELIVERED",
      deliveredAt: new Date(),
      receiverName: receiverName ?? salida.receiverName,
      receiverDocument: receiverDocument ?? salida.receiverDocument,
      // La hora de recepci?n la pone el sistema. Si ya hab?a una, se
      // conserva: es un dato hist?rico y no se reescribe.
      receiverTime: salida.receiverTime ?? nowTime(),
      receiverSignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(salidas.id, salidaId))
    .returning();

  return getSalida(db, updated.id);
}

/**
 * Registra la confirmación en Siigo Pyme.
 *
 * IMPORTANTE: la reserva NO se libera aquí. Se libera cuando una
 * importación demuestra que Siigo ya reflejó el descuento. Así se evita
 * descontar dos veces.
 */
export async function confirmInSiigo(
  salidaId: string,
  siigoDocumentRef?: string | null
): Promise<SalidaDetail> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.status === "DRAFT") {
    throw conflictError(
      "La salida debe tener documento generado antes de confirmarse en Siigo."
    );
  }
  if (salida.status === "CANCELLED") {
    throw conflictError("La salida está anulada.");
  }
  if (salida.status === "CONFIRMED_SIIGO") {
    return getSalida(db, salidaId);
  }

  const [updated] = await db
    .update(salidas)
    .set({
      status: "CONFIRMED_SIIGO",
      confirmedAt: new Date(),
      siigoDocumentRef: siigoDocumentRef ?? null,
      reconciliationStatus: "PENDING",
      reconciliationNote:
        "Confirmada por despacho. La reserva se liberará cuando la próxima importación de Siigo refleje el descuento.",
      updatedAt: new Date(),
    })
    .where(eq(salidas.id, salidaId))
    .returning();

  return getSalida(db, updated.id);
}

/** Anula la salida y libera sus reservas. */
export async function cancelSalida(
  salidaId: string,
  reason: string
): Promise<SalidaDetail> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.status === "CANCELLED") return getSalida(db, salidaId);
  if (salida.status === "CONFIRMED_SIIGO") {
    throw conflictError(
      "Una salida ya confirmada en Siigo no se puede anular desde el sistema."
    );
  }

  await withTransaction(async (tx) => {
    await releaseReservations(tx, salidaId, `Anulada: ${reason}`);
    await tx
      .update(salidas)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salidas.id, salidaId));
  });

  return getSalida(db, salidaId);
}

/** Actualiza una salida en estado DRAFT. */
export async function updateSalidaDraft(
  salidaId: string,
  input: Partial<CreateSalidaInput>
): Promise<SalidaDetail> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.status !== "DRAFT" && salida.status !== "GENERATED") {
    throw conflictError(
      "Solo se pueden editar órdenes en borrador o generadas antes de la recepción."
    );
  }

  await withTransaction(async (tx) => {
    /** Líneas nuevas cuya reserva debe recrearse si la orden ya está generada. */
    const nuevasLineas: { id: string; item: SalidaItemInput }[] = [];

    if (input.items) {
      await tx.delete(salidaItems).where(eq(salidaItems.salidaId, salidaId));

      let lineNo = 0;
      let totalQuantity = 0;
      let totalWeight = 0;
      let weightPartial = false;
      let anyWeight = false;

      for (const item of input.items) {
        lineNo++;
        const availability = await resolveAvailability(tx, item);
        if (!availability) {
          throw notFoundError(
            `Existencia del producto ${item.productId} en la bodega ${item.siigoBodegaCode}`
          );
        }
        if (availability.availableQuantity <= 0) {
          throw insufficientStockError(
            `Este producto no tiene unidades disponibles para agregar a la orden de pedido (${availability.productName}).`
          );
        }
        if (item.quantity > availability.availableQuantity + 0.0005) {
          throw insufficientStockError(
            `La cantidad solicitada supera las unidades disponibles de ${availability.productName} ` +
              `en la bodega ${availability.warehouseName ?? item.siigoBodegaCode}: ` +
              `disponible ${availability.availableQuantity}; solicitado ${item.quantity}.`
          );
        }

        const unitGrams =
          availability.unitWeightKg === null ? null : availability.unitWeightKg * 1000;
        const totalWeightKg = calculateTotalWeightKg(item.quantity, unitGrams);

        const [inserted] = await tx
          .insert(salidaItems)
          .values({
            salidaId,
            lineNo,
            productId: item.productId,
            warehouseId: availability.warehouseId,
            siigoBodegaCode: item.siigoBodegaCode,
            locationCode: item.locationCode ?? 0,
            quantity: item.quantity,
            unitCode: availability.unit,
            presentation: availability.presentation,
            productName: availability.productName,
            productReference: availability.productCode,
            consolidatedDescription: availability.productName,
            consolidatedCodes: [availability.productCode],
            unitWeightKg: availability.unitWeightKg,
            totalWeightKg,
            weightKnown: totalWeightKg !== null,
            weight: item.weight ?? null,
            weightUnit: item.weightUnit ?? null,
            expirationDate: item.expirationDate ?? null,
            availableAtCreation: availability.availableQuantity,
            notes: item.notes ?? null,
          })
          .returning({ id: salidaItems.id });

        nuevasLineas.push({ id: inserted.id, item });

        totalQuantity = round3(totalQuantity + item.quantity);
        if (totalWeightKg !== null) {
          totalWeight = round3(totalWeight + totalWeightKg);
          anyWeight = true;
        } else {
          weightPartial = true;
        }
      }

      await tx
        .update(salidas)
        .set({
          totalQuantity,
          totalWeightKg: anyWeight ? totalWeight : null,
          weightPartial,
          itemCount: lineNo,
          updatedAt: new Date(),
        })
        .where(eq(salidas.id, salidaId));

      // Una orden ya generada mantiene sus reservas: al cambiar las líneas
      // se recrean para que la disponibilidad siga siendo correcta.
      if (salida.status === "GENERATED") {
        for (const linea of nuevasLineas) {
          const groupKey = await groupKeyForProduct(
            linea.item.productId,
            linea.item.siigoBodegaCode,
            tx
          );
          await createReservation(tx, {
            salidaId,
            salidaItemId: linea.id,
            productId: linea.item.productId,
            siigoBodegaCode: linea.item.siigoBodegaCode,
            locationCode: linea.item.locationCode ?? 0,
            quantity: linea.item.quantity,
            groupKey,
          });
        }
      }
    }

    await tx
      .update(salidas)
      .set({
        programId: input.programId ?? salida.programId,
        destinationId:
          input.destinationId === undefined
            ? salida.destinationId
            : input.destinationId,
        warehouseId:
          input.warehouseId === undefined ? salida.warehouseId : input.warehouseId,
        siigoBodegaCode:
          input.siigoBodegaCode === undefined
            ? salida.siigoBodegaCode
            : input.siigoBodegaCode,
        locationCode:
          input.locationCode === undefined ? salida.locationCode : input.locationCode,
        // La identificación del creador es histórica: la edición de la orden
        // nunca la sobrescribe.
        notes: input.notes === undefined ? salida.notes : input.notes,
        updatedAt: new Date(),
      })
      .where(eq(salidas.id, salidaId));
  });

  return getSalida(db, salidaId);
}

// ============================================================
// CONSULTAS
// ============================================================

/** Detalle completo de una salida. */
export async function getSalida(
  executor: DbExecutor,
  salidaId: string
): Promise<SalidaDetail> {
  const rows = await executor.execute<Record<string, unknown>>(sql`
    SELECT
      s.id, s.number, s.date, s.time, s.status, s.reconciliation_status,
      s.reconciliation_note, s.notes,
      s.deliverer_name, s.deliverer_document,
      s.receiver_name, s.receiver_document, s.receiver_time,
      s.receiver_signed_at,
      s.siigo_document_ref, s.total_quantity, s.total_weight_kg, s.weight_partial,
      s.item_count, s.program_id, s.custom_program_name,
      s.warehouse_id, s.siigo_bodega_code, s.location_code,
      s.user_id, s.created_at, s.document_generated_at, s.delivered_at, s.confirmed_at,
      s.cancelled_at, s.deleted_at,
      p.name AS program_name, p.code AS program_code,
      d.id AS destination_id, d.name AS destination_name, d.type AS destination_type,
      w.name AS warehouse_name,
      u.first_name || ' ' || u.last_name AS user_name
    FROM salidas s
    LEFT JOIN programs p ON p.id = s.program_id
    LEFT JOIN destinations d ON d.id = s.destination_id
    LEFT JOIN warehouses w ON w.id = s.warehouse_id
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${salidaId}::uuid
    LIMIT 1
  `);

  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) throw notFoundError("Salida");

  const itemRows = await executor.execute<Record<string, unknown>>(sql`
    SELECT
      si.id, si.line_no, si.product_id, si.siigo_bodega_code, si.location_code,
      si.quantity, si.unit_code, si.presentation, si.product_name, si.product_reference,
      si.unit_weight_kg, si.total_weight_kg, si.weight_known,
      si.weight, si.weight_unit, si.expiration_date,
      si.consolidated_description, si.consolidated_codes,
      si.available_at_creation, si.notes,
      si.warehouse_id,
      p.code AS product_code,
      w.name AS warehouse_name
    FROM salida_items si
    JOIN products p ON p.id = si.product_id
    LEFT JOIN warehouses w ON w.id = si.warehouse_id
    WHERE si.salida_id = ${salidaId}::uuid
    ORDER BY si.line_no
  `);

  return {
    id: String(row.id),
    number: String(row.number),
    date: String(row.date),
    time: String(row.time),
    status: String(row.status),
    reconciliationStatus: String(row.reconciliation_status),
    reconciliationNote: (row.reconciliation_note as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    delivererName: (row.deliverer_name as string | null) ?? null,
    delivererDocument: (row.deliverer_document as string | null) ?? null,
    receiverName: (row.receiver_name as string | null) ?? null,
    receiverDocument: (row.receiver_document as string | null) ?? null,
    receiverTime: (row.receiver_time as string | null) ?? null,
    receiverSignedAt: (row.receiver_signed_at as Date | null) ?? null,
    siigoDocumentRef: (row.siigo_document_ref as string | null) ?? null,
    totalQuantity: Number(row.total_quantity ?? 0),
    totalWeightKg:
      row.total_weight_kg === null || row.total_weight_kg === undefined
        ? null
        : Number(row.total_weight_kg),
    weightPartial: Boolean(row.weight_partial),
    itemCount: Number(row.item_count ?? 0),
    programId: row.program_id === null || row.program_id === undefined ? null : String(row.program_id),
    programName: (row.custom_program_name as string | null) ?? String(row.program_name ?? ""),
    programCode: (row.program_code as string | null) ?? null,
    customProgramName: (row.custom_program_name as string | null) ?? null,
    deletedAt: row.deleted_at ? (row.deleted_at as Date) : null,
    destinationId: (row.destination_id as string | null) ?? null,
    destinationName: (row.destination_name as string | null) ?? null,
    destinationType: (row.destination_type as string | null) ?? null,
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    siigoBodegaCode:
      row.siigo_bodega_code === null || row.siigo_bodega_code === undefined
        ? null
        : Number(row.siigo_bodega_code),
    locationCode:
      row.location_code === null || row.location_code === undefined
        ? null
        : Number(row.location_code),
    userId: String(row.user_id),
    userName: String(row.user_name),
    createdAt: row.created_at as Date,
    documentGeneratedAt: (row.document_generated_at as Date | null) ?? null,
    deliveredAt: (row.delivered_at as Date | null) ?? null,
    confirmedAt: (row.confirmed_at as Date | null) ?? null,
    cancelledAt: (row.cancelled_at as Date | null) ?? null,
    items: (itemRows as unknown as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      lineNo: Number(item.line_no),
      productId: String(item.product_id),
      productCode: String(item.product_code),
      productName: String(item.product_name ?? ""),
      productReference: (item.product_reference as string | null) ?? null,
      unitCode: (item.unit_code as string | null) ?? null,
      presentation: (item.presentation as string | null) ?? null,
      consolidatedDescription:
        (item.consolidated_description as string | null) ?? null,
      consolidatedCodes: (item.consolidated_codes as string[] | null) ?? null,
      weight: item.weight === null || item.weight === undefined ? null : Number(item.weight),
      weightUnit: (item.weight_unit as string | null) ?? null,
      expirationDate: (item.expiration_date as string | null) ?? null,
      warehouseId: (item.warehouse_id as string | null) ?? null,
      warehouseName: (item.warehouse_name as string | null) ?? null,
      siigoBodegaCode: Number(item.siigo_bodega_code),
      locationCode: Number(item.location_code),
      quantity: Number(item.quantity),
      unitWeightKg:
        item.unit_weight_kg === null || item.unit_weight_kg === undefined
          ? null
          : Number(item.unit_weight_kg),
      totalWeightKg:
        item.total_weight_kg === null || item.total_weight_kg === undefined
          ? null
          : Number(item.total_weight_kg),
      weightKnown: Boolean(item.weight_known),
      availableAtCreation: Number(item.available_at_creation ?? 0),
      notes: (item.notes as string | null) ?? null,
    })),
  };
}

/** Lista de salidas con filtros. */
export async function listSalidas(
  filters: SalidaListFilters
): Promise<{ items: SalidaDetail[]; total: number }> {
  const db = getDb();
  const conditions = [sql`s.deleted_at IS NULL`];

  if (filters.status) {
    // «Lista para imprimir» agrupa las recibidas actuales y las históricas
    // que antes se presentaban como confirmadas en Siigo.
    conditions.push(
      filters.status === "DELIVERED"
        ? sql`s.status IN ('DELIVERED', 'CONFIRMED_SIIGO')`
        : sql`s.status = ${filters.status}`
    );
  }
  if (filters.programId) {
    conditions.push(sql`s.program_id = ${filters.programId}::uuid`);
  }
  if (filters.userId) {
    conditions.push(sql`s.user_id = ${filters.userId}::uuid`);
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(sql`
      (lower(s.number) LIKE ${term} OR lower(COALESCE(s.receiver_name, '')) LIKE ${term})
    `);
  }

  const where = sql.join(conditions, sql` AND `);

  // Una sola consulta devuelve la cabecera de todas las ?rdenes de la p?gina
  // y, con una subconsulta agregada, el conteo de l?neas y los totales.
  // Antes se hac?a una consulta por cada orden (N+1) y tardaba segundos.
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH pagina AS (
      SELECT s.id, s.number, s.date, s.time, s.status, s.reconciliation_status,
             s.program_id, s.custom_program_name, s.destination_id, s.warehouse_id,
             s.siigo_bodega_code, s.location_code, s.deleted_at,
             s.user_id, s.created_at, s.document_generated_at, s.delivered_at,
             s.confirmed_at, s.cancelled_at, s.total_quantity, s.total_weight_kg,
             s.weight_partial, s.item_count, s.receiver_name, s.deliverer_name,
             s.notes, s.siigo_document_ref
      FROM salidas s
      WHERE ${where}
      ORDER BY s.created_at DESC
      LIMIT ${filters.pageSize} OFFSET ${filters.page * filters.pageSize}
    ),
    lineas AS (
      SELECT si.salida_id,
             COUNT(*)::int AS n,
             COALESCE(SUM(si.quantity), 0) AS unidades
      FROM salida_items si
      WHERE si.salida_id IN (SELECT id FROM pagina)
      GROUP BY si.salida_id
    )
    SELECT
      p.*, 
      pr.name AS program_name, pr.code AS program_code,
      d.id AS destination_id, d.name AS destination_name, d.type AS destination_type,
      w.name AS warehouse_name,
      u.first_name || ' ' || u.last_name AS user_name,
      COALESCE(l.n, p.item_count) AS line_count,
      COALESCE(l.unidades, p.total_quantity) AS line_units,
      (SELECT COUNT(*)::int FROM salidas s WHERE ${where}) AS total_registros
    FROM pagina p
    LEFT JOIN programs pr ON pr.id = p.program_id
    LEFT JOIN destinations d ON d.id = p.destination_id
    LEFT JOIN warehouses w ON w.id = p.warehouse_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN lineas l ON l.salida_id = p.id
    ORDER BY p.created_at DESC
  `);

  const list = (rows as unknown as Record<string, unknown>[]) ?? [];

  const items: SalidaDetail[] = list.map((row) => ({
    id: String(row.id),
    number: String(row.number),
    date: String(row.date),
    time: String(row.time),
    status: String(row.status),
    reconciliationStatus: String(row.reconciliation_status),
    reconciliationNote: null,
    notes: (row.notes as string | null) ?? null,
    delivererName: (row.deliverer_name as string | null) ?? null,
    delivererDocument: null,
    receiverName: (row.receiver_name as string | null) ?? null,
    receiverDocument: null,
    receiverTime: null,
    receiverSignedAt: null,
    siigoDocumentRef: (row.siigo_document_ref as string | null) ?? null,
    totalQuantity: Number(row.line_units ?? 0),
    totalWeightKg:
      row.total_weight_kg === null || row.total_weight_kg === undefined
        ? null
        : Number(row.total_weight_kg),
    weightPartial: Boolean(row.weight_partial),
    itemCount: Number(row.line_count ?? 0),
    programId: row.program_id === null || row.program_id === undefined ? null : String(row.program_id),
    programName: (row.custom_program_name as string | null) ?? String(row.program_name ?? ""),
    programCode: (row.program_code as string | null) ?? null,
    customProgramName: (row.custom_program_name as string | null) ?? null,
    deletedAt: row.deleted_at ? (row.deleted_at as Date) : null,
    destinationId: (row.destination_id as string | null) ?? null,
    destinationName: (row.destination_name as string | null) ?? null,
    destinationType: (row.destination_type as string | null) ?? null,
    warehouseId: (row.warehouse_id as string | null) ?? null,
    warehouseName: (row.warehouse_name as string | null) ?? null,
    siigoBodegaCode:
      row.siigo_bodega_code === null || row.siigo_bodega_code === undefined
        ? null
        : Number(row.siigo_bodega_code),
    locationCode:
      row.location_code === null || row.location_code === undefined
        ? null
        : Number(row.location_code),
    userId: String(row.user_id),
    userName: String(row.user_name),
    createdAt: row.created_at as Date,
    documentGeneratedAt: (row.document_generated_at as Date | null) ?? null,
    deliveredAt: (row.delivered_at as Date | null) ?? null,
    confirmedAt: (row.confirmed_at as Date | null) ?? null,
    cancelledAt: (row.cancelled_at as Date | null) ?? null,
    // El listado no necesita el detalle de las l?neas: se carga al abrir la
    // orden. As? la pantalla responde en una sola consulta.
    items: [],
  }));

  return {
    items,
    total: Number(list[0]?.total_registros ?? 0),
  };
}


/** Totales del tablero de salidas. */
export async function getSalidasSummary(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  todayCount: number;
  todayQuantity: number;
}> {
  const db = getDb();
  const rows = await db.execute<{
    total: number;
    draft: number;
    generated: number;
    delivered: number;
    today_count: number;
    today_quantity: string;
  }>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
      COUNT(*) FILTER (WHERE status = 'GENERATED')::int AS generated,
      COUNT(*) FILTER (
        WHERE receiver_name IS NOT NULL AND receiver_document IS NOT NULL
      )::int AS delivered,
      COUNT(*) FILTER (WHERE date = ${todayIso()})::int AS today_count,
      COALESCE(SUM(total_quantity) FILTER (WHERE date = ${todayIso()}), 0) AS today_quantity
    FROM salidas
  `);

  const row = (rows as unknown as Record<string, number | string>[])[0];

  return {
    total: Number(row?.total ?? 0),
    byStatus: {
      DRAFT: Number(row?.draft ?? 0),
      GENERATED: Number(row?.generated ?? 0),
      DELIVERED: Number(row?.delivered ?? 0),
    },
    todayCount: Number(row?.today_count ?? 0),
    todayQuantity: Number(row?.today_quantity ?? 0),
  };
}

/** Salidas recientes para el tablero. */
export async function listRecentSalidas(limit = 8): Promise<SalidaDetail[]> {
  const db = getDb();
  const rows = await db.execute<{ id: string }>(sql`
    SELECT id FROM salidas
    WHERE status <> 'CANCELLED'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
  return Promise.all(ids.map((id) => getSalida(db, id)));
}

export { salidas, salidaItems, siigoReservations, siigoBalances, and, desc };

/**
 * Elimina una salida de almacén.
 *
 * INTEGRIDAD HISTÓRICA
 *
 *   - Si la orden está CONFIRMADA_EN_SIIGO (ya se procesó en Siigo Pyme),
 *     NO se borra físicamente: se marca con `deleted_at` y se conservan
 *     todos sus datos, sus reservas y su historial para la auditoría.
 *   - Si la orden está en DRAFT o GENERATED (nunca llegó a Siigo), se
 *     elimina de forma definitiva: no dejó rastro operativo.
 *
 * En ambos casos se liberan las reservas para que las existencias
 * vuelvan a estar disponibles.
 */
export async function deleteSalida(
  salidaId: string,
  userId: string
): Promise<{ deleted: boolean; logical: boolean; message: string }> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.deletedAt) {
    return {
      deleted: true,
      logical: true,
      message: "La orden ya estaba eliminada.",
    };
  }

  // Una orden ya confirmada en Siigo Pyme no se borra físicamente: sus
  // movimientos ya existen en el sistema contable.
  const logical = salida.status === "CONFIRMED_SIIGO";

  if (logical) {
    await withTransaction(async (tx) => {
      await tx
        .update(salidas)
        .set({
          deletedAt: new Date(),
          deletedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(salidas.id, salidaId));
    });

    return {
      deleted: true,
      logical: true,
      message:
        "La orden se ocultó del listado (borrado lógico) porque ya está confirmada en Siigo Pyme. Su historial se conserva.",
    };
  }

  await withTransaction(async (tx) => {
    await releaseReservations(tx, salidaId, "Orden eliminada");
    await tx.delete(salidaItems).where(eq(salidaItems.salidaId, salidaId));
    await tx.delete(salidas).where(eq(salidas.id, salidaId));
  });

  return {
    deleted: true,
    logical: false,
    message: "La orden se eliminó definitivamente.",
  };
}

/**
 * Confirma la recepción en despacho.
 *
 * Registra quién recibe (nombre y cédula) y deja constancia de que la
 * firma quedó hecha sobre el documento impreso.
 *
 * La FECHA y la HORA las genera el sistema: no hay ningún campo editable
 * para escribirlas a mano. Si la recepción ya estaba confirmada, la fecha
 * y la hora originales se conservan porque son datos históricos.
 *
 * Si aún no hay recepción confirmada, la orden queda en estado
 * RECIBIDA_EN_DESPACHO con la fecha y la hora del sistema.
 */
export async function confirmReception(
  salidaId: string,
  receiverName?: string | null,
  receiverDocument?: string | null
): Promise<SalidaDetail> {
  const db = getDb();

  const [salida] = await db
    .select()
    .from(salidas)
    .where(eq(salidas.id, salidaId))
    .limit(1);

  if (!salida) throw notFoundError("Salida");
  if (salida.deletedAt) {
    throw conflictError("La orden está eliminada.");
  }
  if (salida.status === "CANCELLED") {
    throw conflictError("La orden está anulada.");
  }
  if (salida.status === "DRAFT") {
    throw conflictError(
      "La orden aún no tiene documento generado. Genere el documento antes de confirmar la recepción."
    );
  }

  const nombre = (receiverName ?? "").trim();
  const cedula = (receiverDocument ?? "").trim();

  if (!nombre) {
    throw businessRuleError(
      "Escriba el nombre de quien recibe la orden en despacho."
    );
  }
  if (!cedula) {
    throw businessRuleError(
      "Escriba la cédula de quien recibe la orden en despacho."
    );
  }

  const [updated] = await db
    .update(salidas)
    .set({
      receiverName: nombre,
      receiverDocument: cedula,
      // La hora de recepción la genera el sistema: el almacenista solo
      // escribe el nombre y la cédula. Si ya había una, se conserva
      // porque es un dato histórico y no se reescribe.
      receiverTime: salida.receiverTime ?? nowTime(),
      receiverSignedAt: salida.receiverSignedAt ?? new Date(),
      status: salida.status === "CONFIRMED_SIIGO" ? salida.status : "DELIVERED",
      deliveredAt: salida.deliveredAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(salidas.id, salidaId))
    .returning();

  return getSalida(db, updated.id);
}
