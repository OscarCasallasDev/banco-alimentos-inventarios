/**
 * Pruebas de integración — Importación manual del reporte resumen de Siigo
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Importa un Excel de prueba controlado (en memoria) con el flujo REAL de la
 * aplicación y comprueba que:
 *   - Las existencias son Σ(entradas) − Σ(salidas) por producto y bodega.
 *   - El inventario y las órdenes de pedido muestran lo mismo.
 *   - Reimportar el mismo archivo no duplica existencias ni bodegas.
 *
 * El estado real del catálogo se restaura al terminar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/lib/db/client";
import { warehouses, siigoBalances, siigoLocations } from "@/lib/db/schema";
import { parseResumenReport } from "@/lib/siigo/import/resumen-parser";
import {
  createRun,
  saveResumenRows,
  finalizeRun,
} from "@/lib/services/siigo-import.service";
import {
  listConsolidatedStock,
  getConsolidatedStock,
} from "@/lib/services/stock.service";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

const HEADERS = [
  "BODEGA", "BODEGA", "DESCRIPCION", "UBICACION", "UBICACION", "DESCRIPCION",
  "PRODUCTO", "DESCRIPCION", "CANTIDAD ENTRADAS", "CANTIDAD-2 ENTRADAS",
  "VALOR ENTRADAS", "CANTIDAD SALIDAS", "CANTIDAD-2 SALIDAS", "VALOR SALIDAS", "",
];

/** Código de producto de prueba (con ceros iniciales) y bodega de prueba. */
const COD_A = "099000900001";
const COD_B = "099000900002";
const NOMBRE = "PRUEBA IMPORTACION SIIGO";
const BODEGA = 7;

function texto(valor: string) {
  return { t: "s" as const, v: valor };
}

function construirReporte(filas: unknown[][]): { buffer: Buffer; sha256: string } {
  const completas: unknown[][] = [
    ["RESUMEN DE MOVIMIENTO POR BODEGA"],
    ["Reporte de prueba"],
    [],
    ["De : ENE 1/2026  A : NOV 30/2026"],
    ["Procesado en: 2026-11-19 10:00:00"],
    [],
    HEADERS,
    ...filas,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(completas as string[][]);
  XLSX.utils.book_append_sheet(wb, ws, "Informe");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** Filas del archivo de prueba (los 3 casos del Banco). */
const FILAS = [
  // Producto A, bodega 7: 90 entradas y 122 salidas -> -32
  ["0007 PRINCIPAL", 7, texto("PRINCIPAL PRUEBA"), texto("U1"), 1, texto("Estante 1"), texto(COD_A), texto(NOMBRE), 90, 0, 0, 116, 0, 0, 0],
  ["0007 PRINCIPAL", 7, texto("CAMPAÑA PRUEBA"), texto("U4"), 4, texto("Estante 4"), texto(COD_A), texto(NOMBRE), 0, 0, 0, 6, 0, 0, 0],
  // Producto B, misma descripción y misma bodega: 25 disponibles
  ["0007 PRINCIPAL", 7, texto("PRINCIPAL PRUEBA"), texto("U1"), 1, texto("Estante 1"), texto(COD_B), texto(NOMBRE), 25, 0, 0, 0, 0, 0, 0],
];

describeDb("Importación manual del reporte resumen de Siigo", () => {
  let sha256 = "";
  let runId = "";
  /** Estado real del catálogo, para restaurarlo al terminar. */
  let nombresPrevios: { siigoCode: number; name: string; aliasNames: string | null }[] = [];
  let balancesPrevios: { id: string }[] = [];
  let ubicacionesPrevias: {
    siigoBodegaCode: number;
    locationCode: number;
    name: string;
    importRunId: string;
  }[] = [];

  beforeAll(async () => {
    const db = getDb();

    // Estado previo que se restaura al terminar.
    const prev = await db
      .select({
        siigoCode: warehouses.siigoCode,
        name: warehouses.name,
        aliasNames: warehouses.aliasNames,
      })
      .from(warehouses)
      .where(sql`${warehouses.siigoCode} is not null`);

    nombresPrevios = prev.filter(
      (row): row is { siigoCode: number; name: string; aliasNames: string | null } =>
        row.siigoCode !== null
    );

    const bal = await db
      .select({ id: siigoBalances.id })
      .from(siigoBalances)
      .where(
        sql`${siigoBalances.isActive} and ${siigoBalances.locationCode} <> 0 and ${siigoBalances.siigoBodegaCode} = ${BODEGA}`
      );
    balancesPrevios = bal;

    // Ubicaciones de la bodega de prueba (la importación las sobrescribe).
    const locs = await db
      .select({
        siigoBodegaCode: siigoLocations.siigoBodegaCode,
        locationCode: siigoLocations.locationCode,
        name: siigoLocations.name,
        importRunId: siigoLocations.importRunId,
      })
      .from(siigoLocations)
      .where(eq(siigoLocations.siigoBodegaCode, BODEGA));

    ubicacionesPrevias = locs.filter(
      (row): row is {
        siigoBodegaCode: number;
        locationCode: number;
        name: string;
        importRunId: string;
      } => row.importRunId !== null
    );

    const reporte = construirReporte(FILAS);
    sha256 = reporte.sha256;

    const parsed = parseResumenReport(reporte.buffer);
    expect(parsed.rows.length).toBe(3);

    const run = await createRun(
      {
        fileSha256: sha256,
        fileName: "prueba-importacion-siigo.xlsx",
        fileSize: reporte.buffer.length,
        source: "MANUAL",
      },
      null
    );
    runId = run.id;

    await saveResumenRows(runId, parsed.rows);
    await finalizeRun(runId);
  });

  afterAll(async () => {
    const db = getDb();

    // Cada paso va protegido: si uno falla, los demás siguen restaurando.
    const pasos: Array<() => Promise<unknown>> = [
      // Movimientos de resumen del producto de prueba.
      () =>
        db.execute(sql`
          DELETE FROM siigo_resumen_movements
          WHERE product_id IN (SELECT id FROM products WHERE code IN (${COD_A}, ${COD_B}))
        `),
      // Existencias del producto de prueba.
      () =>
        db.execute(sql`
          DELETE FROM siigo_balances
          WHERE product_id IN (SELECT id FROM products WHERE code IN (${COD_A}, ${COD_B}))
        `),
      () =>
        db.execute(sql`
          DELETE FROM products WHERE code IN (${COD_A}, ${COD_B})
        `),
      // Se restaura el detalle por ubicación que la importación apartó.
      async () => {
        if (balancesPrevios.length === 0) return;
        await db
          .update(siigoBalances)
          .set({ isActive: true })
          .where(inArray(siigoBalances.id, balancesPrevios.map((b) => b.id)));
      },
      // Se restauran las ubicaciones de las bodegas tocadas.
      async () => {
        for (const row of ubicacionesPrevias) {
          await db
            .update(siigoLocations)
            .set({ name: row.name, importRunId: row.importRunId })
            .where(
              sql`${siigoLocations.siigoBodegaCode} = ${row.siigoBodegaCode} and ${siigoLocations.locationCode} = ${row.locationCode}`
            );
        }
        // Las ubicaciones nuevas creadas por la prueba se eliminan.
        await db.execute(sql`
          DELETE FROM siigo_locations
          WHERE import_run_id = ${runId}::uuid
        `);
      },
      // Se restauran los nombres y los alias de las bodegas.
      async () => {
        for (const row of nombresPrevios) {
          await db
            .update(warehouses)
            .set({ name: row.name, aliasNames: row.aliasNames })
            .where(eq(warehouses.siigoCode, row.siigoCode));
        }
      },
      () => db.execute(sql`DELETE FROM siigo_import_runs WHERE file_sha256 = ${sha256}`),
      () => db.execute(sql`REFRESH MATERIALIZED VIEW mv_stock_consolidated`),
    ];

    for (const paso of pasos) {
      try {
        await paso();
      } catch (error) {
        console.error("No se pudo restaurar:", error);
      }
    }

    await closeDb();
  });

  it("guarda la existencia como suma de entradas menos suma de salidas", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT sb.quantity, sb.siigo_bodega_code, sb.location_code, p.code
      FROM siigo_balances sb
      JOIN products p ON p.id = sb.product_id
      WHERE p.code = ${COD_A} AND sb.is_active
    `);
    const fila = (rows as unknown as { quantity: string; siigo_bodega_code: number; location_code: number; code: string }[])[0];

    expect(fila).toBeDefined();
    // 90 entradas − 122 salidas = −32
    expect(Number(fila.quantity)).toBe(-32);
    expect(fila.siigo_bodega_code).toBe(BODEGA);
    // Las ubicaciones se ignoran: una sola existencia por bodega.
    expect(fila.location_code).toBe(0);
  });

  it("mantiene separados los productos con códigos distintos", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT p.code, sb.quantity FROM siigo_balances sb
      JOIN products p ON p.id = sb.product_id
      WHERE p.code IN (${COD_A}, ${COD_B}) AND sb.is_active
      ORDER BY p.code
    `);
    const lista = rows as unknown as { code: string; quantity: string }[];

    expect(lista).toHaveLength(2);
    expect(Number(lista.find((r) => r.code === COD_A)?.quantity)).toBe(-32);
    expect(Number(lista.find((r) => r.code === COD_B)?.quantity)).toBe(25);
  });

  it("el inventario muestra la existencia calculada", async () => {
    const resultado = await listConsolidatedStock({
      search: COD_A,
      page: 0,
      pageSize: 20,
    });
    const item = resultado.items.find((i) => i.representativeCode === COD_A);

    expect(item).toBeDefined();
    expect(item!.quantity).toBe(-32);
    expect(item!.available).toBe(-32);
    // Con existencia negativa no se puede agregar a una orden.
    expect(item!.canAdd).toBe(false);
  });

  it("las órdenes de pedido muestran la misma disponibilidad", async () => {
    const stock = await getConsolidatedStock(COD_A, BODEGA);

    expect(stock).not.toBeNull();
    expect(stock!.quantity).toBe(-32);
    expect(stock!.available).toBe(-32);
  });

  it("reimportar el mismo archivo no duplica existencias ni bodegas", async () => {
    const db = getDb();

    const antes = await db.execute(sql`
      SELECT count(*)::int AS n FROM siigo_balances sb
      JOIN products p ON p.id = sb.product_id
      WHERE p.code IN (${COD_A}, ${COD_B}) AND sb.is_active
    `);
    const bodegasAntes = await db.execute(sql`
      SELECT count(*)::int AS n FROM warehouses WHERE siigo_code IS NOT NULL
    `);

    // Segunda importación del MISMO archivo (mismo hash).
    const run = await createRun(
      {
        fileSha256: sha256,
        fileName: "prueba-importacion-siigo.xlsx",
        fileSize: 1,
        source: "MANUAL",
      },
      null
    );
    expect(run.alreadyProcessed).toBe(true);

    const despues = await db.execute(sql`
      SELECT count(*)::int AS n FROM siigo_balances sb
      JOIN products p ON p.id = sb.product_id
      WHERE p.code IN (${COD_A}, ${COD_B}) AND sb.is_active
    `);
    const bodegasDespues = await db.execute(sql`
      SELECT count(*)::int AS n FROM warehouses WHERE siigo_code IS NOT NULL
    `);

    expect((despues as unknown as { n: number }[])[0].n).toBe(
      (antes as unknown as { n: number }[])[0].n
    );
    expect((bodegasDespues as unknown as { n: number }[])[0].n).toBe(
      (bodegasAntes as unknown as { n: number }[])[0].n
    );
  });

  it("una bodega con varios nombres sigue siendo una sola bodega", async () => {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n, max(alias_names) AS alias
      FROM warehouses WHERE siigo_code = ${BODEGA}
    `);
    const fila = (rows as unknown as { n: number; alias: string | null }[])[0];

    // Una sola bodega para el código 7, con sus nombres asociados.
    expect(fila.n).toBe(1);
    expect(fila.alias).toContain("PRINCIPAL PRUEBA");
    expect(fila.alias).toContain("CAMPAÑA PRUEBA");
  });
});
