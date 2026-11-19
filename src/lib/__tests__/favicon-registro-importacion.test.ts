/**
 * Pruebas — Favicon, registro de usuarios e importación manual de Excel
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { registerSchema } from "@/lib/validations/schemas";
import { buildUsername } from "@/lib/auth/username";
import {
  passwordRuleFailures,
  checkPasswordConfirmation,
} from "@/lib/auth/password-policy";
import { esArchivoImportable } from "@/lib/siigo/import-excel";

const root = path.resolve(__dirname, "..", "..", "..");

// ============================================================
// 1. FAVICON
// ============================================================

describe("Favicon del Banco", () => {
  it("existe el archivo favicon.ico en la app", () => {
    expect(existsSync(path.join(root, "src/app/favicon.ico"))).toBe(true);
  });

  it("es un ICO válido con varias resoluciones", () => {
    const bytes = readFileSync(path.join(root, "src/app/favicon.ico"));

    // Cabecera ICO: reservado 0x0000, tipo 0x0001 (icono), número de imágenes.
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0x01);
    expect(bytes[3]).toBe(0x00);

    const count = bytes.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(2);

    // Cada entrada del directorio declara el ancho y el alto del icono.
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      sizes.push(bytes[entry]);
    }
    expect(sizes).toContain(16);
    expect(sizes).toContain(32);
  });

  it("existe también el icono PNG para pantallas retina", () => {
    expect(existsSync(path.join(root, "src/app/icon.png"))).toBe(true);
  });
});

// ============================================================
// 2. REGISTRO DE USUARIOS
// ============================================================

describe("Registro de usuarios", () => {
  it("no pide correo electrónico ni nombre de usuario", () => {
    const parsed = registerSchema.parse({
      firstName: "Carlos",
      lastName: "Ramírez",
      password: "Banco2026!",
    });

    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("username");
    expect(parsed.firstName).toBe("Carlos");
    expect(parsed.lastName).toBe("Ramírez");
  });

  it("rechaza una contraseña que no cumple la política", () => {
    expect(
      registerSchema.safeParse({
        firstName: "A",
        lastName: "B",
        password: "corta1!",
      }).success
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        firstName: "A",
        lastName: "B",
        password: "SoloLetras",
      }).success
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        firstName: "A",
        lastName: "B",
        password: "12345678!",
      }).success
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        firstName: "A",
        lastName: "B",
        password: "Banco2026",
      }).success
    ).toBe(false);
  });

  it("acepta una contraseña que cumple la política", () => {
    expect(
      registerSchema.safeParse({
        firstName: "Ana",
        lastName: "Pérez",
        password: "Banco2026!",
      }).success
    ).toBe(true);
  });

  it("genera el nombre de usuario con nombre y apellido", () => {
    expect(buildUsername("Carlos", "Ramírez")).toBe("carlosramirez");
    expect(buildUsername("Ana", "María Pérez")).toBe("anamariaperez");
  });
});

// ============================================================
// 3. CONFIRMACIÓN DE CONTRASEÑA
// ============================================================

describe("Confirmación de contraseña", () => {
  it("acepta cuando coinciden y cumplen la política", () => {
    expect(checkPasswordConfirmation("Banco2026!", "Banco2026!").valid).toBe(
      true
    );
  });

  it("rechaza cuando no coinciden", () => {
    const result = checkPasswordConfirmation("Banco2026!", "Banco2027!");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/no coinciden/i);
  });

  it("rechaza cuando coinciden pero no cumplen la política", () => {
    const result = checkPasswordConfirmation("corta1!", "corta1!");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 caracteres/i);
  });

  it("lista los motivos por los que falla la política", () => {
    expect(passwordRuleFailures("")).toEqual([]);
    expect(passwordRuleFailures("corta1!")).toEqual(["Al menos 8 caracteres"]);
    expect(passwordRuleFailures("Banco2026!")).toEqual([]);
  });
});

// ============================================================
// 4. IMPORTACIÓN MANUAL DE EXCEL
// ============================================================

describe("Importación manual de Excel", () => {
  it("acepta solo los formatos que soporta el importador", () => {
    expect(esArchivoImportable("reporte.xlsx")).toBe(true);
    expect(esArchivoImportable("REPORTE.XLSX")).toBe(true);
    expect(esArchivoImportable("reporte.xls")).toBe(false);
    expect(esArchivoImportable("reporte.csv")).toBe(false);
    expect(esArchivoImportable("reporte.pdf")).toBe(false);
  });

  it("el agente local deja la tarea programada desactivada", () => {
    const install = readFileSync(
      path.join(root, "agent", "install.ps1"),
      "utf8"
    );

    expect(install).toMatch(/Disable-ScheduledTask/);
    expect(install).toMatch(/DESHABILITADA/);
  });
});
