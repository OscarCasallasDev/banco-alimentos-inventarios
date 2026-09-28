/**
 * Tipos del dominio — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Estos tipos representan las entidades del negocio
 * y los DTOs (Data Transfer Objects) para la API.
 */

import type {
  User,
  Product,
  Category,
  Warehouse,
  Inventory,
  InventoryMovement,
  Entry,
  EntryItem,
  Order,
  OrderItem,
  Invoice,
  InvoiceItem,
  Receipt,
  Dispatch,
  DispatchItem,
  Audit,
  AuditItem,
  AuditLog,
} from "./database";

// ============================================================
// REEXPORTS DE TIPOS DE BASE DE DATOS
// ============================================================

export type {
  User,
  Product,
  Category,
  Warehouse,
  Inventory,
  InventoryMovement,
  Entry,
  EntryItem,
  Order,
  OrderItem,
  Invoice,
  InvoiceItem,
  Receipt,
  Dispatch,
  DispatchItem,
  Audit,
  AuditItem,
  AuditLog,
};

// ============================================================
// DTOs — OBJETOS DE TRANSFERENCIA DE DATOS
// ============================================================

// ---------- Usuarios ----------

export interface CreateUserDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: User["role"];
}

export interface UpdateUserDTO {
  firstName?: string;
  lastName?: string;
  role?: User["role"];
  status?: User["status"];
}

export interface UserResponseDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: User["role"];
  status: User["status"];
  lastLoginAt: string | null;
  createdAt: string;
}

// ---------- Productos ----------

export interface CreateProductDTO {
  code: string;
  name: string;
  description: string;
  presentation: string;
  weight: number;
  unit: string;
  categoryId?: string | null;
  minStock?: number;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  presentation?: string;
  weight?: number;
  unit?: string;
  categoryId?: string | null;
  minStock?: number;
  status?: Product["status"];
}

export interface ProductWithCategory extends Product {
  category: Category | null;
}

// ---------- Bodegas ----------

export interface CreateWarehouseDTO {
  code: string;
  name: string;
  description: string;
  type: Warehouse["type"];
  observations?: string | null;
}

export interface UpdateWarehouseDTO {
  name?: string;
  description?: string;
  type?: Warehouse["type"];
  status?: Warehouse["status"];
  observations?: string | null;
}

// ---------- Inventario ----------

export interface InventoryWithDetails extends Inventory {
  product: Product;
  warehouse: Warehouse;
}

export interface StockValidationResult {
  available: boolean;
  currentStock: number;
  requestedQuantity: number;
  message: string;
}

// ---------- Entradas ----------

export interface CreateEntryDTO {
  format: Entry["format"];
  date: string;
  nit?: string | null;
  origin?: string | null;
  document?: string | null;
  notes?: string | null;
  items: CreateEntryItemDTO[];
}

export interface CreateEntryItemDTO {
  productId: string;
  warehouseId: string;
  quantity: number;
  unit: string;
  presentation?: string | null;
}

export interface EntryWithItems extends Entry {
  items: (EntryItem & { product: Product; warehouse: Warehouse })[];
  user: UserResponseDTO;
}

// ---------- Pedidos ----------

export interface CreateOrderDTO {
  date: string;
  nit?: string | null;
  destination?: string | null;
  notes?: string | null;
  items: CreateOrderItemDTO[];
}

export interface CreateOrderItemDTO {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface OrderWithItems extends Order {
  items: (OrderItem & { product: Product; warehouse: Warehouse })[];
  user: UserResponseDTO;
}

// ---------- Facturas ----------

export interface CreateInvoiceDTO {
  format: Invoice["format"];
  orderId: string;
  date: string;
}

export interface InvoiceWithItems extends Invoice {
  items: (InvoiceItem & { product: Product })[];
  order: Order;
  user: UserResponseDTO;
}

// ---------- Recibos ----------

export interface CreateReceiptDTO {
  format: Receipt["format"];
  invoiceId: string;
  date: string;
}

// ---------- Despachos ----------

export interface CreateDispatchDTO {
  receiptId: string;
  date: string;
  notes?: string | null;
  items: CreateDispatchItemDTO[];
}

export interface CreateDispatchItemDTO {
  productId: string;
  warehouseId: string;
  quantity: number;
}

// ---------- Auditoría ----------

export interface CreateAuditDTO {
  date: string;
  warehouseId: string;
  responsible: string;
  notes?: string | null;
  items: CreateAuditItemDTO[];
}

export interface CreateAuditItemDTO {
  productId: string;
  systemQuantity: number;
  physicalQuantity: number;
  observation?: string | null;
}

export interface AuditWithItems extends Audit {
  items: (AuditItem & { product: Product })[];
  warehouse: Warehouse;
  user: UserResponseDTO;
}

// ---------- Movimientos ----------

export interface MovementWithDetails extends InventoryMovement {
  product: Product;
  warehouse: Warehouse;
  user: UserResponseDTO;
}

// ---------- Dashboard ----------

export interface DispatchWithItems extends Dispatch {
  items: (DispatchItem & { product: Product; warehouse: Warehouse })[];
  receipt: Receipt;
  user: UserResponseDTO;
}

export interface DashboardStats {
  totalProducts: number;
  totalUnits: number;
  recentEntries: EntryWithItems[];
  recentExits: DispatchWithItems[];
  lowStockProducts: ProductWithCategory[];
  recentMovements: MovementWithDetails[];
  pendingAudits: number;
  detectedDifferences: number;
}

// ---------- Reportes ----------

export interface InventoryReportRow {
  producto: string;
  referencia: string;
  presentacion: string;
  bodega: string;
  existencia: number;
  estado: string;
}

export interface MovementReportRow {
  fecha: string;
  tipoMovimiento: string;
  producto: string;
  referencia: string;
  bodega: string;
  cantidad: number;
  documento: string;
  usuario: string;
}

export interface AuditReportRow {
  producto: string;
  referencia: string;
  bodega: string;
  existenciaSistema: number;
  existenciaFisica: number;
  diferencia: number;
  fecha: string;
  responsable: string;
  observacion: string;
}

// ---------- Integración Siigo ----------

export type SiigoIntegrationStatus = "REAL" | "DEMO" | "PENDIENTE";

export interface SiigoExportResult {
  success: boolean;
  fileName: string;
  rowCount: number;
  message: string;
}

export interface SiigoImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  message: string;
}

export interface SiigoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
