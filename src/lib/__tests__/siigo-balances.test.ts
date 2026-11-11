/**
 * Pruebas del cálculo de saldos y de la validación de filas,
 * contra el archivo REAL de Siigo Pyme del Banco.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSiigoReport } from "@/lib/siigo/import/parser";
import {
  computeGroupBalances,
  sumByProduct,
  sumByWarehouse,
} from "@/lib/siigo/import/balances";
import { validateRows } from "@/lib/siigo/import/validator";

const FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "siigo-reporte-inventarios.xlsx"
);
const HAS_FIXTURE = existsSync(FIXTURE);

describe("Cálculo de saldos (archivo real)", () => {
  let rows: ReturnType<typeof parseSiigoReport>["rows"];

  beforeAll(() => {
    if (!HAS_FIXTURE) return;
    const buffer = readFileSync(FIXTURE);
    rows = parseSiigoReport(buffer).rows;
  }, 120_000);

  it("7. Calcula el saldo por producto, bodega y ubicación", () => {
    if (!HAS_FIXTURE) return;
    const computation = computeGroupBalances(rows);

    // 5.529 grupos (producto, bodega, ubicación) en el archivo real.
    expect(computation.balances).toHaveLength(5_529);

    // 5.527 grupos son consistentes: saldo recalculado == ACUM reportado.
    expect(computation.stats.groupsConsistent).toBe(5_527);
    // Y 2 quedan en revisión: la fila corrupta 4024 afecta tanto a su propio
    // grupo (001-0001-000043 | 46244 | 1) como al grupo real al que
    // pertenecía (001-0001-000043 | 1 | 4). La diferencia es de 2.600.
    expect(computation.stats.groupsUnderReview).toBe(2);

    const underReview = computation.balances.filter((b) => b.reviewRequired);
    expect(underReview).toHaveLength(2);
    const keys = underReview.map(
      (b) => `${b.productCode}|${b.bodega}|${b.ubicacion}`
    );
    expect(keys).toContain("001-0001-000043|1|4");
    expect(keys).toContain("001-0001-000043|46244|1");
    for (const group of underReview) {
      expect(group.reviewNote).toContain("no coincide");
      expect(Math.abs(group.difference)).toBe(2_600);
    }
  });

  it("El saldo se obtiene recalculando, no sumando ACUM CANTIDAD", () => {
    if (!HAS_FIXTURE) return;
    const computation = computeGroupBalances(rows);

    // Tomar el último ACUM de cada grupo debe dar el mismo resultado...
    const byLastAccum = new Map<string, number>();
    for (const row of rows) {
      byLastAccum.set(
        `${row.productCode}|${row.bodega}|${row.ubicacion}`,
        row.qtyAccum
      );
    }
    for (const group of computation.balances) {
      // Salvo los grupos marcados para revisión, que es justo lo que el
      // contraste debe detectar.
      if (group.reviewRequired) continue;
      const key = `${group.productCode}|${group.bodega}|${group.ubicacion}`;
      expect(group.calculatedQuantity).toBeCloseTo(byLastAccum.get(key)!, 3);
    }

    // ...pero SUMAR todos los ACUM daría un resultado absurmente distinto:
    // esa es exactamente la duplicación que hay que evitar.
    const naiveSum = [...byLastAccum.values()].reduce((a, b) => a + b, 0);
    const realTotal = sumByProduct(computation.balances);
    const productTotal = [...realTotal.values()].reduce((a, b) => a + b, 0);
    expect(Math.abs(naiveSum)).toBeGreaterThan(Math.abs(productTotal));
  });

  it("Conserva la desagregación por bodega", () => {
    if (!HAS_FIXTURE) return;
    const computation = computeGroupBalances(rows);
    const byWarehouse = sumByWarehouse(computation.balances);

    // 7 bodegas de Siigo con movimientos (más la corrupta, que se valida aparte).
    expect(byWarehouse.size).toBeGreaterThanOrEqual(7);
    expect(byWarehouse.has(1)).toBe(true);
    expect(byWarehouse.has(7)).toBe(true);

    // El total consolidado es la suma de las bodegas, no al revés.
    const consolidated = [...byWarehouse.values()].reduce((a, b) => a + b, 0);
    const sumOfGroups = computation.balances.reduce(
      (a, g) => a + g.calculatedQuantity,
      0
    );
    expect(consolidated).toBeCloseTo(sumOfGroups, 2);
  });

  it("Detecta los saldos negativos sin ocultarlos", () => {
    if (!HAS_FIXTURE) return;
    const computation = computeGroupBalances(rows);
    // 340 grupos con saldo final negativo en el archivo real.
    expect(computation.stats.negativeGroups).toBe(340);
  });

  it("Respeta la hoja FÓRMULAS: ACUM es acumulado, no saldo a sumar", () => {
    if (!HAS_FIXTURE) return;
    // Verificación directa sobre un grupo grande: el ACUM corre y el saldo
    // final coincide con CANT. ANTERIOR + Σ(ENTRADAS − SALIDAS).
    const computation = computeGroupBalances(rows);
    const big = computation.balances.find(
      (g) => g.productCode === "001-0001-000001" && g.bodega === 1 && g.ubicacion === 1
    );
    expect(big).toBeDefined();
    expect(big!.openingQuantity).toBe(28);
    expect(big!.calculatedQuantity).toBeCloseTo(3, 3);
    expect(big!.reviewRequired).toBe(false);
  });
});

describe("Validación de filas (archivo real)", () => {
  let rows: ReturnType<typeof parseSiigoReport>["rows"];

  beforeAll(() => {
    if (!HAS_FIXTURE) return;
    const buffer = readFileSync(FIXTURE);
    rows = parseSiigoReport(buffer).rows;
  }, 120_000);

  it("Rechaza la fila corrupta del archivo real y acepta el resto", () => {
    if (!HAS_FIXTURE) return;
    const result = validateRows(rows);

    // 1 sola fila rechazada: la 4024 (fecha movida a la columna DOCUMENTO,
    // documento vacío y bodega 46244). Genera 3 códigos de rechazo.
    const rejectedRows = new Set(result.rejections.map((r) => r.rowNumber));
    expect(rejectedRows.size).toBe(1);
    expect(result.rejections[0].rowNumber).toBe(4_024);

    const codes = result.rejections.map((r) => r.code);
    expect(codes).toContain("FECHA_INVALIDA");
    expect(codes).toContain("DOCUMENTO_INVALIDO");
    expect(codes).toContain("BODEGA_INVALIDA");

    expect(result.accepted).toHaveLength(65_831);
    expect(result.accepted.length + rejectedRows.size).toBe(rows.length);
  });

  it("No rechaza ninguna fila por unidades incompletas (solo avisa)", () => {
    if (!HAS_FIXTURE) return;
    const result = validateRows(rows);
    const unitWarnings = result.warnings.filter((w) => w.code === "UNIDAD_VACIA");
    // 1.896 filas sin UNIDAD en el archivo real: solo avisan.
    expect(unitWarnings.length).toBe(1_896);
    // Las advertencias no rechazan filas.
    const rejectedRows = new Set(result.rejections.map((r) => r.rowNumber));
    expect(result.accepted.length + rejectedRows.size).toBe(rows.length);
  });
});
