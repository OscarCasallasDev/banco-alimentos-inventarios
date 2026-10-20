/**
 * Sesión de usuario — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * La sesión viaja en una cookie `HttpOnly` firmada con HMAC-SHA256.
 * El token contiene el identificador del usuario y su fecha de expiración,
 * por lo que no es falsificable desde el cliente (a diferencia de guardar
 * el `user_id` en una cookie legible).
 *
 * - `createSessionToken(userId)` → token firmado.
 * - `verifySessionToken(token)`  → `userId` si el token es válido, si no `null`.
 * - `getCurrentUser()`            → usuario de la sesión activa o `null`.
 * - `requireUser()`               → usuario de la sesión o error 401.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { unauthorizedError } from "@/lib/utils/errors";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";
import type { UserRole, UserStatus } from "@/types";

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

export interface SessionUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}

/**
 * Secreto de firma de la sesión. Debe tener al menos 32 caracteres.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET no está definida o es demasiado corta (mínimo 32 caracteres)"
    );
  }

  return secret;
}

/**
 * Genera un token de sesión firmado para el usuario indicado.
 */
export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/**
 * Valida un token de sesión y devuelve el `userId` si es válido.
 */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  const [userId, expiresAt] = payload.split(".");
  if (!userId || !expiresAt) return null;

  if (Number(expiresAt) < Date.now()) return null;

  return userId;
}

/**
 * Construye la cookie de sesión.
 */
export function buildSessionCookie(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  };
}

/**
 * Obtiene el usuario de la sesión activa, o `null` si no hay sesión válida.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!userId) return null;

  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.status !== "ACTIVE") return null;

  return user;
}

/**
 * Verifica si hay una sesión activa.
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

/**
 * Exige una sesión activa. Lanza un error 401 si no la hay.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw unauthorizedError("No autenticado");
  }

  return user;
}
