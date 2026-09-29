/**
 * Tipos del dominio — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

export type UserRole = "SUPERADMIN" | "ADMIN" | "RECEPCION" | "DESPACHO" | "CONTABILIDAD";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";
export type WarehouseType = "PROPIA" | "TERCERO" | "CAMPAIGN" | "PROGRAM";
export type WarehouseStatus = "ACTIVE" | "INACTIVE";
export type MovementType = "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";
export type EntryFormat = "E1" | "E3" | "N3" | "N5";
export type EntryStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type OrderStatus = "DRAFT" | "APPROVED" | "INVOICED" | "DISPATCHED" | "CANCELLED";
export type InvoiceFormat = "SF1" | "F2";
export type InvoiceStatus = "DRAFT" | "GENERATED" | "ASSOCIATED_TO_RECEIPT" | "CANCELLED";
export type ReceiptFormat = "R1" | "R2" | "R3" | "R4";
export type ReceiptStatus = "DRAFT" | "GENERATED" | "CANCELLED";
export type DispatchStatus = "PENDING" | "PREPARED" | "DISPATCHED" | "CANCELLED";
export type AuditStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
