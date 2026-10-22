/**
 * Schemas de validación Zod — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * FUENTE ÚNICA DE VERDAD para la validación de entrada de la API.
 * Todos los campos están en camelCase, igual que el resto de la aplicación.
 * Los servicios se encargan de convertir a las columnas snake_case.
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

export const registerSchema = z.object({
  firstName: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  lastName: z
    .string()
    .min(1, "El apellido es requerido")
    .max(100, "El apellido no puede exceder 100 caracteres"),
  email: z
    .string()
    .email("Correo electrónico inválido")
    .max(255, "El correo no puede exceder 255 caracteres"),
  username: z
    .string()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(50, "El usuario no puede exceder 50 caracteres")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "El usuario solo puede contener letras, números y guiones bajos"
    ),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
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
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "El usuario solo puede contener letras, números y guiones bajos"
    ),
  email: z
    .string()
    .email("Correo electrónico inválido")
    .max(255, "El correo no puede exceder 255 caracteres"),
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
  role: z
    .enum(["SUPERADMIN", "ADMIN", "RECEPCION", "DESPACHO", "CONTABILIDAD"])
    .default("RECEPCION"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(100, "El usuario no puede exceder 100 caracteres")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "El usuario solo puede contener letras, números y guiones bajos"
    )
    .optional(),
  email: z
    .string()
    .email("Correo electrónico inválido")
    .max(255, "El correo no puede exceder 255 caracteres")
    .optional(),
  firstName: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .optional(),
  lastName: z
    .string()
    .min(1, "El apellido es requerido")
    .max(100, "El apellido no puede exceder 100 caracteres")
    .optional(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres")
    .optional(),
  role: z
    .enum(["SUPERADMIN", "ADMIN", "RECEPCION", "DESPACHO", "CONTABILIDAD"])
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

// ============================================================
// CATEGORÍAS
// ============================================================

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(255, "El nombre no puede exceder 255 caracteres"),
  description: z
    .string()
    .max(1000, "La descripción no puede exceder 1000 caracteres")
    .optional(),
});

// ============================================================
// PRODUCTOS
// ============================================================

export const createProductSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "El código es requerido")
    .max(50, "El código no puede exceder 50 caracteres")
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[A-Z0-9-]+$/.test(value),
      "El código solo puede contener letras mayúsculas, números y guiones"
    ),
  name: z
    .string()
    .trim()
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
    .max(999999.99, "El peso no puede exceder 999999.99")
    .default(0),
  unit: z
    .string()
    .trim()
    .min(1, "La unidad es requerida")
    .max(20, "La unidad no puede exceder 20 caracteres")
    .default("unidad"),
  categoryId: z
    .string()
    .uuid("Categoría inválida")
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
  minStock: z
    .number()
    .int("El stock mínimo debe ser un número entero")
    .min(0, "El stock mínimo no puede ser negativo")
    .max(999999, "El stock mínimo no puede exceder 999999")
    .default(0),
});

export const updateProductSchema = createProductSchema.partial();

// ============================================================
// BODEGAS
// ============================================================

export const createWarehouseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "El código es requerido")
    .max(20, "El código no puede exceder 20 caracteres")
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[A-Z0-9.]+$/.test(value),
      "El código solo puede contener letras mayúsculas, números y puntos"
    ),
  name: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(255, "El nombre no puede exceder 255 caracteres"),
  description: z
    .string()
    .max(1000, "La descripción no puede exceder 1000 caracteres")
    .optional(),
  type: z.enum(["PROPIA", "TERCERO", "CAMPAIGN", "PROGRAM"]).default("PROPIA"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  observations: z
    .string()
    .max(1000, "Las observaciones no pueden exceder 1000 caracteres")
    .optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

// ============================================================
// ENTRADAS
// ============================================================

// ============================================================
// ENTRADAS
// ============================================================

/**
 * Lote de un producto dentro de una entrada.
 */
export const entryLotSchema = z.object({
  /** Código del lote. */
  code: z.string().trim().max(50).optional(),
  /** Denominación del lote (por ejemplo "Lotes Inicial"). */
  description: z.string().trim().max(100).optional(),
  /** Fecha de vencimiento (AAAA-MM-DD). */
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de vencimiento no es válida")
    .optional(),
  /** Cantidad del producto contenida en este lote. */
  quantity: z
    .number()
    .positive("La cantidad del lote debe ser mayor que cero")
    .max(999999, "La cantidad del lote no puede exceder 999999"),
});

export const entryItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  quantity: z
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(999999, "La cantidad no puede exceder 999999"),
  unit: z.string().min(1, "La unidad es requerida").max(20),
  presentation: z.string().max(100).optional(),
  /** Descripción del producto para el comprobante (CD, nombre, presentación). */
  description: z.string().max(500).optional(),
  /** Centro de costo de la línea. */
  costCenterId: z.string().uuid("Centro de costo inválido").nullable().optional(),
  /** Ubicación dentro de la bodega. */
  location: z.string().trim().max(50).optional(),
  /** Valor monetario de la línea (puede ser 0). */
  value: z
    .number()
    .min(0, "El valor no puede ser negativo")
    .max(999999999, "El valor es demasiado grande")
    .default(0),
  /** Indicador débito/crédito del movimiento. */
  debitCredit: z
    .number()
    .min(0, "El valor débito/crédito no puede ser negativo")
    .max(999999999, "El valor es demasiado grande")
    .default(0),
  /** Lotes del producto en esta línea. */
  lots: z.array(entryLotSchema).default([]),
});

export const createEntrySchema = z.object({
  format: z.enum(["E1", "E3", "N3", "N5"]),
  /** Si se omite, el sistema asigna el consecutivo (E-003-28). */
  number: z.string().trim().max(50).optional(),
  date: z.string().min(1, "La fecha es requerida"),
  /** Entidad que entrega los productos. */
  thirdPartyId: z.string().uuid("Tercero inválido").optional(),
  nit: z.string().trim().max(50).optional(),
  origin: z.string().max(255).optional(),
  document: z.string().max(100).optional(),
  /** Centro de costo del documento. */
  costCenterId: z.string().uuid("Centro de costo inválido").nullable().optional(),
  /** Orden de compra asociada (vacía si no aplica). */
  purchaseOrder: z.string().trim().max(50).optional(),
  /** Número de vendedor del documento. */
  sellerNumber: z
    .number()
    .int("El número de vendedor debe ser un entero")
    .min(1, "El número de vendedor debe ser mayor que cero")
    .max(9999, "El número de vendedor es demasiado grande")
    .default(1),
  status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).default("CONFIRMED"),
  notes: z.string().max(2000).optional(),
  items: z.array(entryItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// TERCEROS
// ============================================================

export const thirdPartyTypeSchema = z.enum([
  "CLIENTE",
  "PROVEEDOR",
  "DONANTE",
  "PARROQUIA",
  "OTROS",
]);

export const createThirdPartySchema = z.object({
  nit: z
    .string()
    .trim()
    .min(1, "El NIT o cédula es requerido")
    .max(50, "El NIT no puede exceder 50 caracteres"),
  branch: z.string().trim().max(10).optional(),
  name: z
    .string()
    .trim()
    .min(1, "La razón social es requerida")
    .max(255, "La razón social no puede exceder 255 caracteres"),
  type: thirdPartyTypeSchema.default("CLIENTE"),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  city: z.string().trim().max(100).optional(),
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
  /** Si se omite, el sistema asigna el consecutivo (PED-2026-0001). */
  number: z.string().trim().max(50).optional(),
  date: z.string().min(1, "La fecha es requerida"),
  nit: z.string().max(50).optional(),
  destination: z.string().max(255).optional(),
  status: z.enum(["DRAFT", "APPROVED", "INVOICED", "DISPATCHED", "CANCELLED"]).default(
    "APPROVED"
  ),
  notes: z.string().max(2000).optional(),
  items: z.array(orderItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// FACTURAS
// ============================================================

export const createInvoiceSchema = z.object({
  format: z.enum(["SF1", "F2"]),
  /** Si se omite, el sistema asigna el consecutivo (FAC-2026-0001). */
  number: z.string().trim().max(50).optional(),
  orderId: z.string().uuid("Pedido inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z
    .enum(["DRAFT", "GENERATED", "ASSOCIATED_TO_RECEIPT", "CANCELLED"])
    .default("GENERATED"),
});

// ============================================================
// RECIBOS
// ============================================================

export const createReceiptSchema = z.object({
  format: z.enum(["R1", "R2", "R3", "R4"]),
  /** Si se omite, el sistema asigna el consecutivo (REC-2026-0001). */
  number: z.string().trim().max(50).optional(),
  invoiceId: z.string().uuid("Factura inválida"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z.enum(["DRAFT", "GENERATED", "CANCELLED"]).default("GENERATED"),
});

// ============================================================
// DESPACHOS
// ============================================================

export const createDispatchSchema = z.object({
  /** Si se omite, el sistema asigna el consecutivo (DES-2026-0001). */
  number: z.string().trim().max(50).optional(),
  receiptId: z.string().uuid("Recibo inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z
    .enum(["PENDING", "PREPARED", "DISPATCHED", "CANCELLED"])
    .default("DISPATCHED"),
  notes: z.string().max(2000).optional(),
});

// ============================================================
// AUDITORÍAS
// ============================================================

export const auditItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  /** Conteo físico verificado en bodega. El sistema toma la existencia real. */
  physicalQuantity: z
    .number()
    .int("La cantidad física debe ser un número entero")
    .min(0, "La cantidad física no puede ser negativa")
    .max(999999, "La cantidad física no puede exceder 999999"),
  observation: z.string().max(1000).optional(),
});

export const createAuditSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  warehouseId: z.string().uuid("Bodega inválida"),
  responsible: z.string().trim().min(1, "El responsable es requerido").max(255),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .default("COMPLETED"),
  notes: z.string().max(2000).optional(),
  items: z.array(auditItemSchema).min(1, "Debe tener al menos un item"),
});

// ============================================================
// TIPOS INFERIDOS
// ============================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type EntryItemInput = z.infer<typeof entryItemSchema>;
export type EntryLotInput = z.infer<typeof entryLotSchema>;
export type CreateThirdPartyInput = z.infer<typeof createThirdPartySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
