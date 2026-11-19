/**
 * Generación del nombre de usuario — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * El superadmin NO escribe el nombre de usuario: se arma con el nombre y el
 * apellido que escribe en el formulario.
 *
 *     Carlos + Ramírez  ->  carlosramirez
 *
 * Reglas:
 *   - Se convierte a minúsculas.
 *   - Se eliminan tildes y caracteres especiales.
 *   - Se eliminan los espacios entre nombre y apellido.
 *   - Si ya existe, se añade un sufijo numérico: carlosramirez2.
 */

import { like } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";

/**
 * Normaliza un texto para formar parte de un nombre de usuario:
 * minúsculas, sin tildes y sin caracteres especiales ni espacios.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Quita los diacríticos (á → a, ñ → n, ü → u).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Deja solo letras y números: fuera espacios, signos y acentos.
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Nombre de usuario base a partir del nombre y el apellido.
 */
export function buildUsername(firstName: string, lastName: string): string {
  const base = `${slugify(firstName)}${slugify(lastName)}`;
  return base || "usuario";
}

/**
 * Propone un nombre de usuario único.
 *
 * Se consulta la base para conocer los nombres que ya empiezan por la misma
 * base y se añade un sufijo numérico hasta encontrar uno libre.
 */
export async function suggestUsername(
  executor: DbExecutor,
  firstName: string,
  lastName: string
): Promise<string> {
  const base = buildUsername(firstName, lastName);

  const existentes = await executor
    .select({ username: users.username })
    .from(users)
    .where(like(users.username, `${base}%`));

  const occupied = new Set(existentes.map((row) => row.username));

  if (!occupied.has(base)) return base;

  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }

  // Caso extremo: la base está ocupada por 9999 variantes.
  return `${base}${Date.now()}`;
}
