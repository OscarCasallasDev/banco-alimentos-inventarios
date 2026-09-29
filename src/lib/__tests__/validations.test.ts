/**
 * Pruebas unitarias — Validaciones Zod
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import {
  loginSchema,
  createUserSchema,
  createProductSchema,
  createWarehouseSchema,
  createEntrySchema,
  createOrderSchema,
  createInvoiceSchema,
  createReceiptSchema,
  createDispatchSchema,
  createAuditSchema,
} from "@/lib/validations/schemas";

describe("Login Schema", () => {
  it("debe validar un login correcto", () => {
    const result = loginSchema.safeParse({
      username: "admin",
      password: "admin123",
    });
    expect(result.success).toBe(true);
  });

  it("debe rechazar un login sin usuario", () => {
    const result = loginSchema.safeParse({
      username: "",
      password: "admin123",
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar un login sin contraseña", () => {
    const result = loginSchema.safeParse({
      username: "admin",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("Create User Schema", () => {
  it("debe validar un usuario correcto", () => {
    const result = createUserSchema.safeParse({
      username: "testuser",
      firstName: "Juan",
      lastName: "Pérez",
      password: "password123",
      role: "ADMIN",
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("debe rechazar un usuario con caracteres inválidos", () => {
    const result = createUserSchema.safeParse({
      username: "test@user!",
      firstName: "Juan",
      lastName: "Pérez",
      password: "password123",
      role: "ADMIN",
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar una contraseña muy corta", () => {
    const result = createUserSchema.safeParse({
      username: "testuser",
      firstName: "Juan",
      lastName: "Pérez",
      password: "123",
      role: "ADMIN",
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });
});

describe("Create Product Schema", () => {
  it("debe validar un producto correcto", () => {
    const result = createProductSchema.safeParse({
      code: "GRN-001",
      name: "Arroz",
      weight: 0.5,
      unit: "kg",
      minStock: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("debe rechazar un código con minúsculas", () => {
    const result = createProductSchema.safeParse({
      code: "grn-001",
      name: "Arroz",
      weight: 0.5,
      unit: "kg",
      minStock: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar un stock mínimo negativo", () => {
    const result = createProductSchema.safeParse({
      code: "GRN-001",
      name: "Arroz",
      weight: 0.5,
      unit: "kg",
      minStock: -10,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });
});

describe("Create Warehouse Schema", () => {
  it("debe validar una bodega correcta", () => {
    const result = createWarehouseSchema.safeParse({
      code: "1.1",
      name: "Bodega Principal",
      type: "PROPIA",
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("debe rechazar un código con caracteres inválidos", () => {
    const result = createWarehouseSchema.safeParse({
      code: "1.1@",
      name: "Bodega Principal",
      type: "PROPIA",
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });
});

describe("Create Entry Schema", () => {
  it("debe validar una entrada correcta", () => {
    const result = createEntrySchema.safeParse({
      format: "E1",
      number: "ENT-2026-0001",
      date: "2026-09-28",
      items: [
        {
          productId: "123e4567-e89b-12d3-a456-426614174000",
          warehouseId: "123e4567-e89b-12d3-a456-426614174001",
          quantity: 100,
          unit: "kg",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("debe rechazar una entrada sin items", () => {
    const result = createEntrySchema.safeParse({
      format: "E1",
      number: "ENT-2026-0001",
      date: "2026-09-28",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar una cantidad negativa", () => {
    const result = createEntrySchema.safeParse({
      format: "E1",
      number: "ENT-2026-0001",
      date: "2026-09-28",
      items: [
        {
          productId: "123e4567-e89b-12d3-a456-426614174000",
          warehouseId: "123e4567-e89b-12d3-a456-426614174001",
          quantity: -10,
          unit: "kg",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("Create Order Schema", () => {
  it("debe validar un pedido correcto", () => {
    const result = createOrderSchema.safeParse({
      number: "PED-2026-0001",
      date: "2026-09-28",
      items: [
        {
          productId: "123e4567-e89b-12d3-a456-426614174000",
          warehouseId: "123e4567-e89b-12d3-a456-426614174001",
          quantity: 50,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("Create Invoice Schema", () => {
  it("debe validar una factura correcta", () => {
    const result = createInvoiceSchema.safeParse({
      format: "SF1",
      number: "FAC-2026-0001",
      orderId: "123e4567-e89b-42d3-a456-426614174000",
      date: "2026-09-28",
    });
    expect(result.success).toBe(true);
  });
});

describe("Create Receipt Schema", () => {
  it("debe validar un recibo correcto", () => {
    const result = createReceiptSchema.safeParse({
      format: "R1",
      number: "REC-2026-0001",
      invoiceId: "123e4567-e89b-42d3-a456-426614174000",
      date: "2026-09-28",
    });
    expect(result.success).toBe(true);
  });
});

describe("Create Dispatch Schema", () => {
  it("debe validar un despacho correcto", () => {
    const result = createDispatchSchema.safeParse({
      number: "DES-2026-0001",
      receiptId: "123e4567-e89b-42d3-a456-426614174000",
      date: "2026-09-28",
    });
    expect(result.success).toBe(true);
  });
});

describe("Create Audit Schema", () => {
  it("debe validar una auditoría correcta", () => {
    const result = createAuditSchema.safeParse({
      date: "2026-09-28",
      warehouseId: "123e4567-e89b-42d3-a456-426614174000",
      responsible: "Juan Pérez",
      items: [
        {
          productId: "123e4567-e89b-42d3-a456-426614174000",
          systemQuantity: 100,
          physicalQuantity: 95,
          difference: -5,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
