/**
 * Lectura de variables de entorno — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * En desarrollo local las variables viven en `.env.local`. En producción
 * (Vercel) viven en *Settings → Environment Variables* del proyecto.
 *
 * El error que se lanzaba antes —«DATABASE_URL no está definida»— era
 * correcto, pero la API lo devolvía como un 500 genérico ("Error interno del
 * servidor"), lo que ocultaba la causa real y hacía imposible diagnosticar el
 * despliegue. `MissingEnvError` permite que la API responda 503 con un
 * mensaje que dice exactamente qué variable falta y dónde configurarla.
 */

export class MissingEnvError extends Error {
  /** Nombre de la variable que falta. */
  public readonly variable: string;

  constructor(variable: string, hint?: string) {
    super(
      `La variable de entorno ${variable} no está definida. ${
        hint ?? "Configúrala en el panel de Vercel (Settings → Environment Variables) o en .env.local para desarrollo local."
      }`
    );
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

/**
 * Devuelve el valor de una variable de entorno obligatoria.
 * Lanza `MissingEnvError` si no existe o está vacía.
 */
export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new MissingEnvError(name, hint);
  }

  return value;
}

/**
 * Comprueba si un error corresponde a una variable de entorno ausente.
 */
export function isMissingEnvError(error: unknown): error is MissingEnvError {
  return error instanceof MissingEnvError;
}
