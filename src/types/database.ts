/**
 * Tipos de base de datos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * FUENTE ÚNICA DE VERDAD: todos estos tipos se derivan del schema de
 * Drizzle (`src/lib/db/schema.ts`). No se duplican a mano, de modo que
 * cualquier cambio en el schema se refleja aquí automáticamente.
 *
 * Convenciones:
 * - Las columnas de PostgreSQL son snake_case.
 * - Drizzle expone las filas en camelCase: `minStock`, `createdAt`, etc.
 */

import {
  auditLogActionEnum,
  auditStatusEnum,
  dispatchStatusEnum,
  documentTypeEnum,
  entryFormatEnum,
  entryStatusEnum,
  invoiceFormatEnum,
  invoiceStatusEnum,
  movementTypeEnum,
  orderStatusEnum,
  productStatusEnum,
  receiptFormatEnum,
  receiptStatusEnum,
  userRoleEnum,
  userStatusEnum,
  warehouseStatusEnum,
  warehouseTypeEnum,
  auditItems,
  auditLogs,
  audits,
  categories,
  dispatchItems,
  dispatches,
  documents,
  entries,
  entryItems,
  inventory,
  inventoryMovements,
  invoices,
  invoiceItems,
  orderItems,
  orders,
  products,
  receipts,
  roles,
  users,
  warehouses,
} from "@/lib/db/schema";

// ============================================================
// ENUMERACIONES
// ============================================================

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type WarehouseType = (typeof warehouseTypeEnum.enumValues)[number];
export type WarehouseStatus = (typeof warehouseStatusEnum.enumValues)[number];
export type MovementType = (typeof movementTypeEnum.enumValues)[number];
export type EntryFormat = (typeof entryFormatEnum.enumValues)[number];
export type EntryStatus = (typeof entryStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type InvoiceFormat = (typeof invoiceFormatEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type ReceiptFormat = (typeof receiptFormatEnum.enumValues)[number];
export type ReceiptStatus = (typeof receiptStatusEnum.enumValues)[number];
export type DispatchStatus = (typeof dispatchStatusEnum.enumValues)[number];
export type AuditStatus = (typeof auditStatusEnum.enumValues)[number];
export type AuditLogAction = (typeof auditLogActionEnum.enumValues)[number];
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];

// ============================================================
// FILAS DE LAS TABLAS
// ============================================================

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Inventory = typeof inventory.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryItem = typeof entryItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type Dispatch = typeof dispatches.$inferSelect;
export type DispatchItem = typeof dispatchItems.$inferSelect;
export type Audit = typeof audits.$inferSelect;
export type AuditItem = typeof auditItems.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Document = typeof documents.$inferSelect;
