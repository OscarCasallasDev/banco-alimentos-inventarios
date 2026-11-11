/**
 * Registro único de módulos del sistema.
 *
 * Cada módulo declara:
 *  - `flag`    → clave en `feature_flags` que controla su activación (reversible).
 *  - `roles`   → roles autorizados a verlo y a usar su API.
 *  - `apiScope`→ prefijo de las rutas API protegidas por el módulo (o null).
 *
 * La navegación (Sidebar) y el backend (guard.ts) leen de aquí, de modo que
 * ocultar un módulo nunca es "solo visual": el servidor valida la bandera y
 * el rol antes de ejecutar cualquier operación.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  FileText,
  Receipt,
  ShieldCheck,
  BarChart3,
  Users,
  Link2,
  Settings,
  Layers,
  ArrowLeftRight,
  Truck,
  Target,
  CalendarClock,
} from "lucide-react";

export type ModuleKey =
  | "dashboard"
  | "inventario"
  | "bodegas"
  | "salidas_almacen"
  | "programas"
  | "integracion_siigo"
  | "usuarios"
  | "configuracion"
  | "vencimientos"
  | "productos"
  | "lotes"
  | "movimientos"
  | "entradas"
  | "salidas_legacy"
  | "pedidos"
  | "facturas"
  | "recibos"
  | "auditoria"
  | "reportes";

export type UserRole =
  | "SUPERADMIN"
  | "ADMIN"
  | "ALMACENISTA"
  | "RECEPCION"
  | "DESPACHO"
  | "CONTABILIDAD";

export interface ModuleDefinition {
  /** Clave visible en la navegación. */
  label: string;
  /** Ruta de la página (o del grupo de páginas). */
  href: string;
  icon: LucideIcon;
  /** Clave en la tabla `feature_flags`. */
  flag: string;
  /** Roles que ven el módulo en la navegación. */
  roles: UserRole[];
  /** Prefijo de las rutas API protegidas. null = sin API propia. */
  apiScope: string | null;
  /** Estado editorial (no funcional: la bandera manda). */
  status: "ACTIVO" | "EN_ESPERA";
  /** Descripción para la pantalla de configuración. */
  description: string;
}

const ADMIN_ROLES: UserRole[] = ["SUPERADMIN", "ADMIN"];
const ALMACEN_ROLES: UserRole[] = ["SUPERADMIN", "ADMIN", "ALMACENISTA", "RECEPCION"];
const DESPACHO_ROLES: UserRole[] = ["SUPERADMIN", "ADMIN", "DESPACHO"];
const TODO: UserRole[] = [
  "SUPERADMIN",
  "ADMIN",
  "ALMACENISTA",
  "RECEPCION",
  "DESPACHO",
  "CONTABILIDAD",
];

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  dashboard: {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    flag: "dashboard.enabled",
    roles: TODO,
    apiScope: "/api/dashboard",
    status: "ACTIVO",
    description: "Tablero operativo reorientado a la nueva prioridad.",
  },
  inventario: {
    label: "Inventario",
    href: "/inventario",
    icon: Boxes,
    flag: "inventory.enabled",
    roles: TODO,
    apiScope: "/api/existencias",
    status: "ACTIVO",
    description: "Existencias importadas desde Siigo Pyme, por producto y bodega.",
  },
  bodegas: {
    label: "Bodegas",
    href: "/bodegas",
    icon: Warehouse,
    flag: "warehouses.enabled",
    roles: TODO,
    apiScope: "/api/bodegas",
    status: "ACTIVO",
    description: "Bodegas, ubicaciones y su correspondencia con Siigo Pyme.",
  },
  salidas_almacen: {
    label: "Salidas de almacén",
    href: "/salidas-almacen",
    icon: ArrowUpFromLine,
    flag: "salidas_almacen.enabled",
    roles: [...ALMACEN_ROLES, ...DESPACHO_ROLES],
    apiScope: "/api/salidas",
    status: "ACTIVO",
    description: "Preparación de salidas, documento de entrega y recepción por despacho.",
  },
  programas: {
    label: "Programas",
    href: "/programas",
    icon: Target,
    flag: "programs.enabled",
    roles: TODO,
    apiScope: "/api/programas",
    status: "ACTIVO",
    description: "Catálogo configurable de programas y destinos.",
  },
  integracion_siigo: {
    label: "Integración Siigo",
    href: "/integracion-siigo",
    icon: Link2,
    flag: "siigo_import.enabled",
    roles: [...ADMIN_ROLES, ...DESPACHO_ROLES],
    apiScope: "/api/siigo",
    status: "ACTIVO",
    description: "Importación de reportes de Siigo Pyme, historial y conciliación.",
  },
  usuarios: {
    label: "Usuarios",
    href: "/usuarios",
    icon: Users,
    flag: "users.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/usuarios",
    status: "ACTIVO",
    description: "Gestión de usuarios y roles del sistema.",
  },
  vencimientos: {
    label: "Vencimientos",
    href: "/vencimientos",
    icon: CalendarClock,
    flag: "vencimientos.enabled",
    roles: TODO,
    apiScope: "/api/vencimientos",
    status: "ACTIVO",
    description: "Productos próximos a vencer y alertas de inventario.",
  },
  configuracion: {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    flag: "settings.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/configuracion",
    status: "ACTIVO",
    description: "Ajustes del sistema, banderas de módulos y mapeo de bodegas.",
  },
  // ---------- Módulos conservados y en espera ----------
  productos: {
    label: "Productos",
    href: "/productos",
    icon: Package,
    flag: "products.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/productos",
    status: "EN_ESPERA",
    description: "Catálogo local de productos (el maestro actual es Siigo).",
  },
  lotes: {
    label: "Lotes",
    href: "/lotes",
    icon: Layers,
    flag: "lots.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/lotes",
    status: "EN_ESPERA",
    description: "Trazabilidad por lotes y vencimientos.",
  },
  movimientos: {
    label: "Movimientos",
    href: "/movimientos",
    icon: ArrowLeftRight,
    flag: "movements.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/movimientos",
    status: "EN_ESPERA",
    description: "Libro de movimientos operativo del inventario por lotes.",
  },
  entradas: {
    label: "Entradas",
    href: "/entradas",
    icon: ArrowDownToLine,
    flag: "entries.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/entradas",
    status: "EN_ESPERA",
    description: "Entrada de mercadería por documento de Siigo.",
  },
  salidas_legacy: {
    label: "Despachos",
    href: "/salidas",
    icon: Truck,
    flag: "salidas_legacy.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/despachos",
    status: "EN_ESPERA",
    description: "Flujo contable Recibo → Despacho con asignación de lotes.",
  },
  pedidos: {
    label: "Pedidos",
    href: "/pedidos",
    icon: ClipboardList,
    flag: "orders.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/pedidos",
    status: "EN_ESPERA",
    description: "Órdenes de pedido.",
  },
  facturas: {
    label: "Facturas",
    href: "/facturas",
    icon: FileText,
    flag: "invoices.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/facturas",
    status: "EN_ESPERA",
    description: "Facturas de venta (SF1/F2).",
  },
  recibos: {
    label: "Recibos",
    href: "/recibos",
    icon: Receipt,
    flag: "receipts.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/recibos",
    status: "EN_ESPERA",
    description: "Recibos de caja (R1–R4).",
  },
  auditoria: {
    label: "Auditoría",
    href: "/auditoria",
    icon: ShieldCheck,
    flag: "audits.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/auditoria",
    status: "EN_ESPERA",
    description: "Conciliación física contra el inventario del sistema.",
  },
  reportes: {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    flag: "reports.enabled",
    roles: ADMIN_ROLES,
    apiScope: "/api/reportes",
    status: "EN_ESPERA",
    description: "Reportes consolidados de inventario.",
  },
};

/** Orden de presentación en la navegación. */
export const MODULE_ORDER: ModuleKey[] = [
  "dashboard",
  "inventario",
  "bodegas",
  "salidas_almacen",
  "programas",
  "integracion_siigo",
  "usuarios",
  "vencimientos",
  "configuracion",
  "productos",
  "lotes",
  "movimientos",
  "entradas",
  "salidas_legacy",
  "pedidos",
  "facturas",
  "recibos",
  "auditoria",
  "reportes",
];

/** Módulos visibles para un rol, sin considerar las banderas. */
export function modulesForRole(role: string): ModuleKey[] {
  return MODULE_ORDER.filter((key) => MODULES[key].roles.includes(role as UserRole));
}

/** Busca el módulo al que pertenece una ruta de API. */
export function moduleForApiScope(pathname: string): ModuleKey | null {
  const normalized = pathname.split("?")[0];
  const found = MODULE_ORDER.find((key) => {
    const scope = MODULES[key].apiScope;
    return scope !== null && normalized.startsWith(scope);
  });
  return found ?? null;
}
