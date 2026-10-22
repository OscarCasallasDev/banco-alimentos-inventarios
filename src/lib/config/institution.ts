/**
 * Datos institucionales del Banco — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Fuente única de los datos que aparecen en el encabezado de los
 * comprobantes impresos. Se centralizan aquí para no duplicarlos en
 * cada documento.
 */

export const INSTITUTION = {
  /** Nombre completo, en dos líneas como en la plantilla. */
  nameLines: [
    "BANCO ARQUIDIOCESANO DE ALIMENTOS",
    "DE IBAGUÉ",
  ],
  /** NIT del Banco. */
  nit: "809.009.880 - 0",
  /** Dirección. */
  address: "CR 4 ESTADIO 23 44",
  /** Teléfonos de contacto. */
  phones: "2624927 - 5151727",
} as const;
