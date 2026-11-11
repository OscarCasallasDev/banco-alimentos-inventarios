/**
 * Servicio de lotes — Sistema de Gestión, Trazabilidad y Conciliación
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Responsabilidades:
 *   • Generar códigos de lote de forma atómica y concurrente.
 *   • Crear los lotes de una entrada (uno por lote informado, o uno
 *     automático por línea cuando el producto no exige trazabilidad).
 *   • Asignar lotes a una salida (FEFO o selección explícita), sin permitir
 *     el consumo de mercancía vencida.
 *   • Conciliar auditorías contra lotes sin inventar relaciones.
 *   • Consultar stock, vencimientos y lotes con paginación y filtros.
 *
 * La cantidad EXISTENTE de un lote vive en `lots.quantity_available`; la
 * cantidad RECIBIDA (`quantity_received`) es histórica e inmutable. El
 * agregado `inventory.quantity` es una caché que se actualiza en la misma
 * transacción que el movimiento.
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  dispatchItemLots,
  inventoryMovements,
  lotSequences,
  lots,
  products,
  warehouses,
  auditItemLots,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import {
  businessRuleError,
  insufficientStockError,
  notFoundError,
} from "@/lib/utils/errors";
import {
  addDaysIso,
  bankTodayIso,
  toIsoDate,
} from "@/lib/utils/dates";
import { getExpirationThresholds } from "@/lib/config/inventory";
import {
  EXPIRATION_LABELS,
  daysToExpire,
  expirationSeverity,
  expirationStatus,
  type ExpirationStatus,
  type ExpirationThresholds,
} from "@/lib/lots/expiration";
import { allocateByFefo, sortByFefo, type FefoCandidate } from "@/lib/lots/fefo";
import {
  computeVolumeL,
  computeWeightKg,
  roundQuantity,
  type UnitKind,
} from "@/lib/lots/weight";
import {
  formatLotCode,
  lotSequenceScope,
} from "@/lib/lots/lot-code";
import {
  consumeLot,
  recordStockMovements,
  type LedgerMovementLine,
} from "./inventory.service";

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5000;

/** Tolerancia para comparar cantidades fraccionarias. */
const EPSILON = 0.0005;

export interface ProductForLots {
  id: string;
  code: string;
  name: string;
  stockUnit: string;
  unitKind: UnitKind;
  netWeightGrams: number | null;
  netVolumeMl: number | null;
  weightIsEstimate: boolean;
  tracksExpiration: boolean;
  presentation?: string | null;
}

export interface EntryLotRequest {
  /** Código del proveedor/fabricante. No es el código interno. */
  externalCode?: string;
  /** Alias de compatibilidad con clientes anteriores. */
  code?: string;
  description?: string;
  expirationDate?: string | null;
  quantity: number;
  /**
   * El usuario confirma que no conoce el vencimiento. En ese caso el lote
   * queda con trazabilidad parcial y NUNCA se inventa una fecha.
   */
  expirationUnknown?: boolean;
  /** Motivo por el que no se conoce el vencimiento. */
  expirationNote?: string;
}

export interface CreatedLot {
  id: string;
  code: string;
  externalCode: string | null;
  productId: string;
  warehouseId: string;
  quantityReceived: number;
  quantityAvailable: number;
  stockUnit: string;
  unitKind: UnitKind;
  presentation: string | null;
  expirationDate: string | null;
  weightReceivedKg: number | null;
  weightAvailableKg: number | null;
  traceability: "FULL" | "PARTIAL" | "NONE";
  status: "DRAFT" | "ACTIVE" | "BLOCKED" | "DEPLETED" | "DISPOSED" | "CANCELLED";
}

/**
 * Reserva un rango de consecutivos de lote de forma atómica.
 * Nunca usa MAX()+1, por lo que dos transacciones concurrentes no repiten.
 */
async function reserveLotNumbers(
  executor: DbExecutor,
  productCode: string,
  isoDate: string,
  quantity: number
): Promise<number[]> {
  const scope = lotSequenceScope(productCode, isoDate);

  const [row] = await executor
    .insert(lotSequences)
    .values({ scope, lastNumber: quantity })
    .onConflictDoUpdate({
      target: lotSequences.scope,
      set: {
        lastNumber: sql`${lotSequences.lastNumber} + ${quantity}`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastNumber: lotSequences.lastNumber });

  const last = row?.lastNumber ?? quantity;
  const first = last - quantity + 1;

  return Array.from({ length: quantity }, (_, index) => first + index);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * Normaliza la trazabilidad del lote a partir de la información disponible.
 *
 * Un producto que no controla vencimiento puede tener trazabilidad completa
 * sin fecha. Un producto que sí lo controla, sin fecha, queda como parcial:
 * la fecha jamás se inventa.
 */
export function resolveLotTraceability(
  product: Pick<ProductForLots, "tracksExpiration">,
  expirationDate: string | null | undefined
): "FULL" | "PARTIAL" {
  if (!product.tracksExpiration) return "FULL";
  return expirationDate ? "FULL" : "PARTIAL";
}

/**
 * Crea los lotes de una línea de entrada.
 *
 * Si la línea no trae lotes, se crea uno automático por la cantidad total.
 * Ese lote no recibe fecha de vencimiento inventada: queda como PARTIAL.
 */
export async function createEntryItemLots(
  executor: DbExecutor,
  input: {
    entryId: string;
    entryItemId: string;
    product: ProductForLots;
    warehouseId: string;
    entryDate: string;
    userId: string;
    requestedLots: EntryLotRequest[];
    /** Presentación con la que se registró la línea. */
    presentation?: string | null;
    /** true cuando la entrada se crea ya confirmada. */
    active: boolean;
  }
): Promise<CreatedLot[]> {
  const requested = input.requestedLots;

  if (requested.length === 0) {
    throw businessRuleError("La línea de entrada no tiene lotes para registrar");
  }

  const isoDate = toIsoDate(input.entryDate);
  const sequences = await reserveLotNumbers(
    executor,
    input.product.code,
    isoDate,
    requested.length
  );

  const values = requested.map((lot, index) => {
    const quantity = roundQuantity(lot.quantity);
    const expirationDate = lot.expirationDate || null;
    const externalCode = (lot.externalCode ?? lot.code)?.trim() || null;
    const traceability = resolveLotTraceability(input.product, expirationDate);

    const notesParts: string[] = [];
    if (lot.expirationNote?.trim()) notesParts.push(lot.expirationNote.trim());
    if (
      input.product.tracksExpiration &&
      !expirationDate &&
      lot.expirationUnknown
    ) {
      notesParts.push("Vencimiento no informado por el Banco.");
    }

    return {
      code: formatLotCode(input.product.code, isoDate, sequences[index]),
      externalCode,
      entryId: input.entryId,
      entryItemId: input.entryItemId,
      productId: input.product.id,
      warehouseId: input.warehouseId,
      status: input.active ? ("ACTIVE" as const) : ("DRAFT" as const),
      origin: "ENTRY" as const,
      traceability: traceability as "FULL" | "PARTIAL",
      description: lot.description?.trim() || null,
      notes: notesParts.length > 0 ? notesParts.join(" ") : null,
      expirationDate,
      receivedAt: new Date(`${isoDate}T12:00:00-05:00`),
      quantityReceived: quantity,
      quantityAvailable: input.active ? quantity : 0,
      stockUnit: input.product.stockUnit,
      unitKind: input.product.unitKind,
      presentation:
        input.presentation?.trim() || input.product.presentation || null,
      netWeightGrams: input.product.netWeightGrams,
      netVolumeMl: input.product.netVolumeMl,
      weightIsEstimate: input.product.weightIsEstimate,
      isHistorical: false,
      createdBy: input.userId,
    };
  });

  try {
    const inserted = await executor.insert(lots).values(values).returning({
      id: lots.id,
      code: lots.code,
      externalCode: lots.externalCode,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      quantityReceived: lots.quantityReceived,
      quantityAvailable: lots.quantityAvailable,
      stockUnit: lots.stockUnit,
      unitKind: lots.unitKind,
      presentation: lots.presentation,
      expirationDate: lots.expirationDate,
      traceability: lots.traceability,
      status: lots.status,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
    });

    return inserted.map((lot) => ({
      ...lot,
      weightReceivedKg: computeWeightKg(
        lot.quantityReceived,
        lot.netWeightGrams
      ),
      weightAvailableKg: computeWeightKg(
        lot.quantityAvailable,
        lot.netWeightGrams
      ),
    }));
  } catch (error) {
    // Colisión de código: la secuencia es atómica, pero ante un conflicto
    // se reintenta reservando un nuevo rango. La transacción garantiza que no
    // queden lotes a medio crear.
    if (!isUniqueViolation(error)) throw error;

    return createEntryItemLots(executor, {
      ...input,
      requestedLots: input.requestedLots,
    });
  }
}

/**
 * Crea el lote automático de una entrada DRAFT que no tenía lote.
 * Se usa al confirmar documentos creados antes del modelo de lotes.
 */
export async function createAutoLotForDraft(
  executor: DbExecutor,
  input: {
    entryId: string;
    entryItemId: string;
    product: ProductForLots;
    warehouseId: string;
    entryDate: string;
    quantity: number;
    userId: string;
    presentation?: string | null;
  }
): Promise<CreatedLot> {
  const [created] = await createEntryItemLots(executor, {
    ...input,
    requestedLots: [
      {
        quantity: input.quantity,
        description: "Lote generado al confirmar una entrada sin lote",
      },
    ],
    active: true,
  });

  return created;
}

/**
 * Crea un lote de ajuste positivo por auditoría.
 * Es el único caso en que el sistema crea un lote sin documento de entrada;
 * queda marcado como ADJUSTMENT / PARTIAL y con su auditoría como origen.
 */
export async function createAdjustmentLot(
  executor: DbExecutor,
  input: {
    product: ProductForLots;
    warehouseId: string;
    quantity: number;
    isoDate: string;
    userId: string;
    notes: string;
  }
): Promise<CreatedLot> {
  const [sequence] = await reserveLotNumbers(
    executor,
    input.product.code,
    input.isoDate,
    1
  );

  const [created] = await executor
    .insert(lots)
    .values({
      code: formatLotCode(input.product.code, input.isoDate, sequence),
      externalCode: null,
      entryId: null,
      entryItemId: null,
      productId: input.product.id,
      warehouseId: input.warehouseId,
      status: "ACTIVE",
      origin: "ADJUSTMENT",
      traceability: "PARTIAL",
      description: "Ajuste positivo por auditoría",
      notes: input.notes,
      expirationDate: null,
      receivedAt: new Date(),
      quantityReceived: roundQuantity(input.quantity),
      quantityAvailable: roundQuantity(input.quantity),
      stockUnit: input.product.stockUnit,
      unitKind: input.product.unitKind,
      presentation: input.product.presentation || null,
      netWeightGrams: input.product.netWeightGrams,
      netVolumeMl: input.product.netVolumeMl,
      weightIsEstimate: input.product.weightIsEstimate,
      isHistorical: false,
      createdBy: input.userId,
    })
    .returning({
      id: lots.id,
      code: lots.code,
      externalCode: lots.externalCode,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      quantityReceived: lots.quantityReceived,
      quantityAvailable: lots.quantityAvailable,
      stockUnit: lots.stockUnit,
      unitKind: lots.unitKind,
      presentation: lots.presentation,
      expirationDate: lots.expirationDate,
      traceability: lots.traceability,
      status: lots.status,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
    });

  return {
    ...created,
    weightReceivedKg: computeWeightKg(
      created.quantityReceived,
      created.netWeightGrams
    ),
    weightAvailableKg: computeWeightKg(
      created.quantityAvailable,
      created.netWeightGrams
    ),
  };
}

interface AvailableLot {
  id: string;
  code: string;
  productId: string;
  warehouseId: string;
  quantityAvailable: number;
  expirationDate: string | null;
  receivedAt: Date | null;
  netWeightGrams: number | null;
  netVolumeMl: number | null;
}

export interface LotAllocation {
  lot: AvailableLot;
  quantity: number;
}

/**
 * Bloquea y devuelve lotes activos en orden FEFO (primero vence, primero sale).
 *
 * Los lotes vencidos quedan excluidos: la mercancía vencida no se despacha
 * de forma automática. Los lotes sin vencimiento van al final; a igual
 * vencimiento, el más antiguo.
 */
export async function findAvailableLotsFefo(
  executor: DbExecutor,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    /** Uso excepcional: permitir consumir lotes vencidos. */
    allowExpired?: boolean;
    today?: string;
  }
): Promise<LotAllocation[]> {
  const today = input.today ?? bankTodayIso();

  const rows = await executor
    .select({
      id: lots.id,
      code: lots.code,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      quantityAvailable: lots.quantityAvailable,
      expirationDate: lots.expirationDate,
      receivedAt: lots.receivedAt,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
    })
    .from(lots)
    .where(
      and(
        eq(lots.productId, input.productId),
        eq(lots.warehouseId, input.warehouseId),
        eq(lots.status, "ACTIVE"),
        gt(lots.quantityAvailable, 0)
      )
    )
    .orderBy(
      sql`${lots.expirationDate} asc nulls last`,
      sql`${lots.receivedAt} asc nulls last`,
      asc(lots.createdAt),
      asc(lots.id)
    )
    .for("update");

  const candidates: FefoCandidate[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    quantityAvailable: Number(row.quantityAvailable),
    expirationDate: row.expirationDate,
    receivedAt: row.receivedAt,
  }));

  const result = allocateByFefo(candidates, input.quantity, today, {
    allowExpired: input.allowExpired,
  });

  if (result.shortfall > EPSILON) {
    throw insufficientStockError(
      `No hay lotes suficientes para cubrir la salida. Disponible en lotes: ${roundQuantity(
        input.quantity - result.shortfall
      )}, solicitado: ${roundQuantity(input.quantity)}` +
        (result.expiredExcluded > 0
          ? ` (${result.expiredExcluded} lote(s) vencido(s) no se pueden despachar)`
          : "")
    );
  }

  const byId = new Map(rows.map((row) => [row.id, row]));

  return result.allocations.map((allocation) => ({
    lot: byId.get(allocation.lotId)!,
    quantity: allocation.quantity,
  }));
}

/**
 * Valida una asignación manual de lotes. La suma debe coincidir exactamente
 * con la cantidad de la línea y cada lote debe pertenecer al producto/bodega.
 */
async function findExplicitLots(
  executor: DbExecutor,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    explicit: { lotId: string; quantity: number }[];
    allowExpired?: boolean;
    today?: string;
  }
): Promise<LotAllocation[]> {
  const today = input.today ?? bankTodayIso();
  const merged = new Map<string, number>();

  for (const item of input.explicit) {
    merged.set(
      item.lotId,
      roundQuantity((merged.get(item.lotId) ?? 0) + item.quantity)
    );
  }

  const ids = [...merged.keys()];
  const rows = await executor
    .select({
      id: lots.id,
      code: lots.code,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      status: lots.status,
      quantityAvailable: lots.quantityAvailable,
      expirationDate: lots.expirationDate,
      receivedAt: lots.receivedAt,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
    })
    .from(lots)
    .where(inArray(lots.id, ids))
    .for("update");

  if (rows.length !== ids.length) {
    throw notFoundError("Lote");
  }

  let total = 0;
  const allocations: LotAllocation[] = [];

  for (const row of rows) {
    const quantity = merged.get(row.id) ?? 0;

    if (
      row.productId !== input.productId ||
      row.warehouseId !== input.warehouseId
    ) {
      throw businessRuleError(
        `El lote ${row.code} no pertenece al producto y bodega de la salida`
      );
    }

    if (row.status !== "ACTIVE") {
      throw businessRuleError(`El lote ${row.code} no está activo`);
    }

    const days = daysToExpire(row.expirationDate, today);
    if (days !== null && days < 0 && !input.allowExpired) {
      throw businessRuleError(
        `El lote ${row.code} está vencido y no se puede despachar. ` +
          "Registra una disposal o un ajuste autorizado."
      );
    }

    if (quantity > row.quantityAvailable + EPSILON) {
      throw insufficientStockError(
        `El lote ${row.code} tiene ${row.quantityAvailable} disponible(s) y se solicitaron ${quantity}`
      );
    }

    total = roundQuantity(total + quantity);
    allocations.push({ lot: row, quantity });
  }

  if (Math.abs(total - input.quantity) > EPSILON) {
    throw businessRuleError(
      `La asignación de lotes suma ${total} y la línea requiere ${roundQuantity(
        input.quantity
      )}`
    );
  }

  return allocations;
}

/**
 * Asigna, consume y registra los lotes de una línea de despacho.
 */
export async function allocateDispatchItemLots(
  executor: DbExecutor,
  input: {
    dispatchItemId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    explicit?: { lotId: string; quantity: number }[];
    allowExpired?: boolean;
  }
): Promise<LedgerMovementLine[]> {
  const allocations =
    input.explicit && input.explicit.length > 0
      ? await findExplicitLots(executor, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          explicit: input.explicit,
          allowExpired: input.allowExpired,
        })
      : await findAvailableLotsFefo(executor, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          allowExpired: input.allowExpired,
        });

  const rows: {
    dispatchItemId: string;
    lotId: string;
    quantity: number;
    netWeightGrams: number | null;
    netVolumeMl: number | null;
  }[] = [];
  const movements: LedgerMovementLine[] = [];

  for (const allocation of allocations) {
    const consumed = await consumeLot(executor, {
      lotId: allocation.lot.id,
      quantity: allocation.quantity,
    });

    rows.push({
      dispatchItemId: input.dispatchItemId,
      lotId: allocation.lot.id,
      quantity: allocation.quantity,
      netWeightGrams: allocation.lot.netWeightGrams,
      netVolumeMl: allocation.lot.netVolumeMl,
    });

    movements.push({
      lotId: allocation.lot.id,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantityDelta: -allocation.quantity,
      lotBalanceAfter: consumed.quantityAvailable,
    });
  }

  await executor.insert(dispatchItemLots).values(rows);
  return movements;
}

/**
 * Ajusta el stock de un producto/bodega al conteo físico, por lotes.
 *
 * Si sobró stock se crea un lote de ajuste (no se atribuye a un lote
 * existente sin evidencia). Si falta, se consume FEFO y se deja el detalle
 * en `audit_item_lots`.
 *
 * Cuando el conteo se hace POR LOTE, el ajuste se aplica sobre esos lotes
 * concretos: la cantidad anterior, la ajustada y la posterior quedan
 * registradas en `audit_item_lots` y en el movimiento.
 */
export async function applyAuditAdjustment(
  executor: DbExecutor,
  input: {
    auditId: string;
    auditItemId: string;
    product: ProductForLots;
    warehouseId: string;
    systemQuantity: number;
    physicalQuantity: number;
    isoDate: string;
    userId: string;
    notes: string;
    /** Conteo físico por lote. Si se informa, se ajusta cada lote. */
    lotCounts?: { lotId: string; physicalQuantity: number }[];
  }
): Promise<void> {
  if (input.lotCounts && input.lotCounts.length > 0) {
    await applyAuditAdjustmentByLots(executor, {
      ...input,
      lotCounts: input.lotCounts,
    });
    return;
  }

  const difference = roundQuantity(
    input.physicalQuantity - input.systemQuantity
  );

  if (Math.abs(difference) < EPSILON) return;

  const movements: LedgerMovementLine[] = [];

  if (difference > 0) {
    const lot = await createAdjustmentLot(executor, {
      product: input.product,
      warehouseId: input.warehouseId,
      quantity: difference,
      isoDate: input.isoDate,
      userId: input.userId,
      notes: input.notes,
    });

    movements.push({
      lotId: lot.id,
      productId: input.product.id,
      warehouseId: input.warehouseId,
      quantityDelta: difference,
      lotBalanceAfter: difference,
    });

    await executor.insert(auditItemLots).values({
      auditItemId: input.auditItemId,
      lotId: lot.id,
      systemQuantity: 0,
      physicalQuantity: difference,
      difference,
    });
  } else {
    const allocations = await findAvailableLotsFefo(executor, {
      productId: input.product.id,
      warehouseId: input.warehouseId,
      quantity: Math.abs(difference),
      // Un ajuste de inventario físico sí puede consumir mercancía vencida:
      // se está reflejando lo que realmente hay en la bodega.
      allowExpired: true,
    });

    for (const allocation of allocations) {
      const before = allocation.lot.quantityAvailable;
      const consumed = await consumeLot(executor, {
        lotId: allocation.lot.id,
        quantity: allocation.quantity,
      });

      movements.push({
        lotId: allocation.lot.id,
        productId: input.product.id,
        warehouseId: input.warehouseId,
        quantityDelta: -allocation.quantity,
        lotBalanceAfter: consumed.quantityAvailable,
      });

      await executor.insert(auditItemLots).values({
        auditItemId: input.auditItemId,
        lotId: allocation.lot.id,
        systemQuantity: before,
        physicalQuantity: Math.max(0, before - allocation.quantity),
        difference: -allocation.quantity,
      });
    }
  }

  await recordStockMovements(executor, movements, {
    type: "AUDIT",
    documentId: input.auditId,
    documentType: "AUDIT",
    userId: input.userId,
    notes: input.notes,
  });
}

/**
 * Ajusta el stock con un conteo físico POR LOTE.
 *
 * - Si en un lote hay menos mercancía de la esperada, se consume de ese lote.
 * - Si hay más, la diferencia se registra como un lote de ajuste: la
 *   cantidad recibida de un lote es histórica y no se reescribe.
 */
async function applyAuditAdjustmentByLots(
  executor: DbExecutor,
  input: {
    auditId: string;
    auditItemId: string;
    product: ProductForLots;
    warehouseId: string;
    systemQuantity: number;
    physicalQuantity: number;
    isoDate: string;
    userId: string;
    notes: string;
    lotCounts: { lotId: string; physicalQuantity: number }[];
  }
): Promise<void> {
  const ids = input.lotCounts.map((count) => count.lotId);

  const rows = await executor
    .select({
      id: lots.id,
      code: lots.code,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      status: lots.status,
      quantityAvailable: lots.quantityAvailable,
    })
    .from(lots)
    .where(inArray(lots.id, ids))
    .for("update");

  if (rows.length !== ids.length) {
    throw notFoundError("Lote");
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const movements: LedgerMovementLine[] = [];

  for (const count of input.lotCounts) {
    const lot = byId.get(count.lotId);
    if (!lot) throw notFoundError("Lote");

    if (lot.productId !== input.product.id) {
      throw businessRuleError(
        `El lote ${lot.code} no pertenece al producto auditado`
      );
    }

    if (lot.warehouseId !== input.warehouseId) {
      throw businessRuleError(
        `El lote ${lot.code} no pertenece a la bodega auditada`
      );
    }

    const before = Number(lot.quantityAvailable);
    const physical = roundQuantity(count.physicalQuantity);
    const difference = roundQuantity(physical - before);

    if (Math.abs(difference) < EPSILON) {
      await executor.insert(auditItemLots).values({
        auditItemId: input.auditItemId,
        lotId: lot.id,
        systemQuantity: before,
        physicalQuantity: physical,
        difference: 0,
      });
      continue;
    }

    if (difference < 0) {
      const consumed = await consumeLot(executor, {
        lotId: lot.id,
        quantity: Math.abs(difference),
      });

      movements.push({
        lotId: lot.id,
        productId: input.product.id,
        warehouseId: input.warehouseId,
        quantityDelta: difference,
        lotBalanceAfter: consumed.quantityAvailable,
      });

      await executor.insert(auditItemLots).values({
        auditItemId: input.auditItemId,
        lotId: lot.id,
        systemQuantity: before,
        physicalQuantity: physical,
        difference,
      });
    } else {
      // Sobró mercancía: se registra en el lote original y la diferencia
      // se materializa en un lote de ajuste (la cantidad recibida es
      // histórica y no se reescribe).
      await executor.insert(auditItemLots).values({
        auditItemId: input.auditItemId,
        lotId: lot.id,
        systemQuantity: before,
        physicalQuantity: physical,
        difference,
      });

      const adjustmentLot = await createAdjustmentLot(executor, {
        product: input.product,
        warehouseId: input.warehouseId,
        quantity: difference,
        isoDate: input.isoDate,
        userId: input.userId,
        notes: `${input.notes} — ajuste del lote ${lot.code}`,
      });

      movements.push({
        lotId: adjustmentLot.id,
        productId: input.product.id,
        warehouseId: input.warehouseId,
        quantityDelta: difference,
        lotBalanceAfter: difference,
      });
    }
  }

  if (movements.length > 0) {
    await recordStockMovements(executor, movements, {
      type: "AUDIT",
      documentId: input.auditId,
      documentType: "AUDIT",
      userId: input.userId,
      notes: input.notes,
    });
  }
}

/**
 * Registra los movimientos de entrada para los lotes ya creados/activados.
 */
export async function applyEntryLots(
  executor: DbExecutor,
  input: {
    entryId: string;
    entryNumber: string;
    userId: string;
    lotRows: {
      id: string;
      productId: string;
      warehouseId: string;
      quantityAvailable: number;
    }[];
  }
): Promise<void> {
  const movements: LedgerMovementLine[] = input.lotRows
    .filter((lot) => lot.quantityAvailable > 0)
    .map((lot) => ({
      lotId: lot.id,
      productId: lot.productId,
      warehouseId: lot.warehouseId,
      quantityDelta: lot.quantityAvailable,
      lotBalanceAfter: lot.quantityAvailable,
    }));

  if (movements.length === 0) return;

  await recordStockMovements(executor, movements, {
    type: "ENTRY",
    documentId: input.entryId,
    documentType: "ENTRY",
    userId: input.userId,
    notes: `Entrada ${input.entryNumber}`,
  });
}

// ============================================================
// CONSULTAS
// ============================================================

export type LotExpirationFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "soon"
  | "expired"
  | "range"
  | "missing";

export interface LotFilters {
  productId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
  expiration?: LotExpirationFilter;
  /** Fecha exacta de vencimiento (YYYY-MM-DD). */
  expirationDate?: string;
  /** Rango de fechas de vencimiento. */
  expirationFrom?: string;
  expirationTo?: string;
  /** Solo lotes con existencia disponible. */
  hasStock?: boolean;
  /** Incluye los lotes agotados en la consulta. */
  includeEmpty?: boolean;
  page?: number;
  pageSize?: number;
  /** Solo los lotes cuyo producto controla vencimiento. */
  trackingOnly?: boolean;
}

const lotSelectColumns = {
  id: lots.id,
  code: lots.code,
  externalCode: lots.externalCode,
  productId: lots.productId,
  productCode: products.code,
  productName: products.name,
  warehouseId: lots.warehouseId,
  warehouseCode: warehouses.code,
  warehouseName: warehouses.name,
  status: lots.status,
  origin: lots.origin,
  traceability: lots.traceability,
  description: lots.description,
  notes: lots.notes,
  expirationDate: lots.expirationDate,
  receivedAt: lots.receivedAt,
  quantityReceived: lots.quantityReceived,
  quantityAvailable: lots.quantityAvailable,
  stockUnit: lots.stockUnit,
  unitKind: lots.unitKind,
  presentation: lots.presentation,
  netWeightGrams: lots.netWeightGrams,
  netVolumeMl: lots.netVolumeMl,
  weightIsEstimate: lots.weightIsEstimate,
  isHistorical: lots.isHistorical,
  createdAt: lots.createdAt,
  updatedAt: lots.updatedAt,
};

/**
 * Construye las condiciones de filtrado de lotes. Se usa tanto por la
 * consulta paginada como por la exportación, para que ambas devuelvan
 * exactamente las mismas filas.
 */
export function buildLotConditions(
  filters: LotFilters,
  today: string
): SQL[] {
  const conditions: SQL[] = [];

  if (filters.productId) conditions.push(eq(lots.productId, filters.productId));
  if (filters.warehouseId) {
    conditions.push(eq(lots.warehouseId, filters.warehouseId));
  }

  if (filters.status && filters.status !== "ALL") {
    conditions.push(eq(lots.status, filters.status as "ACTIVE"));
  }

  // `hasStock` explícito manda: true = solo con existencia, false = todos
  // (incluye los agotados, que se conservan para consulta histórica).
  // Sin el parámetro, el criterio por defecto es solo existencias.
  if (filters.hasStock === true) {
    conditions.push(gt(lots.quantityAvailable, 0));
  } else if (filters.hasStock === false) {
    // Sin filtro: se incluyen los lotes agotados.
  } else if (!filters.includeEmpty) {
    conditions.push(gt(lots.quantityAvailable, 0));
  }

  if (filters.trackingOnly) {
    conditions.push(eq(products.tracksExpiration, true));
  }

  const expiration = filters.expiration ?? "all";

  if (expiration === "today") {
    conditions.push(eq(lots.expirationDate, today));
  } else if (expiration === "tomorrow") {
    conditions.push(eq(lots.expirationDate, addDaysIso(today, 1)));
  } else if (expiration === "expired") {
    conditions.push(sql`${lots.expirationDate} < ${today}::date`);
  } else if (expiration === "missing") {
    conditions.push(sql`${lots.expirationDate} is null`);
  } else if (expiration === "range") {
    if (filters.expirationFrom) {
      conditions.push(gte(lots.expirationDate, filters.expirationFrom));
    }
    if (filters.expirationTo) {
      conditions.push(lte(lots.expirationDate, filters.expirationTo));
    }
  } else if (filters.expirationDate) {
    conditions.push(eq(lots.expirationDate, filters.expirationDate));
  }

  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(lots.code, pattern),
        ilike(lots.externalCode, pattern),
        ilike(lots.description, pattern),
        ilike(products.code, pattern),
        ilike(products.name, pattern)
      )!
    );
  }

  return conditions;
}

/**
 * Enriquece las filas de lote con los cálculos de peso y vencimiento.
 */
function decorateLotRow<T extends {
  quantityReceived: number;
  quantityAvailable: number;
  netWeightGrams: number | null;
  netVolumeMl: number | null;
  expirationDate: string | null;
}>(row: T, thresholds: ExpirationThresholds, today: string) {
  const status = expirationStatus(row.expirationDate, thresholds, today);

  return {
    ...row,
    weightReceivedKg: computeWeightKg(row.quantityReceived, row.netWeightGrams),
    weightAvailableKg: computeWeightKg(
      row.quantityAvailable,
      row.netWeightGrams
    ),
    volumeAvailableL: computeVolumeL(row.quantityAvailable, row.netVolumeMl),
    daysToExpire: daysToExpire(row.expirationDate, today),
    expirationStatus: status,
    expirationSeverity: expirationSeverity(status),
    expirationLabel: EXPIRATION_LABELS[status],
  };
}

/**
 * Lista lotes con paginación obligatoria y filtros de vencimiento.
 */
export async function listLots(
  executor: DbExecutor,
  filters: LotFilters = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? 25)
  );
  const today = bankTodayIso();
  const thresholds = await getExpirationThresholds(executor);
  const conditions = buildLotConditions(filters, today);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRow] = await Promise.all([
    executor
      .select(lotSelectColumns)
      .from(lots)
      .innerJoin(products, eq(lots.productId, products.id))
      .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
      .where(where)
      .orderBy(
        sql`${lots.expirationDate} asc nulls last`,
        asc(products.code),
        asc(lots.code)
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    executor
      .select({ total: count() })
      .from(lots)
      .innerJoin(products, eq(lots.productId, products.id))
      .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
      .where(where),
  ]);

  return {
    items: items.map((item) => decorateLotRow(item, thresholds, today)),
    total: Number(totalRow[0]?.total ?? 0),
    page,
    pageSize,
    totalPages: Math.max(
      1,
      Math.ceil(Number(totalRow[0]?.total ?? 0) / pageSize)
    ),
  };
}

/**
 * Devuelve todos los lotes que cumplen un filtro, para la exportación.
 * Usa EXACTAMENTE las mismas condiciones que la consulta paginada.
 */
export async function listLotsForExport(
  executor: DbExecutor,
  filters: LotFilters = {}
) {
  const today = bankTodayIso();
  const thresholds = await getExpirationThresholds(executor);
  const conditions = buildLotConditions(filters, today);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await executor
    .select(lotSelectColumns)
    .from(lots)
    .innerJoin(products, eq(lots.productId, products.id))
    .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
    .where(where)
    .orderBy(
      sql`${lots.expirationDate} asc nulls last`,
      asc(products.code),
      asc(lots.code)
    )
    .limit(MAX_EXPORT_ROWS);

  return rows.map((row) => decorateLotRow(row, thresholds, today));
}

/**
 * Detalle de un lote, con sus últimos movimientos y sus asignaciones.
 */
export async function getLot(executor: DbExecutor, id: string) {
  const [lot] = await executor
    .select(lotSelectColumns)
    .from(lots)
    .innerJoin(products, eq(lots.productId, products.id))
    .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
    .where(eq(lots.id, id))
    .limit(1);

  if (!lot) throw notFoundError("Lote");

  const thresholds = await getExpirationThresholds(executor);
  const today = bankTodayIso();

  const movements = await executor
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      balanceAfter: inventoryMovements.balanceAfter,
      lotBalanceAfter: inventoryMovements.lotBalanceAfter,
      documentId: inventoryMovements.documentId,
      documentType: inventoryMovements.documentType,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.lotId, id))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(100);

  const dispatches = await executor
    .select({
      id: dispatchItemLots.id,
      dispatchItemId: dispatchItemLots.dispatchItemId,
      quantity: dispatchItemLots.quantity,
      netWeightGrams: dispatchItemLots.netWeightGrams,
      createdAt: dispatchItemLots.createdAt,
    })
    .from(dispatchItemLots)
    .where(eq(dispatchItemLots.lotId, id))
    .orderBy(desc(dispatchItemLots.createdAt));

  const audits = await executor
    .select({
      id: auditItemLots.id,
      auditItemId: auditItemLots.auditItemId,
      systemQuantity: auditItemLots.systemQuantity,
      physicalQuantity: auditItemLots.physicalQuantity,
      difference: auditItemLots.difference,
      createdAt: auditItemLots.createdAt,
    })
    .from(auditItemLots)
    .where(eq(auditItemLots.lotId, id))
    .orderBy(desc(auditItemLots.createdAt));

  return {
    ...decorateLotRow(lot, thresholds, today),
    movements,
    dispatchAllocations: dispatches.map((row) => ({
      ...row,
      weightKg: computeWeightKg(row.quantity, row.netWeightGrams),
    })),
    auditAllocations: audits,
  };
}

/**
 * Cambia el estado de un lote (bloqueo o disposición final).
 *
 * La mercancía retenida o descartada SALE del pool disponible: la cantidad
 * disponible del lote pasa a cero y queda registrada en el libro de
 * movimientos. La cantidad RECIBIDA se conserva intacta como dato histórico.
 *
 * Restablecer un lote bloqueado requiere una auditoría positiva
 * autorizada: este endpoint nunca reescribe la historia.
 */
export async function applyLotStatusChange(
  executor: DbExecutor,
  input: {
    lotId: string;
    newStatus: "BLOCKED" | "DISPOSED" | "CANCELLED";
    reason: string;
    userId: string;
  }
): Promise<{
  lotId: string;
  code: string;
  previousStatus: string;
  newStatus: string;
  quantityRemoved: number;
  weightRemovedKg: number | null;
}> {
  const [lot] = await executor
    .select({
      id: lots.id,
      code: lots.code,
      productId: lots.productId,
      warehouseId: lots.warehouseId,
      status: lots.status,
      quantityAvailable: lots.quantityAvailable,
      quantityReceived: lots.quantityReceived,
      netWeightGrams: lots.netWeightGrams,
      notes: lots.notes,
    })
    .from(lots)
    .where(eq(lots.id, input.lotId))
    .for("update");

  if (!lot) throw notFoundError("Lote");

  if (lot.status === "CANCELLED" || lot.status === "DISPOSED") {
    throw businessRuleError(
      `El lote ${lot.code} ya está en estado ${lot.status} y no admite cambios.`
    );
  }

  if (lot.status === "DRAFT") {
    // Un lote en borrador nunca movió stock: se cancela sin movimiento.
    const [updated] = await executor
      .update(lots)
      .set({
        status: "CANCELLED",
        notes: `${lot.notes ? `${lot.notes} ` : ""}Cancelado: ${input.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lot.id))
      .returning({ status: lots.status });

    return {
      lotId: lot.id,
      code: lot.code,
      previousStatus: lot.status,
      newStatus: updated?.status ?? "CANCELLED",
      quantityRemoved: 0,
      weightRemovedKg: null,
    };
  }

  if (lot.status !== "ACTIVE") {
    throw businessRuleError(
      `El lote ${lot.code} está en estado ${lot.status} y no admite cambios de estado.`
    );
  }

  const quantityRemoved = Number(lot.quantityAvailable);

  const [updated] = await executor
    .update(lots)
    .set({
      status: input.newStatus,
      quantityAvailable: 0,
      notes: `${lot.notes ? `${lot.notes} ` : ""}${
        input.newStatus === "BLOCKED" ? "Bloqueado" : "Disposed"
      }: ${input.reason}`,
      updatedAt: new Date(),
    })
    .where(eq(lots.id, lot.id))
    .returning({ status: lots.status });

  if (quantityRemoved > 0) {
    await recordStockMovements(
      executor,
      [
        {
          lotId: lot.id,
          productId: lot.productId,
          warehouseId: lot.warehouseId,
          quantityDelta: -quantityRemoved,
          lotBalanceAfter: 0,
        },
      ],
      {
        type: "ADJUSTMENT",
        documentId: lot.id,
        documentType: "LOT",
        userId: input.userId,
        notes: `${input.newStatus === "BLOCKED" ? "Bloqueo" : "Disposición"} del lote ${lot.code}: ${input.reason}`,
      }
    );
  }

  return {
    lotId: lot.id,
    code: lot.code,
    previousStatus: lot.status,
    newStatus: updated?.status ?? input.newStatus,
    quantityRemoved,
    weightRemovedKg: computeWeightKg(quantityRemoved, lot.netWeightGrams),
  };
}

/**
 * Lotes de un producto, con su existencia y su vencimiento más próximo.
 */
export async function listProductLots(
  executor: DbExecutor,
  productId: string,
  options: { includeEmpty?: boolean; limit?: number } = {}
) {
  const conditions: SQL[] = [eq(lots.productId, productId)];

  if (!options.includeEmpty) {
    conditions.push(gt(lots.quantityAvailable, 0));
  }

  const today = bankTodayIso();
  const thresholds = await getExpirationThresholds(executor);

  const rows = await executor
    .select(lotSelectColumns)
    .from(lots)
    .innerJoin(products, eq(lots.productId, products.id))
    .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(
      sql`${lots.expirationDate} asc nulls last`,
      asc(lots.code)
    )
    .limit(options.limit ?? 100);

  const decorated = rows.map((row) => decorateLotRow(row, thresholds, today));

  const active = decorated.filter((row) => row.status === "ACTIVE");

  return {
    items: decorated,
    summary: {
      lots: decorated.length,
      activeLots: active.length,
      totalReceived: roundQuantity(
        decorated.reduce((sum, row) => sum + row.quantityReceived, 0)
      ),
      totalAvailable: roundQuantity(
        decorated.reduce((sum, row) => sum + row.quantityAvailable, 0)
      ),
      weightReceivedKg: roundQuantity(
        decorated.reduce(
          (sum, row) => sum + (row.weightReceivedKg ?? 0),
          0
        )
      ),
      weightAvailableKg: roundQuantity(
        decorated.reduce(
          (sum, row) => sum + (row.weightAvailableKg ?? 0),
          0
        )
      ),
      earliestExpiration: active
        .map((row) => row.expirationDate)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null,
      lotsWithoutWeight: decorated.filter(
        (row) => row.weightAvailableKg === null
      ).length,
    },
  };
}

export interface ExpiryAlertItem {
  id: string;
  code: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  expirationDate: string | null;
  daysToExpire: number | null;
  quantityAvailable: number;
  stockUnit: string;
  unitKind: UnitKind;
  weightAvailableKg: number | null;
  volumeAvailableL: number | null;
  expirationStatus: ExpirationStatus;
  expirationSeverity: string;
  expirationLabel: string;
}

export interface ExpiryAlerts {
  horizonDays: number;
  criticalDays: number;
  expiredCount: number;
  expiredWeightKg: number;
  expiresTodayCount: number;
  expiresTomorrowCount: number;
  expiringCount: number;
  expiringWeightKg: number;
  expiringVolumeL: number;
  /** Lotes de productos que controlan vencimiento pero no tienen fecha. */
  missingExpiryCount: number;
  totalAlerts: number;
  items: ExpiryAlertItem[];
}

/**
 * Alertas de vencimiento para el panel principal.
 *
 * Solo considera lotes con existencia: un lote agotado no genera alerta
 * operativa de mercancía por vencer.
 */
export async function getExpiryAlerts(
  executor: DbExecutor,
  input: {
    horizonDays?: number;
    limit?: number;
    includeMissingExpiry?: boolean;
  } = {}
): Promise<ExpiryAlerts> {
  const today = bankTodayIso();
  const thresholds = await getExpirationThresholds(executor);
  const horizonDays = Math.max(0, input.horizonDays ?? thresholds.alertDays);
  const limit = Math.min(100, Math.max(1, input.limit ?? 10));
  const horizonEnd = addDaysIso(today, horizonDays);
  const tomorrow = addDaysIso(today, 1);

  const [summary] = await executor
    .select({
      expiredCount: sql<number>`(count(*) filter (where ${lots.expirationDate} < ${today}::date))::int`,
      expiredWeightKg: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0)) filter (where ${lots.expirationDate} < ${today}::date), 0) / 1000)::numeric, 3)`,
      expiresTodayCount: sql<number>`(count(*) filter (where ${lots.expirationDate} = ${today}::date))::int`,
      expiresTomorrowCount: sql<number>`(count(*) filter (where ${lots.expirationDate} = ${tomorrow}::date))::int`,
      expiringCount: sql<number>`(count(*) filter (where ${lots.expirationDate} >= ${today}::date and ${lots.expirationDate} <= ${horizonEnd}::date))::int`,
      expiringWeightKg: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0)) filter (where ${lots.expirationDate} >= ${today}::date and ${lots.expirationDate} <= ${horizonEnd}::date), 0) / 1000)::numeric, 3)`,
      expiringVolumeL: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netVolumeMl}, 0)) filter (where ${lots.expirationDate} >= ${today}::date and ${lots.expirationDate} <= ${horizonEnd}::date), 0) / 1000)::numeric, 3)`,
      missingExpiryCount: sql<number>`(count(*) filter (where ${lots.expirationDate} is null and ${products.tracksExpiration} = true))::int`,
      totalAlerts: sql<number>`(count(*))::int`,
    })
    .from(lots)
    .innerJoin(products, eq(lots.productId, products.id))
    .where(and(eq(lots.status, "ACTIVE"), gt(lots.quantityAvailable, 0)));

  const itemConditions: SQL[] = [
    eq(lots.status, "ACTIVE"),
    gt(lots.quantityAvailable, 0),
  ];

  if (input.includeMissingExpiry) {
    itemConditions.push(
      or(
        sql`${lots.expirationDate} is not null and ${lots.expirationDate} <= ${horizonEnd}::date`,
        sql`${lots.expirationDate} is null and ${products.tracksExpiration} = true`
      )!
    );
  } else {
    itemConditions.push(
      sql`${lots.expirationDate} is not null and ${lots.expirationDate} <= ${horizonEnd}::date`
    );
  }

  const rows = await executor
    .select({
      id: lots.id,
      code: lots.code,
      productId: lots.productId,
      productCode: products.code,
      productName: products.name,
      warehouseId: lots.warehouseId,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      expirationDate: lots.expirationDate,
      daysToExpire: sql<number>`(${lots.expirationDate} - ${today}::date)`,
      quantityAvailable: lots.quantityAvailable,
      stockUnit: lots.stockUnit,
      unitKind: lots.unitKind,
      netWeightGrams: lots.netWeightGrams,
      netVolumeMl: lots.netVolumeMl,
    })
    .from(lots)
    .innerJoin(products, eq(lots.productId, products.id))
    .innerJoin(warehouses, eq(lots.warehouseId, warehouses.id))
    .where(and(...itemConditions))
    .orderBy(asc(lots.expirationDate), asc(products.code))
    .limit(limit);

  const items: ExpiryAlertItem[] = rows.map((row) => {
    const status = expirationStatus(row.expirationDate, thresholds, today);

    return {
      id: row.id,
      code: row.code,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      warehouseCode: row.warehouseCode,
      expirationDate: row.expirationDate,
      daysToExpire:
        row.expirationDate === null
          ? null
          : Number(row.daysToExpire ?? 0),
      quantityAvailable: Number(row.quantityAvailable),
      stockUnit: row.stockUnit,
      unitKind: row.unitKind,
      weightAvailableKg: computeWeightKg(
        row.quantityAvailable,
        row.netWeightGrams
      ),
      volumeAvailableL: computeVolumeL(row.quantityAvailable, row.netVolumeMl),
      expirationStatus: status,
      expirationSeverity: expirationSeverity(status),
      expirationLabel: EXPIRATION_LABELS[status],
    };
  });

  return {
    horizonDays,
    criticalDays: thresholds.criticalDays,
    expiredCount: Number(summary?.expiredCount ?? 0),
    expiredWeightKg: Number(summary?.expiredWeightKg ?? 0),
    expiresTodayCount: Number(summary?.expiresTodayCount ?? 0),
    expiresTomorrowCount: Number(summary?.expiresTomorrowCount ?? 0),
    expiringCount: Number(summary?.expiringCount ?? 0),
    expiringWeightKg: Number(summary?.expiringWeightKg ?? 0),
    expiringVolumeL: Number(summary?.expiringVolumeL ?? 0),
    missingExpiryCount: Number(summary?.missingExpiryCount ?? 0),
    totalAlerts: Number(summary?.totalAlerts ?? 0),
    items,
  };
}

/**
 * Lotes disponibles de un producto en una bodega, para la selección manual
 * de lotes en una salida.
 */
export async function getAvailableLotsForSelection(
  executor: DbExecutor,
  input: { productId: string; warehouseId: string; today?: string }
) {
  const today = input.today ?? bankTodayIso();
  const thresholds = await getExpirationThresholds(executor);

  const rows = await executor
    .select({
      id: lots.id,
      code: lots.code,
      externalCode: lots.externalCode,
      expirationDate: lots.expirationDate,
      quantityAvailable: lots.quantityAvailable,
      stockUnit: lots.stockUnit,
      netWeightGrams: lots.netWeightGrams,
      receivedAt: lots.receivedAt,
    })
    .from(lots)
    .where(
      and(
        eq(lots.productId, input.productId),
        eq(lots.warehouseId, input.warehouseId),
        eq(lots.status, "ACTIVE"),
        gt(lots.quantityAvailable, 0)
      )
    )
    .orderBy(
      sql`${lots.expirationDate} asc nulls last`,
      asc(lots.receivedAt)
    );

  const candidates: FefoCandidate[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    quantityAvailable: Number(row.quantityAvailable),
    expirationDate: row.expirationDate,
    receivedAt: row.receivedAt,
  }));

  const ordered = sortByFefo(candidates, today);
  const orderIndex = new Map(ordered.map((item, index) => [item.id, index]));

  return rows
    .map((row) => {
      const days = daysToExpire(row.expirationDate, today);
      const status = expirationStatus(row.expirationDate, thresholds, today);

      return {
        id: row.id,
        code: row.code,
        externalCode: row.externalCode,
        expirationDate: row.expirationDate,
        daysToExpire: days,
        quantityAvailable: Number(row.quantityAvailable),
        stockUnit: row.stockUnit,
        weightAvailableKg: computeWeightKg(
          row.quantityAvailable,
          row.netWeightGrams
        ),
        expirationStatus: status,
        expirationSeverity: expirationSeverity(status),
        expirationLabel: EXPIRATION_LABELS[status],
        isExpired: days !== null && days < 0,
        fefoOrder: orderIndex.get(row.id) ?? 9999,
      };
    })
    .sort((a, b) => a.fefoOrder - b.fefoOrder);
}
