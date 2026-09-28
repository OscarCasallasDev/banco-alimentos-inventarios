/**
 * Tipos de base de datos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Estos tipos representan las tablas de la base de datos.
 * Se usan con Drizzle ORM para type-safety.
 */

// ============================================================
// USUARIOS Y AUTENTICACIÓN
// ============================================================

export type UserRole = "SUPERADMIN" | "ADMIN" | "RECEPCION" | "DESPACHO" | "CONTABILIDAD";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface User {
  id: string; // UUID
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: UserRole;
  description: string;
  permissions: string[];
  createdAt: string;
}

// ============================================================
// PRODUCTOS Y CATEGORÍAS
// ============================================================

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

export interface Product {
  id: string; // UUID
  code: string; // Código único del producto
  name: string;
  description: string;
  presentation: string; // Presentación (ej: "Bolsa 500g")
  weight: number; // Peso numérico
  unit: string; // Unidad de medida (ej: "kg", "g", "unidad")
  categoryId: string | null;
  status: ProductStatus;
  minStock: number; // Stock mínimo para alertas
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

// ============================================================
// BODEGAS
// ============================================================

export type WarehouseType = "PROPIA" | "TERCERO" | "CAMPAIGN" | "PROGRAM";

export type WarehouseStatus = "ACTIVE" | "INACTIVE";

export interface Warehouse {
  id: string;
  code: string; // Código de la bodega (ej: "1.1")
  name: string; // Nombre descriptivo
  description: string;
  type: WarehouseType;
  status: WarehouseStatus;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// INVENTARIO
// ============================================================

export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number; // Cantidad actual calculada
  lastMovementAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MOVIMIENTOS DE INVENTARIO
// ============================================================

export type MovementType = "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";

export interface InventoryMovement {
  id: string;
  type: MovementType;
  productId: string;
  warehouseId: string;
  quantity: number; // Positivo para entrada, negativo para salida
  balanceAfter: number; // Saldo después del movimiento
  documentId: string | null; // ID del documento relacionado
  documentType: string | null; // Tipo de documento (entry, order, etc.)
  userId: string; // Usuario que realizó el movimiento
  notes: string | null;
  createdAt: string;
}

// ============================================================
// ENTRADAS
// ============================================================

export type EntryFormat = "E1" | "E3" | "N3" | "N5";

export type EntryStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export interface Entry {
  id: string;
  format: EntryFormat;
  number: string; // Consecutivo interno
  date: string;
  nit: string | null;
  origin: string | null;
  document: string | null;
  status: EntryStatus;
  userId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntryItem {
  id: string;
  entryId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unit: string;
  presentation: string | null;
  createdAt: string;
}

// ============================================================
// PEDIDOS (ÓRDENES)
// ============================================================

export type OrderStatus = "DRAFT" | "APPROVED" | "INVOICED" | "DISPATCHED" | "CANCELLED";

export interface Order {
  id: string;
  number: string; // Número de pedido
  date: string;
  nit: string | null;
  destination: string | null;
  status: OrderStatus;
  userId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  createdAt: string;
}

// ============================================================
// FACTURAS
// ============================================================

export type InvoiceFormat = "SF1" | "F2";

export type InvoiceStatus = "DRAFT" | "GENERATED" | "ASSOCIATED_TO_RECEIPT" | "CANCELLED";

export interface Invoice {
  id: string;
  format: InvoiceFormat;
  number: string;
  orderId: string;
  date: string;
  status: InvoiceStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: number;
  createdAt: string;
}

// ============================================================
// RECIBOS DE CAJA
// ============================================================

export type ReceiptFormat = "R1" | "R2" | "R3" | "R4";

export type ReceiptStatus = "DRAFT" | "GENERATED" | "CANCELLED";

export interface Receipt {
  id: string;
  format: ReceiptFormat;
  number: string;
  invoiceId: string;
  date: string;
  status: ReceiptStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DESPACHOS
// ============================================================

export type DispatchStatus = "PENDING" | "PREPARED" | "DISPATCHED" | "CANCELLED";

export interface Dispatch {
  id: string;
  number: string;
  receiptId: string;
  date: string;
  status: DispatchStatus;
  userId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchItem {
  id: string;
  dispatchId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  createdAt: string;
}

// ============================================================
// AUDITORÍA
// ============================================================

export type AuditStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Audit {
  id: string;
  date: string;
  warehouseId: string;
  responsible: string;
  status: AuditStatus;
  notes: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditItem {
  id: string;
  auditId: string;
  productId: string;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number; // physicalQuantity - systemQuantity
  observation: string | null;
  createdAt: string;
}

// ============================================================
// LOGS DE AUDITORÍA DEL SISTEMA
// ============================================================

export type AuditLogAction =
  | "LOGIN"
  | "LOGOUT"
  | "PRODUCT_CREATE"
  | "PRODUCT_UPDATE"
  | "PRODUCT_DEACTIVATE"
  | "ENTRY_CREATE"
  | "ENTRY_CONFIRM"
  | "EXIT_CREATE"
  | "ORDER_CREATE"
  | "INVOICE_CREATE"
  | "RECEIPT_CREATE"
  | "DISPATCH_CREATE"
  | "AUDIT_CREATE"
  | "EXPORT"
  | "IMPORT"
  | "SIIGO_OPERATION"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DEACTIVATE";

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditLogAction;
  entity: string; // Tabla o módulo afectado
  entityId: string | null; // ID del registro afectado
  result: "SUCCESS" | "FAILURE" | "ERROR";
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ============================================================
// DOCUMENTOS / SOPORTES
// ============================================================

export type DocumentType = "ENTRY" | "ORDER" | "INVOICE" | "RECEIPT" | "DISPATCH";

export interface Document {
  id: string;
  type: DocumentType;
  number: string;
  relatedId: string; // ID del registro principal
  generatedBy: string;
  createdAt: string;
}
