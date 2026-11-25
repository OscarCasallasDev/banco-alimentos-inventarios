/** Pruebas específicas de destinos personalizados. */

import { describe, it, expect, afterAll } from "vitest";
import { getDb, closeDb, type DbTransaction } from "@/lib/db/client";
import { findOrCreateDestinationByName } from "@/lib/services/destination.service";

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

describeDb("Destinos personalizados", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("crea un destino nuevo y lo deja disponible en el catálogo", async () => {
    await enTransaccion(async (tx) => {
      const destino = await findOrCreateDestinationByName(
        "Parroquia Milagro de Dios",
        tx
      );
      expect(destino.name).toBe("Parroquia Milagro de Dios");
      expect(destino.type).toBe("PARROQUIA");
      expect(destino.id).toBeTruthy();
    });
  });

  it("reutiliza el destino ignorando mayúsculas y espacios repetidos", async () => {
    await enTransaccion(async (tx) => {
      const primero = await findOrCreateDestinationByName(
        "Parroquia Milagro de Dios",
        tx
      );
      const segundo = await findOrCreateDestinationByName(
        "  parroquia   MILAGRO de dios ",
        tx
      );
      expect(segundo.id).toBe(primero.id);
      expect(segundo.name).toBe("Parroquia Milagro de Dios");
    });
  });
});
