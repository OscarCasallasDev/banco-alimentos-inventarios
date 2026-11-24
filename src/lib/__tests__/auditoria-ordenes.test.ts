/** Pruebas de auditoría de órdenes de pedido. */

import { describe, it, expect, afterAll } from "vitest";
import { getDb, closeDb, type DbTransaction } from "@/lib/db/client";
import { createUser } from "@/lib/services/user.service";
import {
  diffSalida,
  listOrderAudit,
  orderSnapshot,
  recordOrderAudit,
  updateOrderAuditNumber,
} from "@/lib/services/order-audit.service";
import type { SalidaDetail } from "@/lib/services/exit.service";

function salida(
  overrides: Partial<Record<string, unknown>> = {}
): SalidaDetail {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    number: "OP-2026-001",
    status: "DRAFT",
    programName: "Grupos de Familia",
    destinationName: "Parroquia A",
    notes: null,
    totalQuantity: 10,
    itemCount: 1,
    items: [
      {
        productId: "11111111-1111-1111-1111-111111111111",
        productCode: "001-0001-000001",
        productName: "Arroz",
        quantity: 10,
        unitCode: "UND",
        siigoBodegaCode: 1,
        expirationDate: "2027-01-01",
      },
    ],
    ...overrides,
  } as unknown as SalidaDetail;
}

describe("Diferencias de una orden", () => {
  it("registra solo los campos que cambian", () => {
    const before = salida();
    const after = salida({
      destinationName: "Parroquia B",
      items: [
        {
          productId: "11111111-1111-1111-1111-111111111111",
          productCode: "001-0001-000001",
          productName: "Arroz",
          quantity: 15,
          unitCode: "UND",
          siigoBodegaCode: 2,
          expirationDate: "2027-01-01",
        },
      ],
    });

    const changes = diffSalida(before, after);
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "Destino", before: "Parroquia A", after: "Parroquia B" },
        { field: "Cantidad de Arroz", before: "10", after: "15" },
        { field: "Bodega de Arroz", before: "1", after: "2" },
      ])
    );
    expect(changes.some((change) => change.field === "Programa")).toBe(false);
  });

  it("detecta productos agregados y eliminados", () => {
    const before = salida();
    const after = salida({
      items: [
        {
          productId: "22222222-2222-2222-2222-222222222222",
          productCode: "001-0001-000002",
          productName: "Aceite",
          quantity: 4,
          unitCode: "UND",
          siigoBodegaCode: 1,
          expirationDate: null,
        },
      ],
    });

    const changes = diffSalida(before, after);
    expect(changes.map((change) => change.field)).toContain("Producto agregado");
    expect(changes.map((change) => change.field)).toContain("Producto eliminado");
  });

  it("guarda en la instantánea los datos principales de la orden", () => {
    const snapshot = orderSnapshot(salida());
    expect(snapshot.orderNumber).toBe("OP-2026-001");
    expect(snapshot.destination).toBe("Parroquia A");
  });
});

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

class RollbackSignal extends Error {
  constructor(public readonly result: unknown) {
    super("rollback");
  }
}

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

describeDb("Persistencia de auditoría de órdenes", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("registra creación, edición y eliminación y las consulta por filtros", async () => {
    await enTransaccion(async (tx) => {
      const actor = await createUser(tx, {
        firstName: "Óscar",
        lastName: "Casallas",
        cedula: "444444444",
        password: "Banco2026!",
        role: "SUPERADMIN",
        modules: [],
      });

      const orderId = "99999999-9999-9999-9999-999999999999";
      for (const action of ["CREO", "EDITO", "ELIMINO"] as const) {
        const number = action === "CREO" ? "BORRADOR-123" : "OP-2026-001";
        await recordOrderAudit(tx, {
          userId: actor.id,
          action,
          orderId,
          orderNumber: number,
          actorName: "Óscar Casallas",
          summary: `Óscar Casallas ${action.toLowerCase()} la orden ${number}`,
          snapshot: orderSnapshot({
            ...salida(),
            number,
          } as SalidaDetail),
        });
      }

      const todos = await listOrderAudit(tx, { userId: actor.id });
      expect(todos.total).toBe(3);
      expect(new Set(todos.items.map((item) => item.action))).toEqual(
        new Set(["CREO", "EDITO", "ELIMINO"])
      );
      const creacion = todos.items.find((item) => item.action === "CREO");
      expect(creacion?.details.orderNumber).toBe("BORRADOR-123");

      const soloCreacion = await listOrderAudit(tx, {
        userId: actor.id,
        action: "CREO",
      });
      expect(soloCreacion.total).toBe(1);
      expect(soloCreacion.items[0].details.actorName).toBe("Óscar Casallas");

      // Al generar la orden, el registro de creación recibe el número OP.
      await updateOrderAuditNumber(tx, orderId, "OP-2026-001");
      const generada = await listOrderAudit(tx, {
        userId: actor.id,
        action: "CREO",
      });
      expect(generada.items[0].details.orderNumber).toBe("OP-2026-001");
      expect(generada.items[0].details.summary).toContain("OP-2026-001");
    });
  });
});
