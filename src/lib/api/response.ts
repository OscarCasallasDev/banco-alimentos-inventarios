/**
 * Respuestas y manejo de errores de la API — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Todos los endpoints devuelven la misma forma:
 *   - Éxito  → `{ success: true, data }`
 *   - Error  → `{ success: false, error: { code, message, details? } }`
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApplicationError, handleApiError } from "@/lib/utils/errors";
import type { ApiError, ApiResponse } from "@/types/api";

/**
 * Respuesta exitosa.
 */
export function jsonOk<T>(data: T, status = 200): NextResponse {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

/**
 * Respuesta de error.
 */
export function jsonError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, string[]>
): NextResponse {
  const error: ApiError = { code, message, details };
  const body: ApiResponse<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

/**
 * Traduce un error de PostgreSQL a un mensaje comprensible para el usuario.
 */
function translateDatabaseError(error: { code?: string; message?: string }): {
  code: string;
  message: string;
  status: number;
} {
  switch (error.code) {
    case "23505":
      return {
        code: "CONFLICT",
        message: "Ya existe un registro con esos datos",
        status: 409,
      };
    case "23503":
      return {
        code: "VALIDATION_ERROR",
        message: "La referencia a otro registro no es válida",
        status: 400,
      };
    case "23514":
      return {
        code: "VALIDATION_ERROR",
        message: "El registro no cumple las reglas de la base de datos",
        status: 400,
      };
    case "22P02":
      return {
        code: "VALIDATION_ERROR",
        message: "Identificador con formato inválido",
        status: 400,
      };
    default:
      return {
        code: "DATABASE_ERROR",
        message: "Error de base de datos",
        status: 500,
      };
  }
}

/**
 * Manejador central de errores para los endpoints.
 *
 * @param error  Error lanzado por el servicio.
 * @param context Etiqueta del módulo, usada solo en el log del servidor.
 */
export function handleRouteError(error: unknown, context: string): NextResponse {
  if (error instanceof ZodError) {
    return jsonError(
      "VALIDATION_ERROR",
      "Datos inválidos",
      400,
      error.flatten().fieldErrors as Record<string, string[]>
    );
  }

  if (error instanceof ApplicationError) {
    const { status, body } = handleApiError(error);
    return jsonError(body.code, body.message, status, body.details);
  }

  const databaseError = error as { code?: string; message?: string };

  if (typeof databaseError?.code === "string" && /^[0-9A-Z]{5}$/.test(databaseError.code)) {
    const translated = translateDatabaseError(databaseError);
    console.error(`[${context}] Error de base de datos:`, error);
    return jsonError(translated.code, translated.message, translated.status);
  }

  console.error(`[${context}] Error no manejado:`, error);
  return jsonError("INTERNAL_ERROR", "Error interno del servidor", 500);
}
