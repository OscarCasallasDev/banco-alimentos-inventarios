/**
 * Hash de contraseñas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Se usa SHA-256 en hexadecimal para mantener compatibilidad con el hash
 * del usuario administrador incluido en `drizzle/seed.sql`
 * (admin / admin123).
 *
 * NOTA (deuda técnica conocida): SHA-256 sin sal no es ideal para
 * contraseñas. La migración a bcrypt/argon2 o Supabase Auth queda
 * pendiente de validación con el Banco y está documentada en
 * `docs/ARQUITECTURA.md`.
 */

import { createHash, timingSafeEqual } from "crypto";

/**
 * Genera el hash de una contraseña.
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * Compara una contraseña en claro con su hash de forma constante en el tiempo.
 */
export function verifyPassword(password: string, passwordHash: string): boolean {
  const stored = Buffer.from(passwordHash, "hex");
  const computed = Buffer.from(hashPassword(password), "hex");

  if (stored.length !== computed.length) {
    return false;
  }

  return timingSafeEqual(stored, computed);
}
