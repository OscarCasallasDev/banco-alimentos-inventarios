export type VideoTutorialStatus = "DISPONIBLE" | "PROXIMAMENTE";

export interface VideoTutorial {
  id: string;
  category: string;
  title: string;
  description: string;
  /** URL del video. Vacía mientras no exista una grabación. */
  url: string | null;
  status: VideoTutorialStatus;
}

/**
 * Catálogo centralizado de videotutoriales.
 *
 * Para publicar un video basta agregar su URL y cambiar el estado a
 * `DISPONIBLE`; el botón se habilita automáticamente.
 */
export const VIDEO_TUTORIALS: VideoTutorial[] = [
  {
    id: "acceso-ingreso",
    category: "Acceso y gestión de usuarios",
    title: "Cómo ingresar al sistema",
    description: "Acceso con el nombre de usuario y la contraseña asignados.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "usuario-registro",
    category: "Acceso y gestión de usuarios",
    title: "Cómo registrar un nuevo usuario",
    description: "Proceso para crear una cuenta nueva desde el sistema.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "usuarios-administrar",
    category: "Acceso y gestión de usuarios",
    title: "Cómo consultar y administrar usuarios",
    description: "Consulta de usuarios registrados y opciones del superadministrador.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "perfil-actualizar",
    category: "Acceso y gestión de usuarios",
    title: "Cómo actualizar mi información personal",
    description: "Modificación de la cédula y los datos permitidos del perfil.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "password-cambiar",
    category: "Acceso y gestión de usuarios",
    title: "Cómo cambiar mi contraseña",
    description: "Procedimiento para actualizar la contraseña de la cuenta.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "siigo-importar",
    category: "Inventario e importación",
    title: "Cómo importar el archivo Excel de Siigo Pyme",
    description: "Selección del archivo, confirmación y verificación de la importación.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "inventario-consultar",
    category: "Inventario e importación",
    title: "Cómo consultar el inventario",
    description: "Búsqueda de productos, existencias y disponibilidad.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "inventario-bodegas",
    category: "Inventario e importación",
    title: "Cómo identificar las existencias por bodega",
    description: "Consulta de un producto en diferentes bodegas y sus cantidades.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "bodegas-consultar",
    category: "Inventario e importación",
    title: "Cómo consultar las bodegas disponibles",
    description: "Revisión del catálogo de bodegas importadas desde Siigo Pyme.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "orden-crear",
    category: "Órdenes de pedido y salidas",
    title: "Cómo crear una orden de pedido",
    description: "Proceso completo, desde la información general hasta la generación.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "orden-productos",
    category: "Órdenes de pedido y salidas",
    title: "Cómo agregar productos a una orden de pedido",
    description: "Búsqueda, bodega de salida y registro de cantidades.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "orden-recepcion",
    category: "Órdenes de pedido y salidas",
    title: "Cómo registrar la información de quien recibe en despacho",
    description: "Registro del nombre y la cédula de la persona que recibe.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "ordenes-consultar",
    category: "Órdenes de pedido y salidas",
    title: "Cómo consultar las órdenes de pedido",
    description: "Búsqueda y revisión de las órdenes generadas.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "orden-imprimir",
    category: "Órdenes de pedido y salidas",
    title: "Cómo imprimir una orden de pedido",
    description: "Apertura del comprobante y realización de la impresión.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "notificaciones-consultar",
    category: "Seguimiento y administración",
    title: "Cómo consultar las notificaciones",
    description: "Apertura de la campanita y consulta de los movimientos registrados.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "notificaciones-leer",
    category: "Seguimiento y administración",
    title: "Cómo marcar las notificaciones como leídas",
    description: "Marcación de una notificación individual o de todas las pendientes.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "auditoria-ordenes",
    category: "Seguimiento y administración",
    title: "Cómo consultar la auditoría de órdenes de pedido",
    description: "Revisión de los movimientos realizados por los usuarios autorizados.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "vencimientos-alertas",
    category: "Seguimiento y administración",
    title: "Cómo consultar las alertas de vencimiento",
    description: "Revisión de los productos próximos a vencer y sus alertas.",
    url: null,
    status: "PROXIMAMENTE",
  },
  {
    id: "modulos-administrar",
    category: "Seguimiento y administración",
    title: "Cómo activar o desactivar módulos del sistema",
    description: "Administración de la disponibilidad de módulos desde Configuración.",
    url: null,
    status: "PROXIMAMENTE",
  },
];
