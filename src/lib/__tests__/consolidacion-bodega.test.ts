/**
 * Pruebas — Consolidación por código de producto y bodega numérica
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Verifica que las existencias se consolidan por CÓDIGO de producto y
 * NÚMERO de bodega (columna B del reporte de Siigo), ignorando los rótulos
 * textuales de las columnas A y C.
 *
 * Las pruebas de consolidation usan un caso controlado: se insertan
 * productos y saldos de prueba, se refresca la vista materializada, se
 * comprueba y se limpia todo al terminar.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "@/lib/db/client";
import { products, siigoBalances } from "@/lib/db/schema";
import {
  consolidatedGroupKey,
  listConsolidatedStock,
  listWarehouseOptionsForProduct,
  getConsolidatedStock,
} from "@/lib/services/stock.service";

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

/** Código de producto con ceros iniciales (no debe perderlos). */
const COD_A = "001000900001";
const COD_B = "002000900001";
/** Mismo nombre, códigos distintos: NO deben unirse. */
const NOMBRE = "PRUEBA CONSOLIDACION BODEGA";
const BODEGA_A = 1;
const BODEGA_B = 2;

async function limpiar() {
  const db = getDb();
  await db.execute(sql`
    DELETE FROM siigo_balances
    WHERE product_id IN (
      SELECT id FROM products WHERE code IN (${COD_A}, ${COD_B})
    )
  `);
  await db.execute(sql`
    DELETE FROM products WHERE code IN (${COD_A}, ${COD_B})
  `);
  await db.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_consolidated`);
}

describeDb("Consolidación por código de producto y bodega numérica", () => {
  beforeAll(async () => {
    const db = getDb();

    await limpiar();

    const [prodA] = await db
      .insert(products)
      .values({
        code: COD_A,
        name: NOMBRE,
        unit: "UND",
        stockUnit: "UND",
        weight: 0,
      })
      .returning({ id: products.id });

    const [prodB] = await db
      .insert(products)
      .values({
        code: COD_B,
        name: NOMBRE,
        unit: "UND",
        stockUnit: "UND",
        weight: 0,
      })
      .returning({ id: products.id });

    // El MISMO producto (código A) en la bodega 1, repartido en dos
    // ubicaciones (como si el Excel trajera rótulos textuales distintos).
    await db.insert(siigoBalances).values([
      {
        productId: prodA.id,
        siigoBodegaCode: BODEGA_A,
        locationCode: 1,
        quantity: 50,
        openingQuantity: 50,
        reportedQuantity: 50,
        importRunId: await runDePrueba(),
      },
      {
        productId: prodA.id,
        siigoBodegaCode: BODEGA_A,
        locationCode: 4,
        quantity: 50,
        openingQuantity: 50,
        reportedQuantity: 50,
        importRunId: await runDePrueba(),
      },
      // El mismo producto en OTRA bodega: debe quedar separado.
      {
        productId: prodB.id,
        siigoBodegaCode: BODEGA_B,
        locationCode: 1,
        quantity: 30,
        openingQuantity: 30,
        reportedQuantity: 30,
        importRunId: await runDePrueba(),
      },
      // Producto con el MISMO nombre pero otro código: no debe unirse.
      {
        productId: prodB.id,
        siigoBodegaCode: BODEGA_A,
        locationCode: 1,
        quantity: 20,
        openingQuantity: 20,
        reportedQuantity: 20,
        importRunId: await runDePrueba(),
      },
    ]);

    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_consolidated`);
  });

  afterAll(async () => {
    await limpiar();
    await closeDb();
  });

  it("consolida las ubicaciones de la misma bodega numérica", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT quantity, location_count, product_count
      FROM mv_stock_consolidated
      WHERE representative_code = ${COD_A} AND siigo_bodega_code = ${BODEGA_A}
    `);
    const row = (rows as unknown as Record<string, number>[])[0];

    expect(Number(row.quantity)).toBe(100); // 50 + 50
    expect(Number(row.location_count)).toBe(2);
    expect(Number(row.product_count)).toBe(1);
  });

  it("mantiene separado el mismo producto en bodegas diferentes", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT siigo_bodega_code, quantity
      FROM mv_stock_consolidated
      WHERE representative_code = ${COD_B}
      ORDER BY siigo_bodega_code
    `);
    const lista = rows as unknown as { siigo_bodega_code: number; quantity: string }[];

    expect(lista).toHaveLength(2);
    // Bodega 1: 20 (producto B). Bodega 2: 30 (producto B). No se suman.
    expect(Number(lista.find((r) => r.siigo_bodega_code === BODEGA_A)?.quantity)).toBe(20);
    expect(Number(lista.find((r) => r.siigo_bodega_code === BODEGA_B)?.quantity)).toBe(30);
  });

  it("no une productos con códigos distintos aunque tengan el mismo nombre", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM mv_stock_consolidated
      WHERE description = ${NOMBRE}
    `);
    expect(Number((rows as unknown as { n: number }[])[0].n)).toBe(3);
  });

  it("conserva los ceros iniciales del código de producto", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT DISTINCT representative_code FROM mv_stock_consolidated
      WHERE representative_code LIKE '%900001%'
    `);
    const codigos = (rows as unknown as { representative_code: string }[]).map(
      (r) => r.representative_code
    );
    expect(codigos).toContain(COD_A);
    expect(codigos).toContain(COD_B);
    expect(codigos.every((c) => c.startsWith("00"))).toBe(true);
  });

  it("calcula los indicadores de positivas, cero y negativas", async () => {
    const resultado = await listConsolidatedStock({ page: 0, pageSize: 5 });
    const t = resultado.totals;

    expect(t.groups).toBe(resultado.total);
    expect(t.positive + t.zero + t.negative).toBe(t.groups);
    expect(t.negative).toBeGreaterThan(0); // el Banco tiene saldos negativos
  });

  it("filtra por cada una de las siete bodegas", async () => {
    for (const bodega of [1, 2, 3, 4, 5, 6, 7]) {
      const resultado = await listConsolidatedStock({
        siigoBodegaCode: bodega,
        page: 0,
        pageSize: 10,
      });
      for (const item of resultado.items) {
        expect(item.siigoBodegaCode).toBe(bodega);
      }
    }
  });

  it("busca por descripción y por código", async () => {
    const porDescripcion = await listConsolidatedStock({
      search: NOMBRE,
      page: 0,
      pageSize: 20,
    });
    expect(porDescripcion.items.length).toBeGreaterThan(0);

    const porCodigo = await listConsolidatedStock({
      search: COD_A,
      page: 0,
      pageSize: 20,
    });
    expect(porCodigo.items.length).toBeGreaterThan(0);
    expect(
      porCodigo.items.every((i) => i.representativeCode === COD_A)
    ).toBe(true);
  });

  it("ofrece solo las bodegas donde el producto tiene existencia", async () => {
    const opciones = await listWarehouseOptionsForProduct(COD_B);
    const bodegas = opciones.map((o) => o.siigoBodegaCode).sort();

    expect(bodegas).toEqual([BODEGA_A, BODEGA_B]);
    expect(bodegas).not.toContain(7);
  });

  it("la disponibilidad depende de la bodega seleccionada", async () => {
    const bodega1 = await getConsolidatedStock(COD_A, BODEGA_A);
    const bodega2 = await getConsolidatedStock(COD_A, BODEGA_B);

    expect(bodega1).not.toBeNull();
    expect(bodega1!.available).toBe(100);
    // El producto A no está en la bodega 2.
    expect(bodega2).toBeNull();
  });

  it("inventario y órdenes muestran la misma disponibilidad", async () => {
    const existencias = await listConsolidatedStock({
      search: COD_A,
      page: 0,
      pageSize: 20,
    });
    const item = existencias.items.find((i) => i.representativeCode === COD_A)!;
    const porBodega = await getConsolidatedStock(COD_A, item.siigoBodegaCode);

    expect(porBodega).not.toBeNull();
    expect(porBodega!.available).toBe(item.available);
  });

  it("la clave de grupo es código de producto y bodega", () => {
    expect(consolidatedGroupKey(COD_A, BODEGA_A)).toBe(`${COD_A}|${BODEGA_A}`);
    expect(consolidatedGroupKey(COD_A, BODEGA_A)).not.toContain(NOMBRE);
  });
});

/** Devuelve el identificador de la última corrida de importación. */
async function runDePrueba(): Promise<string> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT id FROM siigo_import_runs ORDER BY created_at DESC LIMIT 1
  `);
  return (rows as unknown as { id: string }[])[0].id;
}
