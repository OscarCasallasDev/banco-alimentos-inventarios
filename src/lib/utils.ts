/**
 * Utilidades generales — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS con Tailwind merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un número con separador de miles
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("es-CO").format(num);
}

/**
 * Genera un UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Valida si un string es un UUID válido
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Trunca un string a una longitud máxima
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Capitaliza la primera letra de cada palabra
 */
export function capitalize(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

// Las fechas viven en su propio módulo para que la lógica de zona horaria
// del Banco no se mezcle con utilidades genéricas. Se re-exportan aquí para
// no romper las importaciones existentes.
export * from "./utils/dates";
