/**
 * Constantes de sesión — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Módulo sin dependencias de Node para poder importarse también desde el
 * middleware (runtime Edge).
 */

export const SESSION_COOKIE_NAME = "session_token";

/** Duración de la sesión: 8 horas. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
