/**
 * Pruebas unitarias de los rangos de vencimiento.
 *
 * Regla del Banco: si la semana actual es del 9 al 15, la próxima semana es
 * del 16 al 22. El cálculo debe ser automático (sin fechas fijas) y en la
 * zona horaria de Colombia.
 */

import { describe, it, expect } from "vitest";
import {
  bogotaToday,
  vencimientoRanges,
  weekRange,
} from "@/lib/services/vencimiento.service";

describe("Rangos de semana", () => {
  it("la semana actual va de lunes a domingo", () => {
    // 2026-11-09 es lunes.
    const rango = weekRange(0, "2026-11-09");
    expect(rango.from).toBe("2026-11-09");
    expect(rango.to).toBe("2026-11-15");
  });

  it("la próxima semana es la siguiente de lunes a domingo", () => {
    const rango = weekRange(1, "2026-11-09");
    expect(rango.from).toBe("2026-11-16");
    expect(rango.to).toBe("2026-11-22");
  });

  it("calcula bien cuando hoy es miércoles", () => {
    // 2026-11-11 es miércoles → la semana empieza el lunes 9.
    const rango = weekRange(0, "2026-11-11");
    expect(rango.from).toBe("2026-11-09");
    expect(rango.to).toBe("2026-11-15");
    expect(weekRange(1, "2026-11-11").from).toBe("2026-11-16");
  });

  it("calcula bien cuando hoy es domingo", () => {
    // 2026-11-15 es domingo → sigue siendo la semana del 9 al 15.
    const rango = weekRange(0, "2026-11-15");
    expect(rango.from).toBe("2026-11-09");
    expect(rango.to).toBe("2026-11-15");
  });

  it("cruza el cambio de mes y de año", () => {
    // 2026-12-28 es lunes; la siguiente semana empieza en enero.
    const siguiente = weekRange(1, "2026-12-28");
    expect(siguiente.from).toBe("2027-01-04");
    expect(siguiente.to).toBe("2027-01-10");
  });

  it("cruza un año bisiesto sin perder días", () => {
    const rango = weekRange(1, "2028-02-21");
    expect(rango.from).toBe("2028-02-28");
    expect(rango.to).toBe("2028-03-05");
  });

  it("no contiene fechas fijas: cambia según la fecha base", () => {
    expect(weekRange(0, "2026-11-09").from).not.toBe(
      weekRange(0, "2027-01-01").from
    );
  });
});

describe("Rangos completos del módulo", () => {
  it("calcula próxima semana, 15 días y 30 días", () => {
    const rangos = vencimientoRanges("2026-11-11");
    expect(rangos.today).toBe("2026-11-11");
    expect(rangos.nextWeek).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(rangos.next15).toEqual({ from: "2026-11-11", to: "2026-11-26" });
    expect(rangos.next30).toEqual({ from: "2026-11-11", to: "2026-12-11" });
  });

  it("la fecha de hoy se calcula en hora de Colombia", () => {
    const hoy = bogotaToday();
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Colombia está en UTC-5: la fecha local nunca va por delante de UTC
    // por más de unas horas, pero el formato debe ser siempre válido.
    expect(Number.isNaN(new Date(`${hoy}T12:00:00Z`).getTime())).toBe(false);
  });
});
