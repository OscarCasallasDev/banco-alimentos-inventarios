/**
 * Política de contraseñas — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Reglas del Banco: mínimo 8 caracteres, al menos una letra, al menos un
 * número y al menos un símbolo especial.
 *
 * Este módulo NO importa nada de Node: se usa igual en el servidor (para
 * validar) y en el navegador (para avisar antes de enviar el formulario).
 */

export interface PasswordRule {
  /** Comprueba si la contraseña cumple la regla. */
  test: (value: string) => boolean;
  /** Mensaje que se muestra cuando la regla NO se cumple. */
  message: string;
}

/** Reglas de seguridad de la contraseña del Banco. */
export const PASSWORD_RULES: PasswordRule[] = [
  { test: (v) => v.length >= 8, message: "Al menos 8 caracteres" },
  { test: (v) => /[A-Za-z]/.test(v), message: "Al menos una letra" },
  { test: (v) => /\d/.test(v), message: "Al menos un número" },
  { test: (v) => /[^A-Za-z0-9]/.test(v), message: "Al menos un símbolo especial" },
];

/**
 * Motivos por los que una contraseña no cumple la política.
 * Una contraseña vacía no se valida (el formulario lo pide aparte).
 */
export function passwordRuleFailures(password: string): string[] {
  if (!password) return [];
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map(
    (rule) => rule.message
  );
}

/** Resultado de validar una contraseña con su confirmación. */
export interface PasswordConfirmationResult {
  valid: boolean;
  /** Motivo del rechazo, listo para mostrar al usuario. */
  message?: string;
}

/**
 * Valida la contraseña junto con su confirmación.
 *
 * Se usa en el registro, en el cambio de contraseña de la configuración y en
 * la importación manual, para que las tres pantallas apliquen exactamente las
 * mismas reglas.
 */
export function checkPasswordConfirmation(
  password: string,
  confirmation: string
): PasswordConfirmationResult {
  if (password !== confirmation) {
    return { valid: false, message: "Las contraseñas no coinciden." };
  }

  const failures = passwordRuleFailures(password);
  if (failures.length > 0) {
    return {
      valid: false,
      message: `La contraseña debe cumplir: ${failures.join(", ")}.`,
    };
  }

  return { valid: true };
}
