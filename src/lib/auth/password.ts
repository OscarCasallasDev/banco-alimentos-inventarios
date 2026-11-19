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

// ============================================================
// POLÍTICA DE CONTRASEÑAS
// ============================================================

export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 100,
} as const;

/** Caracteres que cuentan como símbolo especial. */
const SPECIAL_CHARACTERS = /[^A-Za-z0-9]/;

export interface PasswordCheck {
  valid: boolean;
  /** Motivos del rechazo, listos para mostrar al usuario. */
  errors: string[];
}

/**
 * Valida la contraseña contra la política de seguridad.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  const errors: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Debe tener al menos ${PASSWORD_POLICY.minLength} caracteres.`);
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`No puede exceder ${PASSWORD_POLICY.maxLength} caracteres.`);
  }

  if (!/[A-Za-z]/.test(password)) {
    errors.push("Debe incluir al menos una letra.");
  }

  if (!/\d/.test(password)) {
    errors.push("Debe incluir al menos un número.");
  }

  if (!SPECIAL_CHARACTERS.test(password)) {
    errors.push("Debe incluir al menos un símbolo especial.");
  }

  return { valid: errors.length === 0, errors };
}
