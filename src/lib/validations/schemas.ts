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
  /** Unidad física de conteo del stock (UND, PAQUETE, LB, KG…). */
  stockUnit: z
    .string()
    .trim()
    .min(1, "La unidad de stock es requerida")
    .max(20, "La unidad de stock no puede exceder 20 caracteres")
    .transform((value) => value.toUpperCase())
    .default("UND"),
  unitKind: z.enum(["COUNT", "MASS", "VOLUME", "UNKNOWN"]).default("UNKNOWN"),
  netWeightGrams: z
    .number()
    .min(0, "El peso neto no puede ser negativo")
    .max(999999999, "El peso neto es demasiado grande")
    .nullable()
    .optional(),
  netVolumeMl: z
    .number()
    .min(0, "El volumen neto no puede ser negativo")
    .max(999999999, "El volumen neto es demasiado grande")
    .nullable()
    .optional(),
  weightIsEstimate: z.boolean().default(false),
  tracksExpiration: z.boolean().default(true),
  categoryId: z
    .string()
    .uuid("Categoría inválida")
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
  minStock: z
    .number()
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
  /** Código del proveedor/fabricante. El código interno lo genera el sistema. */
  externalCode: z.string().trim().max(100).optional(),
  /** Compatibilidad con clientes anteriores: se trata como código externo. */
  code: z.string().trim().max(100).optional(),
  /** Denominación del lote (por ejemplo "Lotes Inicial"). */
  description: z.string().trim().max(100).optional(),
  /** Fecha de vencimiento (AAAA-MM-DD). */
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de vencimiento no es válida")
    .optional(),
  /**
   * El usuario confirma que NO conoce el vencimiento. El lote queda con
   * trazabilidad parcial; la fecha nunca se inventa.
   */
  expirationUnknown: z.boolean().optional(),
  /** Motivo por el que no se conoce el vencimiento. */
  expirationNote: z.string().trim().max(500).optional(),
  /** Cantidad del producto contenida en este lote. */
  quantity: z
    .number()
    .min(0.001, "La cantidad del lote debe ser mayor que cero")
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
  /**
   * Cantidad del pedido. Se admiten decimales porque hay productos que se
   * manejan por peso (kg) o por volumen (L).
   */
  quantity: z
    .number()
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

export const dispatchLotAllocationSchema = z.object({
  lotId: z.string().uuid("Lote inválido"),
  quantity: z
    .number()
    .min(0.001, "La cantidad del lote debe ser mayor que cero")
    .max(999999, "La cantidad del lote no puede exceder 999999"),
});

export const dispatchAllocationSchema = z.object({
  /** Línea del despacho a la que se asignan los lotes. */
  dispatchItemId: z.string().uuid("Línea de despacho inválida").optional(),
  productId: z.string().uuid("Producto inválido"),
  warehouseId: z.string().uuid("Bodega inválida"),
  lots: z
    .array(dispatchLotAllocationSchema)
    .min(1, "La asignación debe tener al menos un lote"),
});

export const createDispatchSchema = z.object({
  /** Si se omite, el sistema asigna el consecutivo (DES-2026-0001). */
  number: z.string().trim().max(50).optional(),
  receiptId: z.string().uuid("Recibo inválido"),
  date: z.string().min(1, "La fecha es requerida"),
  status: z
    .enum(["PENDING", "PREPARED", "DISPATCHED", "CANCELLED"])
    .default("DISPATCHED"),
  notes: z.string().max(2000).optional(),
  /**
   * Asignación manual de lotes por línea de despacho. Si se omite, el
   * servidor aplica FEFO. La suma debe coincidir con la línea del pedido.
   */
  allocations: z.array(dispatchAllocationSchema).optional(),
});

// ============================================================
// AUDITORÍAS
// ============================================================

export const auditItemLotSchema = z.object({
  lotId: z.string().uuid("Lote inválido"),
  /** Conteo físico verificado en ese lote. */
  physicalQuantity: z
    .number()
    .min(0, "La cantidad física no puede ser negativa")
    .max(999999, "La cantidad física no puede exceder 999999"),
});

export const auditItemSchema = z.object({
  productId: z.string().uuid("Producto inválido"),
  /** Conteo físico verificado en bodega. El sistema toma la existencia real. */
  physicalQuantity: z
    .number()
    .min(0, "La cantidad física no puede ser negativa")
    .max(999999, "La cantidad física no puede exceder 999999"),
  /**
   * Conteo por lote. Si se informa, el ajuste se aplica sobre esos lotes
   * concretos en lugar de repartirse por FEFO.
   */
  lots: z.array(auditItemLotSchema).optional(),
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
// LOTES, INVENTARIO Y MOVIMIENTOS
// ============================================================

/** Filtro de vencimiento aplicado a la consulta de lotes. */
export const lotExpirationFilterSchema = z.enum([
  "all",
  "today",
  "tomorrow",
  "soon",
  "expired",
  "range",
  "missing",
]);

/** Parámetros de la consulta de lotes. */
export const lotQuerySchema = z.object({
  productId: z.string().uuid("Producto inválido").optional(),
  warehouseId: z.string().uuid("Bodega inválida").optional(),
  status: z.string().trim().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  expiration: lotExpirationFilterSchema.default("all"),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de vencimiento no es válida")
    .optional(),
  expirationFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
    .optional(),
  expirationTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
    .optional(),
  hasStock: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  includeEmpty: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  trackingOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Parámetros de la consulta de inventario. */
export const inventoryQuerySchema = z.object({
  productId: z.string().uuid("Producto inválido").optional(),
  warehouseId: z.string().uuid("Bodega inválida").optional(),
  search: z.string().trim().max(100).optional(),
  lowStockOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Parámetros de la consulta de movimientos. */
export const movementQuerySchema = z.object({
  productId: z.string().uuid("Producto inválido").optional(),
  lotId: z.string().uuid("Lote inválido").optional(),
  warehouseId: z.string().uuid("Bodega inválida").optional(),
  type: z.enum(["ALL", "ENTRY", "EXIT", "ADJUSTMENT", "AUDIT"]).default("ALL"),
  documentType: z.string().trim().max(50).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
    .optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Parámetros del reporte de lotes por vencimiento. */
export const lotReportQuerySchema = lotQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

/** Actualización de los parámetros de vencimiento del Banco. */
export const updateExpirationSettingsSchema = z.object({
  alertDays: z
    .number()
    .int("Los días deben ser un número entero")
    .min(1, "El horizonte mínimo es de 1 día")
    .max(365, "El horizonte máximo es de 365 días"),
  criticalDays: z
    .number()
    .int("Los días deben ser un número entero")
    .min(1, "El umbral mínimo es de 1 día")
    .max(90, "El umbral máximo es de 90 días"),
});

/**
 * Cambio de estado de un lote (bloqueo o disposición final).
 *
 * Restablecer un lote bloqueado NO se hace por aquí: exige una auditoría
 * positiva autorizada, para que el historial de movimientos nunca se
 * reescriba.
 */
export const updateLotStatusSchema = z.object({
  status: z.enum(["BLOCKED", "DISPOSED", "CANCELLED"]),
  reason: z.string().trim().min(3, "Escribe el motivo del cambio").max(500),
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
export type DispatchAllocationInput = z.infer<typeof dispatchAllocationSchema>;
export type DispatchLotAllocationInput = z.infer<
  typeof dispatchLotAllocationSchema
>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type LotQueryInput = z.infer<typeof lotQuerySchema>;
export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;
export type MovementQueryInput = z.infer<typeof movementQuerySchema>;
export type LotReportQueryInput = z.infer<typeof lotReportQuerySchema>;
export type UpdateExpirationSettingsInput = z.infer<
  typeof updateExpirationSettingsSchema
>;
export type UpdateLotStatusInput = z.infer<typeof updateLotStatusSchema>;

// ============================================================
// PROGRAMAS / DESTINOS
// ============================================================

export const programSchema = z.object({
  code: z
    .string()
    .min(1, "El codigo es requerido")
    .max(30, "El codigo no puede exceder 30 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "El codigo solo admite letras, numeros, guion y guion bajo"),
  name: z
    .string()
    .min(2, "El nombre es requerido")
    .max(150, "El nombre no puede exceder 150 caracteres"),
  description: z.string().max(1000).nullish(),
  requiresReceiver: z.boolean().optional().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  sortOrder: z.number().int().min(0).max(999).optional().default(0),
});

export const updateProgramSchema = programSchema.partial();

// ============================================================
// SALIDAS DE ALMACEN
// ============================================================

export const salidaItemSchema = z.object({
  productId: z.string().uuid("El producto es requerido"),
  siigoBodegaCode: z.number().int().min(0, "La bodega es requerida"),
  /** Ubicaci?n: en la vista consolidada se usa 0 (cualquier ubicaci?n). */
  locationCode: z.number().int().min(0).optional().default(0),
  quantity: z
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(9_999_999, "La cantidad es demasiado grande"),
  /** Unidad de control del producto (UND, KG, GR, CAJA?). */
  unit: z.string().max(20).nullish(),
  /** Peso registrado por el almacenista. */
  weight: z.number().min(0).max(1_000_000).nullish(),
  /** Unidad del peso: kg, g, ml, l. */
  weightUnit: z.enum(["kg", "g", "ml", "l"]).nullish(),
  /** Fecha de vencimiento del producto en esta l?nea. */
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de vencimiento debe tener el formato AAAA-MM-DD")
    .nullish(),
  notes: z.string().max(500).nullish(),
});

export const createSalidaSchema = z.object({
  programId: z.string().uuid("El programa es requerido"),
  /** Destino (parroquia / grupo de familia) del cat?logo configurable. */
  destinationId: z.string().uuid("El destino es requerido").nullish(),
  warehouseId: z.string().uuid().nullish(),
  siigoBodegaCode: z.number().int().min(0).nullish(),
  locationCode: z.number().int().min(0).nullish(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD")
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "La hora debe tener el formato HH:MM")
    .optional(),
  /** Almacenista que ENTREGA (obligatorio al crear la orden). */
  delivererName: z
    .string()
    .min(1, "El nombre del almacenista es obligatorio")
    .max(150),
  delivererDocument: z.string().max(60).nullish(),
  notes: z.string().max(2000).nullish(),
  items: z.array(salidaItemSchema).min(1, "Agregue al menos un producto"),
});

export const updateSalidaSchema = createSalidaSchema.partial();

export const salidaEstadoSchema = z.object({
  action: z.enum(["generar", "entregar", "confirmar_siigo", "anular"]),
  /** Datos de quien RECIBE (se diligencian al confirmar la recepci?n). */
  receiverName: z.string().max(150).nullish(),
  receiverDocument: z.string().max(60).nullish(),
  receiverTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "La hora debe tener el formato HH:MM")
    .nullish(),
  siigoDocumentRef: z.string().max(80).nullish(),
  reason: z.string().max(500).nullish(),
});

export const salidaQuerySchema = z.object({
  status: z.string().max(20).optional(),
  programId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(25),
});

// ============================================================
// EXISTENCIAS (INVENTARIO IMPORTADO)
// ============================================================

export const existenciasQuerySchema = z.object({
  search: z.string().max(100).optional(),
  siigoBodegaCode: z.coerce.number().int().min(0).optional(),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  /** Filtro por disponibilidad consolidada. */
  availability: z
    .enum(["all", "positive", "zero", "negative"])
    .optional()
    .default("all"),
  onlyWithStock: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  reviewOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ============================================================
// IMPORTACION SIIGO
// ============================================================

export const siigoWireRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  productCode: z.string().min(1).max(60),
  productName: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  unit: z.string().max(20).optional(),
  brand: z.string().max(200).optional(),
  description: z.string().max(300).optional(),
  document: z.string().max(60),
  date: z.string().max(10).nullish(),
  isOpening: z.boolean(),
  bodega: z.number().int(),
  ubicacion: z.number().int(),
  qtyBefore: z.number().optional(),
  qtyIn: z.number().optional(),
  qtyOut: z.number().optional(),
  qtyNet: z.number().optional(),
  qtyAccum: z.number().optional(),
  valueMovement: z.number().optional(),
  qty2In: z.number().optional(),
  qty2Out: z.number().optional(),
  qty2Balance: z.number().optional(),
});

export const createSiigoRunSchema = z.object({
  fileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "El hash del archivo debe ser SHA-256 en hexadecimal"),
  fileName: z.string().max(300).optional(),
  fileSize: z.number().int().min(0).optional(),
  source: z.enum(["MANUAL", "AGENT"]).optional().default("MANUAL"),
  agentId: z.string().max(120).optional(),
  meta: z
    .object({
      title: z.string().optional(),
      periodFrom: z.string().max(10).nullish(),
      periodTo: z.string().max(10).nullish(),
      generatedAt: z.string().max(40).nullish(),
      reportDate: z.string().max(10).nullish(),
    })
    .optional(),
});

export const siigoBatchSchema = z.object({
  batchIndex: z.number().int().min(0).max(100_000),
  rows: z.array(siigoWireRowSchema).min(1, "El lote no puede estar vacio").max(20_000),
});

export const siigoWarehouseMapSchema = z.object({
  siigoBodegaCode: z.number().int().min(0).max(999),
  warehouseId: z.string().uuid().nullish(),
  label: z.string().max(100).nullish(),
  isActive: z.boolean().optional().default(true),
});

export const siigoCreateWarehouseSchema = z.object({
  siigoBodegaCode: z.number().int().min(0).max(999),
  name: z.string().min(2).max(150),
});

export const agentKeySchema = z.object({
  label: z.string().min(2).max(80),
});

export type ProgramInput = z.infer<typeof programSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type SalidaItemInput = z.infer<typeof salidaItemSchema>;
export type CreateSalidaInput = z.infer<typeof createSalidaSchema>;
export type UpdateSalidaInput = z.infer<typeof updateSalidaSchema>;
export type SalidaEstadoInput = z.infer<typeof salidaEstadoSchema>;
export type SalidaQueryInput = z.infer<typeof salidaQuerySchema>;
export type ExistenciasQueryInput = z.infer<typeof existenciasQuerySchema>;
export type CreateSiigoRunInput = z.infer<typeof createSiigoRunSchema>;
export type SiigoBatchInput = z.infer<typeof siigoBatchSchema>;
export type SiigoWarehouseMapInput = z.infer<typeof siigoWarehouseMapSchema>;