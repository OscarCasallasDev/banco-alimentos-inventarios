/**
 * Pruebas de integración — Trazabilidad por lotes
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Estas pruebas ejecutan el flujo REAL contra la base de datos
 * (entrada → lote → salida → dashboard → reportes) dentro de una
 * transacción que SIEMPRE se revierte al terminar.
 *
 * Ningún dato queda en la base: la transacción se cierra con un error
 * intencionado que PostgreSQL interpreta como ROLLBACK.
 *
 * Se omiten automáticamente cuando no hay `DATABASE_URL` configurada.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb, type DbTransaction } from "@/lib/db/client";
import { inventory, lots, users, warehouses } from "@/lib/db/schema";
import { createProduct } from "@/lib/services/product.service";
import { createEntry } from "@/lib/services/entry.service";
import { createOrder } from "@/lib/services/order.service";
import { createInvoice } from "@/lib/services/invoice.service";
import { createReceipt } from "@/lib/services/receipt.service";
import { createDispatch } from "@/lib/services/dispatch.service";
import { getDashboardSummary } from "@/lib/services/dashboard.service";
import { getExpiryAlerts, listLots } from "@/lib/services/lot.service";
import { listMovements } from "@/lib/services/inventory.service";
import { addDaysIso, bankTodayIso } from "@/lib/utils/dates";

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

/** Señal interna que fuerza el rollback de la transacción. */
class RollbackSignal extends Error {
  constructor(public readonly result: unknown) {
    super("rollback");
  }
}

/**
 * Ejecuta la función dentro de una transacción que siempre se revierte.
 */
async function enTransaccion<T>(
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      const result = await fn(tx);
      throw new RollbackSignal(result);
    });
  } catch (error) {
    if (error instanceof RollbackSignal) return error.result as T;
    throw error;
  }
}

interface Ctx {
  tx: DbTransaction;
  userId: string;
  warehouseId: string;
  productId: string;
  productCode: string;
}

const HOY = () => bankTodayIso();

describeDb("Integración — trazabilidad por lotes", () => {
  let base: {
    userId: string;
    warehouseId: string;
  };

  beforeAll(async () => {
    base = await enTransaccion(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.status, "ACTIVE"))
        .limit(1);

      if (!user) throw new Error("No hay usuarios activos en la base");

      // Se usa una bodega REAL: como toda la prueba se revierte, la
      // bodega no queda modificada y no se crean datos ficticios.
      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(eq(warehouses.status, "ACTIVE"))
        .limit(1);

      if (!warehouse) throw new Error("No hay bodegas activas en la base");

      return { userId: user.id, warehouseId: warehouse.id };
    });
  });

  afterAll(async () => {
    await closeDb();
  });

  /**
   * Crea el producto de prueba: arroz de 500 g en bolsas.
   */
  async function crearArroz(
    tx: DbTransaction,
    suffix: string,
    overrides: Partial<Parameters<typeof createProduct>[1]> = {}
  ) {
    const code = `TEST-ARR-${suffix}`;

    return createProduct(tx, {
      code,
      name: `Arroz test ${suffix}`,
      description: "Producto de prueba",
      presentation: "Bolsa 500g",
      weight: 500,
      unit: "unidad",
      stockUnit: "BOLSA",
      unitKind: "COUNT",
      netWeightGrams: 500,
      netVolumeMl: null,
      weightIsEstimate: false,
      tracksExpiration: true,
      categoryId: null,
      status: "ACTIVE",
      minStock: 0,
      ...overrides,
    });
  }

  async function crearEntrada(
    tx: DbTransaction,
    userId: string,
    warehouseId: string,
    items: {
      productId: string;
      quantity: number;
      lots: { expirationDate?: string; quantity: number; externalCode?: string }[];
    }[]
  ) {
    return createEntry(
      tx,
      {
        format: "E1",
        date: HOY(),
        sellerNumber: 1,
        status: "CONFIRMED",
        items: items.map((item) => ({
          productId: item.productId,
          warehouseId,
          quantity: item.quantity,
          unit: "BOLSA",
          presentation: "Bolsa 500g",
          value: 0,
          debitCredit: 0,
          lots: item.lots.map((lot) => ({
            externalCode: lot.externalCode,
            expirationDate: lot.expirationDate,
            quantity: lot.quantity,
          })),
        })),
      },
      userId
    );
  }

  // ------------------------------------------------------------------
  // Escenario 1: ingreso y peso
  // ------------------------------------------------------------------
  it("Escenario 1 — registra 300 bolsas de 500 g y calcula 150 kg", async () => {
    await enTransaccion(async (tx) => {
      const ctx: Ctx = {
        tx,
        userId: base.userId,
        warehouseId: base.warehouseId,
        productId: "",
        productCode: "",
      };

      const arroz = await crearArroz(tx, "S1");
      ctx.productId = arroz.id;
      ctx.productCode = arroz.code;

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: addDaysIso(HOY(), 30), quantity: 300 }],
        },
      ]);

      const createdLots = entry.items[0].lots;
      expect(createdLots).toHaveLength(1);

      const lot = createdLots[0];
      expect(lot.quantityReceived).toBe(300);
      expect(lot.quantityAvailable).toBe(300);
      expect(lot.weightReceivedKg).toBe(150);
      expect(lot.weightAvailableKg).toBe(150);
      expect(lot.stockUnit).toBe("BOLSA");
      expect(lot.expirationDate).toBe(addDaysIso(HOY(), 30));

      // El peso del lote está en la base de datos, no solo en memoria.
      const [row] = await tx
        .select({
          weight: sql<number>`round((${lots.quantityAvailable} * ${lots.netWeightGrams} / 1000)::numeric, 3)`,
        })
        .from(lots)
        .where(eq(lots.id, lot.id));

      expect(Number(row.weight)).toBe(150);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 2: dos ingresos del mismo producto
  // ------------------------------------------------------------------
  it("Escenario 2 — dos ingresos del mismo arroz crean dos lotes independientes", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S2");

      const primero = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: "2026-11-01", quantity: 300 }],
        },
      ]);

      const segundo = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 400,
          lots: [{ expirationDate: "2026-10-28", quantity: 400 }],
        },
      ]);

      const lote1 = primero.items[0].lots[0];
      const lote2 = segundo.items[0].lots[0];

      expect(lote1.id).not.toBe(lote2.id);
      expect(lote1.code).not.toBe(lote2.code);
      expect(lote1.quantityReceived).toBe(300);
      expect(lote2.quantityReceived).toBe(400);
      expect(lote1.expirationDate).toBe("2026-11-01");
      expect(lote2.expirationDate).toBe("2026-10-28");
      expect(lote1.weightReceivedKg).toBe(150);
      expect(lote2.weightReceivedKg).toBe(200);

      const total = await tx
        .select({
          total: sql<number>`coalesce(sum(${lots.quantityAvailable}), 0)`,
          weight: sql<number>`round((coalesce(sum(${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0)), 0) / 1000)::numeric, 3)`,
        })
        .from(lots)
        .where(eq(lots.productId, arroz.id));

      expect(Number(total[0].total)).toBe(700);
      expect(Number(total[0].weight)).toBe(350);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 3: varios productos en un mismo documento
  // ------------------------------------------------------------------
  it("Escenario 3 — cada línea de la entrada genera su propio lote", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S3A");
      const frijoles = await crearArroz(tx, "S3B", {
        name: "Frijoles test",
        netWeightGrams: 400,
      });
      const lentejas = await crearArroz(tx, "S3C", {
        name: "Lentejas test",
        netWeightGrams: 450,
      });

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: "2026-11-01", quantity: 300 }],
        },
        {
          productId: frijoles.id,
          quantity: 100,
          lots: [{ expirationDate: "2026-12-01", quantity: 100 }],
        },
        {
          productId: lentejas.id,
          quantity: 200,
          lots: [{ expirationDate: "2027-01-01", quantity: 200 }],
        },
      ]);

      expect(entry.items).toHaveLength(3);

      const codigos = entry.items.map((item) => item.lots[0].code);
      expect(new Set(codigos).size).toBe(3);

      expect(entry.items[0].lots[0].weightReceivedKg).toBe(150);
      expect(entry.items[1].lots[0].weightReceivedKg).toBe(40);
      expect(entry.items[2].lots[0].weightReceivedKg).toBe(90);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 4: códigos únicos
  // ------------------------------------------------------------------
  it("Escenario 4 — ingresos repetidos no colisionan de código", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S4");

      const codigos: string[] = [];

      for (let i = 0; i < 3; i += 1) {
        const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
          {
            productId: arroz.id,
            quantity: 300,
            lots: [{ expirationDate: "2026-11-01", quantity: 300 }],
          },
        ]);
        codigos.push(entry.items[0].lots[0].code);
      }

      expect(new Set(codigos).size).toBe(3);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 5: salida parcial
  // ------------------------------------------------------------------
  it("Escenario 5 — una salida parcial deja 200 bolsas y 100 kg", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S5");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: addDaysIso(HOY(), 60), quantity: 300 }],
        },
      ]);

      const loteId = entry.items[0].lots[0].id;

      // Pedido → factura → recibo → despacho: el flujo completo.
      const order = await createOrder(
        tx,
        {
          date: HOY(),
          status: "APPROVED",
          items: [
            {
              productId: arroz.id,
              warehouseId: base.warehouseId,
              quantity: 100,
            },
          ],
        },
        base.userId
      );

      const invoice = await createInvoice(
        tx,
        {
          format: "SF1",
          orderId: order.id,
          date: HOY(),
          status: "GENERATED",
        },
        base.userId
      );

      const receipt = await createReceipt(
        tx,
        {
          format: "R1",
          invoiceId: invoice.id,
          date: HOY(),
          status: "GENERATED",
        },
        base.userId
      );

      const dispatch = await createDispatch(
        tx,
        {
          receiptId: receipt.id,
          date: HOY(),
          status: "DISPATCHED",
        },
        base.userId
      );

      expect(dispatch.items).toHaveLength(1);
      expect(dispatch.items[0].lots).toHaveLength(1);
      expect(dispatch.items[0].lots[0].lotId).toBe(loteId);
      expect(dispatch.items[0].lots[0].quantity).toBe(100);

      const [after] = await tx
        .select({
          available: lots.quantityAvailable,
          status: lots.status,
        })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(after.available)).toBe(200);
      expect(after.status).toBe("ACTIVE");

      // El peso disponible se recalcula sobre las unidades restantes.
      const peso = await tx
        .select({
          weight: sql<number>`round((${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0) / 1000)::numeric, 3)`,
        })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(peso[0].weight)).toBe(100);

      // El inventario agregado refleja la salida.
      const [stock] = await tx
        .select({ quantity: inventory.quantity })
        .from(inventory)
        .where(
          sql`${inventory.productId} = ${arroz.id} and ${inventory.warehouseId} = ${base.warehouseId}`
        );

      expect(Number(stock.quantity)).toBe(200);

      // El movimiento de salida conserva el lote afectado.
      const movimientos = await listMovements(tx, { lotId: loteId });
      const salida = movimientos.items.find((item) => item.type === "EXIT");

      expect(salida).toBeDefined();
      expect(Number(salida!.quantity)).toBe(-100);
      expect(salida!.lotBalanceAfter).toBe(200);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 6: dashboard sin duplicar existencias
  // ------------------------------------------------------------------
  it("Escenario 6 — el dashboard refleja las existencias actuales", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S6");

      const antes = await getDashboardSummary(tx);

      await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: addDaysIso(HOY(), 45), quantity: 300 }],
        },
      ]);

      const despues = await getDashboardSummary(tx);

      expect(despues.totalUnits).toBe(antes.totalUnits + 300);
      expect(despues.totalWeightKg).toBeCloseTo(antes.totalWeightKg + 150, 3);
      expect(despues.activeLots).toBe(antes.activeLots + 1);
      expect(despues.referencesWithStock).toBe(antes.referencesWithStock + 1);
      // No se crean referencias nuevas: el producto ya existía.
      expect(despues.totalProducts).toBe(antes.totalProducts);

      // El inventario agregado y la suma de lotes coinciden.
      expect(despues.reconciliationDifference).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 7: vencimientos
  // ------------------------------------------------------------------
  it("Escenario 7 — el filtro de mañana devuelve los lotes de mañana", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S7");
      const manana = addDaysIso(HOY(), 1);
      const pasado = addDaysIso(HOY(), 10);

      await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: manana, quantity: 300 }],
        },
      ]);

      await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 100,
          lots: [{ expirationDate: pasado, quantity: 100 }],
        },
      ]);

      const resultado = await listLots(tx, {
        expiration: "tomorrow",
        pageSize: 100,
      });

      const deMañana = resultado.items.filter(
        (item) => item.expirationDate === manana
      );

      expect(deMañana.length).toBeGreaterThan(0);

      for (const lote of deMañana) {
        expect(lote.expirationDate).toBe(manana);
        expect(lote.weightAvailableKg).toBe(
          (Number(lote.quantityAvailable) * 500) / 1000
        );
      }

      const alertas = await getExpiryAlerts(tx, { horizonDays: 30, limit: 100 });
      expect(alertas.expiresTomorrowCount).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 8: lote agotado
  // ------------------------------------------------------------------
  it("Escenario 8 — un lote agotado no aparece como disponible ni alerta", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S8");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 50,
          lots: [{ expirationDate: addDaysIso(HOY(), 2), quantity: 50 }],
        },
      ]);

      const loteId = entry.items[0].lots[0].id;

      // Se consume por completo con un ajuste de auditoría.
      const { applyAuditAdjustment } = await import("@/lib/services/lot.service");
      const { auditItems, audits } = await import("@/lib/db/schema");

      const [audit] = await tx
        .insert(audits)
        .values({
          date: HOY(),
          warehouseId: base.warehouseId,
          responsible: "Prueba",
          status: "COMPLETED",
          userId: base.userId,
        })
        .returning();

      const [item] = await tx
        .insert(auditItems)
        .values({
          auditId: audit.id,
          productId: arroz.id,
          systemQuantity: 50,
          physicalQuantity: 0,
          difference: -50,
        })
        .returning();

      await applyAuditAdjustment(tx, {
        auditId: audit.id,
        auditItemId: item.id,
        product: {
          id: arroz.id,
          code: arroz.code,
          name: arroz.name,
          stockUnit: "BOLSA",
          unitKind: "COUNT",
          netWeightGrams: 500,
          netVolumeMl: null,
          weightIsEstimate: false,
          tracksExpiration: true,
        },
        warehouseId: base.warehouseId,
        systemQuantity: 50,
        physicalQuantity: 0,
        isoDate: HOY(),
        userId: base.userId,
        notes: "Prueba de agotamiento",
      });

      const [agotado] = await tx
        .select({
          available: lots.quantityAvailable,
          status: lots.status,
        })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(agotado.available)).toBe(0);
      expect(agotado.status).toBe("DEPLETED");

      // No aparece en el inventario disponible.
      const disponibles = await listLots(tx, { hasStock: true, pageSize: 100 });
      expect(
        disponibles.items.some((item) => item.id === loteId)
      ).toBe(false);

      // No genera alerta operativa.
      const alertas = await getExpiryAlerts(tx, { horizonDays: 30, limit: 100 });
      expect(alertas.items.some((item) => item.id === loteId)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 9: productos sin peso o sin vencimiento
  // ------------------------------------------------------------------
  it("Escenario 9 — un producto sin peso no inventa un peso total", async () => {
    await enTransaccion(async (tx) => {
      const sinPeso = await crearArroz(tx, "S9", {
        name: "Producto sin peso",
        netWeightGrams: null,
        tracksExpiration: false,
      });

      const antes = await getDashboardSummary(tx);

      await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: sinPeso.id,
          quantity: 120,
          lots: [{ quantity: 120 }],
        },
      ]);

      const despues = await getDashboardSummary(tx);

      // No se suma peso, pero sí unidades de conteo.
      expect(despues.totalWeightKg).toBe(antes.totalWeightKg);
      expect(despues.totalUnits).toBe(antes.totalUnits + 120);
      expect(despues.lotsWithoutNetContent).toBe(antes.lotsWithoutNetContent + 1);
      expect(despues.weightCoveragePercent).toBeLessThan(100);

      // Sin vencimiento y sin control de vencimiento: no hay alerta.
      const alertas = await getExpiryAlerts(tx, { horizonDays: 30, limit: 100 });
      expect(
        alertas.items.some((item) => item.productId === sinPeso.id)
      ).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 10: error y rollback
  // ------------------------------------------------------------------
  it("Escenario 10 — una operación fallida no deja existencias a medias", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S10");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: addDaysIso(HOY(), 30), quantity: 300 }],
        },
      ]);

      const loteId = entry.items[0].lots[0].id;

      // Una entrada con lotes que no cuadran debe fallar entera.
      await expect(
        crearEntrada(tx, base.userId, base.warehouseId, [
          {
            productId: arroz.id,
            quantity: 100,
            lots: [{ expirationDate: addDaysIso(HOY(), 30), quantity: 40 }],
          },
        ])
      ).rejects.toThrow();

      // El lote original sigue intacto.
      const [lote] = await tx
        .select({ available: lots.quantityAvailable })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(lote.available)).toBe(300);

      // Y el inventario agregado también.
      const [stock] = await tx
        .select({ quantity: inventory.quantity })
        .from(inventory)
        .where(
          sql`${inventory.productId} = ${arroz.id} and ${inventory.warehouseId} = ${base.warehouseId}`
        );

      expect(Number(stock.quantity)).toBe(300);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 11: vencimiento obligatorio cuando el producto lo exige
  // ------------------------------------------------------------------
  it("Escenario 11 — no se acepta un lote sin vencimiento si el producto lo exige", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S11");

      await expect(
        crearEntrada(tx, base.userId, base.warehouseId, [
          {
            productId: arroz.id,
            quantity: 100,
            lots: [{ quantity: 100 }],
          },
        ])
      ).rejects.toThrow(/vencimiento/i);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 12: el código externo del proveedor se conserva
  // ------------------------------------------------------------------
  it("Escenario 12 — el código de lote del proveedor se conserva", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S12");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 100,
          lots: [
            { expirationDate: addDaysIso(HOY(), 20), quantity: 100, externalCode: "LOTE-FABRICA-99" },
          ],
        },
      ]);

      expect(entry.items[0].lots[0].externalCode).toBe("LOTE-FABRICA-99");
    });
  });

  // ------------------------------------------------------------------
  // Escenario 13: la suma de los lotes coincide con la cantidad de la línea
  // ------------------------------------------------------------------
  it("Escenario 13 — una línea puede dividir la cantidad en varios lotes", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S13");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 700,
          lots: [
            { expirationDate: "2026-11-01", quantity: 300 },
            { expirationDate: "2026-10-28", quantity: 400 },
          ],
        },
      ]);

      const lotes = entry.items[0].lots;
      expect(lotes).toHaveLength(2);
      expect(lotes[0].quantityReceived + lotes[1].quantityReceived).toBe(700);
      expect(lotes[0].code).not.toBe(lotes[1].code);

      // FEFO elige el que vence antes.
      const { getAvailableLotsForSelection } = await import(
        "@/lib/services/lot.service"
      );

      const disponibles = await getAvailableLotsForSelection(tx, {
        productId: arroz.id,
        warehouseId: base.warehouseId,
      });

      expect(disponibles[0].expirationDate).toBe("2026-10-28");
    });
  });

  // ------------------------------------------------------------------
  // Escenario 14: un lote vencido no se despacha
  // ------------------------------------------------------------------
  it("Escenario 14 — un lote vencido no se despacha automáticamente", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S14");

      const ayer = addDaysIso(HOY(), -1);

      await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 100,
          lots: [{ expirationDate: ayer, quantity: 100 }],
        },
      ]);

      const { findAvailableLotsFefo } = await import(
        "@/lib/services/lot.service"
      );

      await expect(
        findAvailableLotsFefo(tx, {
          productId: arroz.id,
          warehouseId: base.warehouseId,
          quantity: 10,
        })
      ).rejects.toThrow(/lote/i);

      // Pero sí aparece identificado como vencido en las alertas.
      const alertas = await getExpiryAlerts(tx, { horizonDays: 30, limit: 100 });
      const vencido = alertas.items.find(
        (item) => item.productId === arroz.id
      );

      expect(vencido).toBeDefined();
      expect(vencido!.expirationStatus).toBe("EXPIRED");
      expect(alertas.expiredCount).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // Escenario 15: auditoría con conteo por lote
  // ------------------------------------------------------------------
  it("Escenario 15 — la auditoría por lote ajusta el lote indicado", async () => {
    await enTransaccion(async (tx) => {
      const arroz = await crearArroz(tx, "S15");

      const entry = await crearEntrada(tx, base.userId, base.warehouseId, [
        {
          productId: arroz.id,
          quantity: 300,
          lots: [{ expirationDate: addDaysIso(HOY(), 30), quantity: 300 }],
        },
      ]);

      const loteId = entry.items[0].lots[0].id;

      const { applyAuditAdjustment } = await import("@/lib/services/lot.service");
      const { auditItems, audits, auditItemLots } = await import(
        "@/lib/db/schema"
      );

      const [audit] = await tx
        .insert(audits)
        .values({
          date: HOY(),
          warehouseId: base.warehouseId,
          responsible: "Prueba",
          status: "COMPLETED",
          userId: base.userId,
        })
        .returning();

      const [item] = await tx
        .insert(auditItems)
        .values({
          auditId: audit.id,
          productId: arroz.id,
          systemQuantity: 300,
          physicalQuantity: 250,
          difference: -50,
        })
        .returning();

      await applyAuditAdjustment(tx, {
        auditId: audit.id,
        auditItemId: item.id,
        product: {
          id: arroz.id,
          code: arroz.code,
          name: arroz.name,
          stockUnit: "BOLSA",
          unitKind: "COUNT",
          netWeightGrams: 500,
          netVolumeMl: null,
          weightIsEstimate: false,
          tracksExpiration: true,
        },
        warehouseId: base.warehouseId,
        systemQuantity: 300,
        physicalQuantity: 250,
        isoDate: HOY(),
        userId: base.userId,
        notes: "Conteo por lote",
        lotCounts: [{ lotId: loteId, physicalQuantity: 250 }],
      });

      // El lote refleja exactamente lo contado.
      const [lote] = await tx
        .select({ available: lots.quantityAvailable })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(lote.available)).toBe(250);

      // La cantidad anterior, la contada y la diferencia quedan registradas.
      const [detalle] = await tx
        .select({
          system: auditItemLots.systemQuantity,
          physical: auditItemLots.physicalQuantity,
          difference: auditItemLots.difference,
        })
        .from(auditItemLots)
        .where(eq(auditItemLots.auditItemId, item.id));

      expect(Number(detalle.system)).toBe(300);
      expect(Number(detalle.physical)).toBe(250);
      expect(Number(detalle.difference)).toBe(-50);

      // El peso disponible se recalcula sobre las unidades restantes.
      const peso = await tx
        .select({
          weight: sql<number>`round((${lots.quantityAvailable} * coalesce(${lots.netWeightGrams}, 0) / 1000)::numeric, 3)`,
        })
        .from(lots)
        .where(eq(lots.id, loteId));

      expect(Number(peso[0].weight)).toBe(125);
    });
  });
});
