/**
 * Pruebas unitarias — Filtros de consulta de lotes
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Verifica que el reporte y la pantalla de lotes devuelvan EXACTAMENTE las
 * mismas filas: el constructor de filtros es compartido.
 */

import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildLotConditions } from "@/lib/services/lot.service";

const HOY = "2026-10-27";

const dialect = new PgDialect();

/**
 * Traduce las condiciones de Drizzle a SQL legible para las aserciones.
 */
function toSql(conditions: unknown[]): string {
  return conditions
    .map((condition) => {
      const query = dialect.sqlToQuery(
        condition as Parameters<PgDialect["sqlToQuery"]>[0]
      );
      return `${query.sql} ${query.params.join(",")}`;
    })
    .join(" ");
}

describe("buildLotConditions", () => {
  it("por defecto deja solo los lotes con existencia", () => {
    const conditions = buildLotConditions({}, HOY);
    expect(conditions).toHaveLength(1);
    expect(toSql(conditions)).toContain("quantity_available");
  });

  it("filtra por producto y bodega", () => {
    const sql = toSql(
      buildLotConditions(
        {
          productId: "11111111-1111-1111-1111-111111111111",
          warehouseId: "22222222-2222-2222-2222-222222222222",
        },
        HOY
      )
    );

    expect(sql).toContain("11111111-1111-1111-1111-111111111111");
    expect(sql).toContain("22222222-2222-2222-2222-222222222222");
  });

  it("hasStock = true deja solo los lotes con existencia", () => {
    const conditions = buildLotConditions({ hasStock: true }, HOY);
    expect(conditions).toHaveLength(1);
    expect(toSql(conditions)).toContain("quantity_available");
  });

  it("hasStock = false incluye los lotes agotados", () => {
    const conditions = buildLotConditions({ hasStock: false }, HOY);
    expect(conditions).toHaveLength(0);
  });

  it("includeEmpty sin hasStock mantiene los lotes agotados", () => {
    const conditions = buildLotConditions({ includeEmpty: true }, HOY);
    expect(conditions).toHaveLength(0);
  });

  it("filtra por vencimiento exacto (mañana)", () => {
    const conditions = buildLotConditions(
      { expiration: "tomorrow", hasStock: false },
      HOY
    );
    expect(conditions).toHaveLength(1);
    expect(toSql(conditions)).toContain("2026-10-28");
  });

  it("filtra por vencimiento de hoy", () => {
    const conditions = buildLotConditions(
      { expiration: "today", hasStock: false },
      HOY
    );
    expect(conditions).toHaveLength(1);
    expect(toSql(conditions)).toContain(HOY);
  });

  it("filtra por rango de fechas", () => {
    const conditions = buildLotConditions(
      {
        expiration: "range",
        expirationFrom: "2026-10-01",
        expirationTo: "2026-12-31",
        hasStock: false,
      },
      HOY
    );

    expect(conditions).toHaveLength(2);
    expect(toSql(conditions)).toContain("2026-10-01");
    expect(toSql(conditions)).toContain("2026-12-31");
  });

  it("filtra los lotes ya vencidos", () => {
    const conditions = buildLotConditions(
      { expiration: "expired", hasStock: false },
      HOY
    );
    expect(conditions).toHaveLength(1);
  });

  it("filtra los lotes sin fecha de vencimiento", () => {
    const conditions = buildLotConditions(
      { expiration: "missing", hasStock: false },
      HOY
    );
    expect(conditions).toHaveLength(1);
  });

  it("combina varios filtros", () => {
    const conditions = buildLotConditions(
      {
        productId: "11111111-1111-1111-1111-111111111111",
        hasStock: true,
        expiration: "soon",
        search: "arroz",
      },
      HOY
    );

    expect(conditions.length).toBeGreaterThanOrEqual(3);
  });
});
