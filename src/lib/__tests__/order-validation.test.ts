/**
 * Pruebas unitarias de las validaciones de la orden de pedido.
 *
 * Cubren el comportamiento exacto que pidió el Banco:
 *   - se puede borrar el campo mientras se edita;
 *   - al validar, vacío / cero / negativo / texto → error;
 *   - la cantidad no puede superar la disponibilidad;
 *   - el peso debe ser > 0;
 *   - la fecha de vencimiento es obligatoria y debe ser real.
 */

import { describe, it, expect } from "vitest";
import {
  MESSAGES,
  parseNumericInput,
  validateExpiration,
  validateLine,
  validateQuantity,
  validateWeight,
} from "@/lib/orders/validation";

describe("Campo cantidad", () => {
  it("permite el campo vacío mientras se edita (no fuerza cero)", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("   ")).toBeNull();
  });

  it("acepta coma o punto decimal", () => {
    expect(parseNumericInput("12,5")).toBe(12.5);
    expect(parseNumericInput("12.5")).toBe(12.5);
  });

  it("rechaza vacío, cero, negativo y texto", () => {
    for (const raw of ["", "   ", "0", "-1", "-0.5", "abc", "1e", "--2"]) {
      expect(validateQuantity(raw, 100)).toBe(MESSAGES.quantity);
    }
  });

  it("acepta una cantidad válida", () => {
    expect(validateQuantity("1", 100)).toBeNull();
    expect(validateQuantity("0.001", 100)).toBeNull();
    expect(validateQuantity("12,5", 100)).toBeNull();
  });

  it("rechaza una cantidad mayor que la disponibilidad", () => {
    expect(validateQuantity("51", 50)).toBe(MESSAGES.exceedsStock);
    expect(validateQuantity("50", 50)).toBeNull();
    // Tolerancia de 0,0005 para no fallar por decimales.
    expect(validateQuantity("50.0004", 50)).toBeNull();
  });

  it("rechaza cualquier cantidad si no hay disponibilidad", () => {
    expect(validateQuantity("1", 0)).toBe(MESSAGES.exceedsStock);
    expect(validateQuantity("1", -10)).toBe(MESSAGES.exceedsStock);
  });
});

describe("Campo peso", () => {
  it("rechaza vacío, cero, negativo y texto", () => {
    for (const raw of ["", "   ", "0", "-2", "xyz"]) {
      expect(validateWeight(raw)).toBe(MESSAGES.weight);
    }
  });

  it("acepta un peso mayor que cero", () => {
    expect(validateWeight("0.5")).toBeNull();
    expect(validateWeight("2,25")).toBeNull();
    expect(validateWeight("1000")).toBeNull();
  });
});

describe("Fecha de vencimiento", () => {
  it("es obligatoria", () => {
    expect(validateExpiration("")).toBe(MESSAGES.expiration);
  });

  it("rechaza formatos inválidos", () => {
    for (const raw of ["15/03/2027", "2027-3-5", "mañana", "2027-13-01"]) {
      expect(validateExpiration(raw)).toBe(MESSAGES.expiration);
    }
  });

  it("rechaza fechas que no existen en el calendario", () => {
    expect(validateExpiration("2027-02-30")).toBe(MESSAGES.expiration);
    expect(validateExpiration("2027-04-31")).toBe(MESSAGES.expiration);
  });

  it("acepta una fecha real", () => {
    expect(validateExpiration("2027-03-15")).toBeNull();
    expect(validateExpiration("2028-02-29")).toBeNull(); // año bisiesto
  });
});

describe("Validación de una línea completa", () => {
  it("es válida solo si los tres campos están bien", () => {
    expect(
      validateLine({
        quantity: "2",
        weight: "1.5",
        expirationDate: "2027-03-15",
        available: 10,
      }).valid
    ).toBe(true);
  });

  it("marca cada error por separado", () => {
    const result = validateLine({
      quantity: "",
      weight: "0",
      expirationDate: "",
      available: 10,
    });
    expect(result.quantity).toBe(MESSAGES.quantity);
    expect(result.weight).toBe(MESSAGES.weight);
    expect(result.expiration).toBe(MESSAGES.expiration);
    expect(result.valid).toBe(false);
  });

  it("no oculta el error de cantidad por encima de la disponibilidad", () => {
    const result = validateLine({
      quantity: "99",
      weight: "1",
      expirationDate: "2027-03-15",
      available: 10,
    });
    expect(result.quantity).toBe(MESSAGES.exceedsStock);
    expect(result.valid).toBe(false);
  });
});
