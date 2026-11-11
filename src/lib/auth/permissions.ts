/**
 * Matriz de permisos por rol.
 *
 * Los permisos viven en la tabla `roles.permissions` (columna `text[]`), de modo
 * que el administrador puede ajustarlos sin recompilar. Este archivo solo define
 * los nombres de permiso y la matriz inicial usada como semilla.
 */

export const PERMISSIONS = [
  "inventory.read",
  "salidas.read",
  "salidas.create",
  "salidas.edit",
  "salidas.generate",
  "salidas.view_document",
  "salidas.cancel",
  "salidas.receive",
  "salidas.confirm_siigo",
  "siigo.import.run",
  "siigo.import.read",
  "siigo.map_warehouses",
  "programs.manage",
  "users.manage",
  "settings.manage",
  "modules.toggle",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleName =
  | "SUPERADMIN"
  | "ADMIN"
  | "ALMACENISTA"
  | "RECEPCION"
  | "DESPACHO"
  | "CONTABILIDAD";

/** Matriz inicial (semilla). La base de datos es la fuente de verdad. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPERADMIN: [...PERMISSIONS],
  ADMIN: [
    "inventory.read",
    "salidas.read",
    "salidas.create",
    "salidas.edit",
    "salidas.generate",
    "salidas.view_document",
    "salidas.cancel",
    "salidas.receive",
    "salidas.confirm_siigo",
    "siigo.import.run",
    "siigo.import.read",
    "siigo.map_warehouses",
    "programs.manage",
    "users.manage",
    "settings.manage",
    "modules.toggle",
  ],
  ALMACENISTA: [
    "inventory.read",
    "salidas.read",
    "salidas.create",
    "salidas.edit",
    "salidas.generate",
    "salidas.view_document",
    "salidas.cancel",
  ],
  RECEPCION: ["inventory.read"],
  DESPACHO: [
    "inventory.read",
    "salidas.read",
    "salidas.view_document",
    "salidas.receive",
    "salidas.confirm_siigo",
    "siigo.import.read",
  ],
  CONTABILIDAD: ["inventory.read", "siigo.import.read"],
};

/** Permisos efectivos de un rol, con la matriz por defecto como respaldo. */
export function permissionsForRole(
  role: string,
  stored?: string[] | null
): Permission[] {
  if (Array.isArray(stored) && stored.length > 0) {
    const valid = new Set<string>(PERMISSIONS);
    return stored.filter((p): p is Permission => valid.has(p));
  }
  const fallback = DEFAULT_ROLE_PERMISSIONS[role as RoleName];
  return fallback ? [...fallback] : ["inventory.read"];
}

/** Indica si el rol tiene el permiso. */
export function roleHasPermission(
  role: string,
  permission: Permission,
  stored?: string[] | null
): boolean {
  return permissionsForRole(role, stored).includes(permission);
}
