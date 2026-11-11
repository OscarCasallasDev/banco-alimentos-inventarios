/**
 * Guardas de acceso para el backend.
 *
 * Centraliza la validación de rol, permiso y estado del módulo. Ocultar un
 * botón en la interfaz NO es una medida de seguridad: cada ruta API protegida
 * pasa por aquí antes de ejecutar nada.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { roles as rolesTable } from "@/lib/db/schema";
import { forbiddenError } from "@/lib/utils/errors";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import {
  permissionsForRole,
  type Permission,
} from "@/lib/auth/permissions";
import { MODULES, type ModuleKey } from "@/lib/config/modules";
import { isFeatureEnabled } from "@/lib/config/features";

/** Permisos almacenados en la base de datos para un rol. */
export async function storedPermissions(role: string): Promise<string[] | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(eq(rolesTable.name, role as never))
      .limit(1);
    return row?.permissions ?? null;
  } catch {
    return null;
  }
}

/** Permisos efectivos del usuario de la sesión. */
export async function permissionsOf(user: SessionUser): Promise<Permission[]> {
  const stored = await storedPermissions(user.role);
  return permissionsForRole(user.role, stored);
}

/** Exige que la sesión tenga uno de los roles indicados. */
export async function requireRole(
  ...roles: string[]
): Promise<SessionUser> {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    throw forbiddenError(
      `Esta operación requiere uno de estos roles: ${roles.join(", ")}`
    );
  }

  return user;
}

/** Exige que la sesión tenga el permiso indicado. */
export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await requireUser();
  const granted = await permissionsOf(user);

  if (!granted.includes(permission)) {
    throw forbiddenError(
      `No tiene el permiso requerido (${permission}). Contacte al administrador.`
    );
  }

  return user;
}

/** Exige que uno de los permisos indicados esté concedido. */
export async function requireAnyPermission(
  ...permissions: Permission[]
): Promise<SessionUser> {
  const user = await requireUser();
  const granted = await permissionsOf(user);

  if (!permissions.some((p) => granted.includes(p))) {
    throw forbiddenError(
      `No tiene ninguno de los permisos requeridos (${permissions.join(", ")}).`
    );
  }

  return user;
}

/**
 * Exige que el módulo esté habilitado y que el rol tenga acceso.
 *
 * Se usa en las rutas API de los módulos que pueden quedar en espera.
 */
export async function requireModuleAccess(
  module: ModuleKey
): Promise<SessionUser> {
  const user = await requireUser();
  const definition = MODULES[module];

  if (!definition) {
    throw forbiddenError(`Módulo desconocido: ${module}`);
  }

  const enabled = await isFeatureEnabled(definition.flag);
  if (!enabled) {
    throw forbiddenError(
      `El módulo "${definition.label}" está temporalmente en espera. Contacte al administrador para reactivarlo.`
    );
  }

  if (!definition.roles.includes(user.role)) {
    throw forbiddenError(
      `Su rol no tiene acceso al módulo "${definition.label}".`
    );
  }

  return user;
}

/**
 * Variante que además exige un permiso concreto.
 */
export async function requireModulePermission(
  module: ModuleKey,
  permission: Permission
): Promise<SessionUser> {
  const user = await requireModuleAccess(module);
  const granted = await permissionsOf(user);

  if (!granted.includes(permission)) {
    throw forbiddenError(
      `No tiene el permiso requerido (${permission}) para esta operación.`
    );
  }

  return user;
}

// ============================================================
// ACCESO DEL AGENTE LOCAL DE SINCRONIZACIÓN
// ============================================================

/** Cabecera con la clave del agente local. */
export const AGENT_KEY_HEADER = "x-siigo-agent-key";

/**
 * Autoriza una petición que viene del agente local de sincronización.
 *
 * El agente no tiene sesión de usuario: se autentica con una clave que el
 * administrador genera y que el sistema guarda CIFRADA. La clave permite
 * únicamente el envío de filas de importación y el cierre de la corrida.
 *
 * @returns true si la petición viene de un agente válido.
 */
export async function isValidAgentRequest(
  request: Request
): Promise<boolean> {
  const key = request.headers.get(AGENT_KEY_HEADER);
  if (!key) return false;

  const { authenticateAgent } = await import(
    "@/lib/services/siigo-import.service"
  );
  return authenticateAgent(key);
}

/**
 * Autorización para las rutas de importación.
 *
 * Acepta DOS orígenes:
 *   1. Un usuario con sesión y el permiso `siigo.import.run` (carga manual
 *      desde el navegador).
 *   2. El agente local, con su clave de API.
 */
export async function requireImportAccess(request: Request): Promise<void> {
  if (await isValidAgentRequest(request)) return;
  await requireModulePermission("integracion_siigo", "siigo.import.run");
}
