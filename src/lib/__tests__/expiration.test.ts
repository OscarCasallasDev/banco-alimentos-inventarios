/**
 * Pruebas unitarias — Vencimientos
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_EXPIRATION_THRESHOLDS,
  daysToExpire,
  expirationSeverity,
  expirationStatus,
  isExpired,
} from "@/lib/lots/expiration";
import {
  addDaysIso,
  bankTodayIso,
  daysBetweenIso,
  isValidIsoDate,
  toIsoDate,
} from "@/lib/utils/dates";

const HOY = "2026-10-27";

describe("expirationStatus", () => {
  it("clasifica un lote vencido", () => {
    expect(expirationStatus("2026-10-26", undefined, HOY)).toBe("EXPIRED");
  });

  it("clasifica el vencimiento de hoy", () => {
    expect(expirationStatus(HOY, undefined, HOY)).toBe("EXPIRES_TODAY");
  });

  it("clasifica el vencimiento de mañana", () => {
    expect(expirationStatus("2026-10-28", undefined, HOY)).toBe("EXPIRES_TOMORROW");
  });

  it("clasifica como crítico dentro del umbral", () => {
    expect(expirationStatus("2026-11-02", undefined, HOY)).toBe("CRITICAL");
  });

  it("clasifica como advertencia dentro del horizonte", () => {
    expect(expirationStatus("2026-11-20", undefined, HOY)).toBe("WARNING");
  });

  it("clasifica como vigente fuera del horizonte", () => {
    expect(expirationStatus("2027-01-01", undefined, HOY)).toBe("OK");
  });

  it("no inventa vencimiento cuando la fecha no existe", () => {
    expect(expirationStatus(null, undefined, HOY)).toBe("NO_EXPIRY");
    expect(expirationStatus(undefined, undefined, HOY)).toBe("NO_EXPIRY");
    expect(expirationStatus("", undefined, HOY)).toBe("NO_EXPIRY");
  });

  it("respeta umbrales configurados por el Banco", () => {
    const thresholds = { alertDays: 60, criticalDays: 15 };
    // 9 días: dentro del umbral crítico ampliado.
    expect(expirationStatus("2026-11-05", thresholds, HOY)).toBe("CRITICAL");
    // 24 días: dentro del horizonte ampliado, fuera del crítico.
    expect(expirationStatus("2026-11-20", thresholds, HOY)).toBe("WARNING");
    // 54 días: dentro del horizonte ampliado.
    expect(expirationStatus("2026-12-20", thresholds, HOY)).toBe("WARNING");
    // 66 días: fuera del horizonte ampliado.
    expect(expirationStatus("2027-01-01", thresholds, HOY)).toBe("OK");
  });
});

describe("expirationSeverity", () => {
  it("distingue vencido de próximo a vencer", () => {
    expect(expirationSeverity("EXPIRED")).toBe("expired");
    expect(expirationSeverity("EXPIRES_TODAY")).toBe("critical");
    expect(expirationSeverity("EXPIRES_TOMORROW")).toBe("critical");
    expect(expirationSeverity("CRITICAL")).toBe("critical");
    expect(expirationSeverity("WARNING")).toBe("warning");
    expect(expirationSeverity("OK")).toBe("ok");
    expect(expirationSeverity("NO_EXPIRY")).toBe("none");
  });
});

describe("daysToExpire", () => {
  it("cuenta los días que faltan", () => {
    expect(daysToExpire("2026-10-28", HOY)).toBe(1);
    expect(daysToExpire("2026-10-27", HOY)).toBe(0);
    expect(daysToExpire("2026-10-26", HOY)).toBe(-1);
  });

  it("devuelve null sin fecha", () => {
    expect(daysToExpire(null, HOY)).toBeNull();
  });
});

describe("isExpired", () => {
  it("detecta lo vencido y lo que no", () => {
    expect(isExpired("2026-10-26", HOY)).toBe(true);
    expect(isExpired("2026-10-27", HOY)).toBe(false);
    expect(isExpired(null, HOY)).toBe(false);
  });
});

describe("Utilidades de fecha", () => {
  it("suma días sin cruzar husos horarios", () => {
    expect(addDaysIso(HOY, 1)).toBe("2026-10-28");
    expect(addDaysIso(HOY, 30)).toBe("2026-11-26");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("calcula la diferencia en días calendario", () => {
    expect(daysBetweenIso(HOY, "2026-11-26")).toBe(30);
    expect(daysBetweenIso("2026-11-26", HOY)).toBe(-30);
  });

  it("normaliza fechas a YYYY-MM-DD", () => {
    expect(toIsoDate("2026-10-27")).toBe("2026-10-27");
  });

  it("valida fechas reales del calendario", () => {
    expect(isValidIsoDate("2026-10-27")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("27/10/2026")).toBe(false);
  });

  it("expone la fecha del Banco en formato ISO", () => {
    expect(bankTodayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Umbrales por defecto", () => {
  it("usa 30 días de horizonte y 7 días críticos", () => {
    expect(DEFAULT_EXPIRATION_THRESHOLDS.alertDays).toBe(30);
    expect(DEFAULT_EXPIRATION_THRESHOLDS.criticalDays).toBe(7);
  });
});
