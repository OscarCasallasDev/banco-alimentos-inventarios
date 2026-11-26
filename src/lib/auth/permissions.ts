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
  | "COORDINADOR"
  | "ALMACENISTA"
  | "RECEPCION"
  | "DESPACHO"
  | "CONTABILIDAD";

/**
 * Alias de escritura libre -> rol real.
 *
 * El superadmin escribe el rol a mano, así que «Almacenista», «ALMACENISTA»
 * y «almacenista» deben reconocer el mismo rol, igual que «administrador»
 * o «  Almacenista  ».
 */
const ROLE_ALIASES: Record<string, RoleName> = {
  SUPERADMIN: "SUPERADMIN",
  "SUPER ADMIN": "SUPERADMIN",
  SUPERADMINISTRADOR: "SUPERADMIN",
  ADMIN: "ADMIN",
  ADMINISTRADOR: "ADMIN",
  COORDINADOR: "COORDINADOR",
  COORDINACION: "COORDINADOR",
  ALMACENISTA: "ALMACENISTA",
  ALMACEN: "ALMACENISTA",
  RECEPCION: "RECEPCION",
  RECEPCIONISTA: "RECEPCION",
  DESPACHO: "DESPACHO",
  DESPACHADOR: "DESPACHO",
  CONTABILIDAD: "CONTABILIDAD",
  CONTADOR: "CONTABILIDAD",
};

/**
 * Normaliza el rol escrito a mano y devuelve el rol real.
 *
 * @returns el rol normalizado, o `null` si no corresponde a ninguno.
 */
export function normalizeRole(input: string): RoleName | null {
  const key = input.trim().replace(/\s+/g, " ").toUpperCase();
  return ROLE_ALIASES[key] ?? null;
}

/** Rol escrito a mano -> rol normalizado, para mostrarlo en la interfaz. */
export const ROLE_INPUT_HINT =
  "Ejemplos: almacenista, coordinador, despacho, administrador.";

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
  COORDINADOR: [
    "inventory.read",
    "salidas.read",
    "salidas.create",
    "salidas.edit",
    "salidas.generate",
    "salidas.view_document",
    "salidas.receive",
    "siigo.import.read",
    "programs.manage",
  ],
  ALMACENISTA: [
    "inventory.read",
    "salidas.read",
    "salidas.create",
    "salidas.edit",
    "salidas.generate",
    "salidas.view_document",
    "salidas.cancel",
    "salidas.receive",
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

/**
 * Indica si el usuario puede entrar a un módulo.
 *
 * Tres reglas, en este orden:
 *   1. La CONFIGURACIÓN siempre es accesible: es donde cada usuario gestiona
 *      su nombre de usuario y su contraseña.
 *   2. El superadmin entra siempre: no puede quedar bloqueado por sus
 *      propios permisos.
 *   3. Los demás entran solo a los módulos que el superadmin les autorizó
 *      (tabla `user_modules`).
 *
 * @param moduleKey Clave del módulo (ver `lib/config/modules`).
 */
export function canAccessModule(
  role: string,
  modules: string[],
  moduleKey: string
): boolean {
  if (moduleKey === "configuracion") return true;
  if (role === "SUPERADMIN") return true;
  return modules.includes(moduleKey);
}
