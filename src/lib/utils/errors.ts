/**
 * Manejo de errores centralizado — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

// ============================================================
// TIPOS DE ERROR
// ============================================================

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_CREDENTIALS"
  | "INTERNAL_ERROR"
  | "DATABASE_ERROR"
  | "EXPORT_ERROR";

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, string[]>;
}

// ============================================================
// CLASE DE ERROR PERSONALIZADA
// ============================================================

export class ApplicationError extends Error {
  public code: ErrorCode;
  public details?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }
}

// ============================================================
// FUNCIONES DE ERROR
// ============================================================

export function createError(code: ErrorCode, message: string, details?: Record<string, string[]>): ApplicationError {
  return new ApplicationError(code, message, details);
}

export function validationError(details: Record<string, string[]>): ApplicationError {
  return new ApplicationError("VALIDATION_ERROR", "Datos inválidos", details);
}

export function notFoundError(resource: string): ApplicationError {
  return new ApplicationError("NOT_FOUND", `${resource} no encontrado`);
}

export function unauthorizedError(message = "No autorizado"): ApplicationError {
  return new ApplicationError("UNAUTHORIZED", message);
}

export function forbiddenError(message = "Acceso denegado"): ApplicationError {
  return new ApplicationError("FORBIDDEN", message);
}

export function conflictError(message: string): ApplicationError {
  return new ApplicationError("CONFLICT", message);
}

export function insufficientStockError(): ApplicationError {
  return new ApplicationError("INSUFFICIENT_STOCK", "Stock insuficiente");
}

export function invalidCredentialsError(): ApplicationError {
  return new ApplicationError("INVALID_CREDENTIALS", "Credenciales inválidas");
}

export function internalError(message = "Error interno del servidor"): ApplicationError {
  return new ApplicationError("INTERNAL_ERROR", message);
}

export function databaseError(message = "Error de base de datos"): ApplicationError {
  return new ApplicationError("DATABASE_ERROR", message);
}

export function exportError(message = "Error al exportar"): ApplicationError {
  return new ApplicationError("EXPORT_ERROR", message);
}

// ============================================================
// MANEJADOR DE ERRORES DE API
// ============================================================

export function handleApiError(error: unknown): { status: number; body: AppError } {
  if (error instanceof ApplicationError) {
    const statusMap: Record<ErrorCode, number> = {
      VALIDATION_ERROR: 400,
      NOT_FOUND: 404,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      CONFLICT: 409,
      INSUFFICIENT_STOCK: 400,
      INVALID_CREDENTIALS: 401,
      INTERNAL_ERROR: 500,
      DATABASE_ERROR: 500,
      EXPORT_ERROR: 500,
    };

    return {
      status: statusMap[error.code],
      body: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  // Error desconocido
  console.error("Error no manejado:", error);
  return {
    status: 500,
    body: {
      code: "INTERNAL_ERROR",
      message: "Error interno del servidor",
    },
  };
}

// ============================================================
// MANEJADOR DE ERRORES DE ZOD
// ============================================================

export function handleZodError(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): { status: number; body: AppError } {
  return {
    status: 400,
    body: {
      code: "VALIDATION_ERROR",
      message: "Datos inválidos",
      details: error.flatten().fieldErrors,
    },
  };
}
