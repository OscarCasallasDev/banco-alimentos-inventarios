/**
 * Rutas de la aplicación y su endpoint de datos — Sistema de Gestión de
 * Inventarios. Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Permite precargar los datos de un módulo antes de que el usuario entre:
 * el menú lateral llama a `prefetchRoute()` al pasar el cursor por encima.
 */

export const ROUTE_ENDPOINTS: Record<string, string> = {
  "/dashboard": "/api/dashboard",
  "/entradas": "/api/entradas",
  "/pedidos": "/api/pedidos",
  "/facturas": "/api/facturas",
  "/recibos": "/api/recibos",
  "/salidas": "/api/despachos",
  "/auditoria": "/api/auditoria",
  "/inventario": "/api/inventario",
  "/productos": "/api/productos",
  "/bodegas": "/api/bodegas",
  "/reportes": "/api/reportes",
  "/usuarios": "/api/usuarios",
  "/integracion-siigo": "/api/configuracion",
  "/configuracion": "/api/configuracion",
};

/**
 * Tiempo que los datos se consideran frescos en el navegador.
 * Evita repetir la petición al volver a un módulo.
 */
export const STALE_TIME_MS = 60_000;
