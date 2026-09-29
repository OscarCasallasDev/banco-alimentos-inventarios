/**
 * Schemas de validación Zod — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { z } from "zod";

// ============================================================
// AUTENTICACIÓN
// ============================================================

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, "El usuario es requerido")
    .max(100, "El usuario no puede exceder 100 caracteres"),
  password: z
    .string()
    .min(1, "La contraseña es requerida")
    .max(100, "La contraseña no puede exceder 100 caracteres"),
});

// ============================================================
// USUARIOS
// ============================================================

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(100, "El usuario no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "El usuario solo puede contener letras, números y guiones bajos"),
  firstName: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  lastName: z
    .string()
    .min(1, "El apellido es requerido")
    .max(100, "El apellido no puede exceder 100 caracteres"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres"),
  role: z.enum(["SUPERADMIN", "ADMIN", "RECEPCION", "DESPACHO", "CONTABILIDAD"]),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres")
    .optional(),
});

// ============================================================
// PRODUCTOS
// ============================================================

export const createProductSchema = z.object({
  code: z
    .string()
    .min(1, "El código es requerido")
    .max(50, "El código no puede exceder 50 caracteres")
    .regex(/^[A-Z0-9-]+$/, "El código solo puede contener letras mayúsculas, números y guiones"),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(255, "El nombre no puede exceder 255 caracteres"),
  description: z
    .string()
    .max(1000, "La descripción no puede exceder 1000 caracteres")
    .optional(),
  presentation: z
    .string()
    .max(100, "La presentación no puede exceder 100 caracteres")
    .optional(),
  weight: z
    .number()
    .min(0, "El peso no puede ser negativo")
    .max(999999.99, "El peso no puede exceder 999999.99"),
  unit: z
    .string()
    .min(1, "La unidad es requerida")
    .max(20, "La unidad no puede exceder 20 caracteres"),
  categoryId: z
    .string()
    .uuid("Categoría inválida")
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]),
  minStock: z
    .number()
    .int("El stock mínimo debe ser un número entero")
    .min(0, "El stock mínimo no puede ser negativo")
    .max(999999, "El stock mínimo no puede exceder 999999"),
});

export const updateProductSchema = createProductSchema.partial();

// ============================================================
// BODEGAS
// ============================================================

export const createWarehouseSchema = z.object({
  code: z
    .string()
    .min(1, "El código es requerido")
    .max(20, "El código no puede exceder 20 caracteres")
    .regex(/^[A-Z0-9.]+$/, "El código solo puede contener letras mayúsculas, números y puntos"),
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(255, "El nombre no puede exceder 255 caracteres"),
  description: z
    .string()
    .max(1000, "La descripción no puede exceder 1000 caracteres")
    .optional(),
  type: z.enum(["PROPIA", "TERCERO", "CAMPAIGN", "PROGRAM"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  observations: z
    .string()
    .max(1000, "Las observaciones no pueden exceder 1000 caracteres")
    .optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

// ============================================================
// ENTRADAS
// ============================================================

export const entryItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  quantity: z
    .number()
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser positiva")
    .max(999999, "La cantidad no puede exceder 999999"),
  unit: z.string().min(1, "La unidad es requerida"),
  presentation: z.string().optional(),
});

export const createEntrySchema = z.object({
  format: z.enum(["E1", "E3", "N3", "N5"]),
  number: z.string().min(1, "El número es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  nit: z.string().optional(),
  origin: z.string().optional(),
  document: z.string().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]),
  notes: z.string().optional(),
  items: z.array(entryItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// PEDIDOS
// ============================================================

export const orderItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  quantity: z
    .number()
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser positiva")
    .max(999999, "La cantidad no puede exceder 999999"),
});

export const createOrderSchema = z.object({
  number: z.string().min(1, "El número es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  nit: z.string().optional(),
  destination: z.string().optional(),
  status: z.enum(["DRAFT", "APPROVED", "INVOICED", "DISPATCHED", "CANCELLED"]),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// FACTURAS
// ============================================================

export const createInvoiceSchema = z.object({
  format: z.enum(["SF1", "F2"]),
  number: z.string().min(1, "El número es requerido"),
  orderId: z.string().uuid("Pedido inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["DRAFT", "GENERATED", "ASSOCIATED_TO_RECEIPT", "CANCELLED"]),
});

// ============================================================
// RECIBOS
// ============================================================

export const createReceiptSchema = z.object({
  format: z.enum(["R1", "R2", "R3", "R4"]),
  number: z.string().min(1, "El número es requerido"),
  invoiceId: z.string().uuid("Factura inválida"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["DRAFT", "GENERATED", "CANCELLED"]),
});

// ============================================================
// DESPACHOS
// ============================================================

export const createDispatchSchema = z.object({
  number: z.string().min(1, "El número es requerido"),
  receiptId: z.string().uuid("Recibo inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["PENDING", "PREPARED", "DISPATCHED", "CANCELLED"]),
  notes: z.string().optional(),
});

// ============================================================
// AUDITORÍAS
// ============================================================

export const auditItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  systemQuantity: z.number().int().min(0, "La cantidad del sistema no puede ser negativa"),
  physicalQuantity: z.number().int().min(0, "La cantidad física no puede ser negativa"),
  difference: z.number().int(),
  observation: z.string().optional(),
});

export const createAuditSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  warehouseId: z.string().uuid("Bodega inválida"),
  responsible: z.string().min(1, "El responsable es requerido"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  notes: z.string().optional(),
  items: z.array(auditItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// TIPOS INFERIDOS
// ============================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
