/**
 * Tipos de API — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Tipos para respuestas de API, manejo de errores,
 * y estructuras de paginación.
 */

// ============================================================
// RESPUESTAS ESTÁNDAR DE API
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================
// PARÁMETROS DE CONSULTA
// ============================================================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ProductQueryParams extends PaginationParams {
  search?: string;
  categoryId?: string;
  status?: string;
  warehouseId?: string;
}

export interface MovementQueryParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
  productId?: string;
  warehouseId?: string;
  type?: string;
  userId?: string;
  documentId?: string;
}

export interface InventoryQueryParams {
  productId?: string;
  warehouseId?: string;
  lowStock?: boolean;
}

// ============================================================
// ERRORES DE API
// ============================================================

export const ApiErrorCode = {
  // Autenticación
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Validación
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // Recursos
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Negocio
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  CANNOT_DELETE_WITH_HISTORY: "CANNOT_DELETE_WITH_HISTORY",

  // Servidor
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
} as const;

export type ApiErrorCode =
  (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

// ============================================================
// FILTROS DE BÚSQUEDA
// ============================================================

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export interface ProductFilter {
  search?: string;
  categoryId?: string;
  status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  warehouseId?: string;
}

export interface MovementFilter {
  dateRange?: DateRangeFilter;
  productId?: string;
  warehouseId?: string;
  type?: "ENTRY" | "EXIT" | "ADJUSTMENT" | "AUDIT";
  userId?: string;
  documentId?: string;
}

// ============================================================
// ESTADOS DE CARGA
// ============================================================

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface AsyncState<T> extends LoadingState {
  data: T | null;
}
