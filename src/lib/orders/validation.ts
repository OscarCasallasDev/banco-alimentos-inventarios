/**
 * Validaciones de la orden de pedido.
 *
 * Están fuera del componente para poder probarlas de forma aislada.
 *
 * REGLA DE EXPERIENCIA
 *
 *   Los campos se validan al SALIR del campo o al GUARDAR, no mientras el
 *   usuario escribe. Así se puede borrar el contenido y escribir otro valor
 *   sin que el formulario fuerce un cero ni muestre errores prematuros.
 */

/** Mensajes exactos que pide el Banco. */
export const MESSAGES = {
  quantity: "Debes ingresar una cantidad mayor que 0",
  weight: "Debes ingresar un peso mayor que 0",
  expiration: "Debes seleccionar la fecha de vencimiento del producto",
  noStock:
    "Este producto no tiene unidades disponibles para agregar a la orden de pedido",
  exceedsStock: "La cantidad solicitada supera las unidades disponibles",
} as const;

/** Convierte un texto a número aceptando coma o punto decimal. */
export function parseNumericInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Valida la cantidad de una línea.
 * @returns mensaje de error, o `null` si es válida.
 */
export function validateQuantity(
  raw: string,
  available: number
): string | null {
  const value = parseNumericInput(raw);
  if (value === null || value <= 0) return MESSAGES.quantity;
  if (value > available + 0.0005) return MESSAGES.exceedsStock;
  return null;
}

/**
 * Valida el peso de una línea. Respeta la unidad seleccionada porque el
 * valor se registra en la unidad que el usuario elige.
 * @returns mensaje de error, o `null` si es válida.
 */
export function validateWeight(raw: string): string | null {
  const value = parseNumericInput(raw);
  if (value === null || value <= 0) return MESSAGES.weight;
  return null;
}

/**
 * Valida la fecha de vencimiento (obligatoria y con formato correcto).
 * @returns mensaje de error, o `null` si es válida.
 */
export function validateExpiration(raw: string): string | null {
  if (!raw) return MESSAGES.expiration;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return MESSAGES.expiration;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return MESSAGES.expiration;
  }

  const date = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return MESSAGES.expiration;
  if (year < 2000 || year > 2100) return MESSAGES.expiration;

  // Comprueba que la fecha exista realmente (ej. 2027-02-30 no existe).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return MESSAGES.expiration;
  }

  return null;
}

export interface LineValidation {
  quantity: string | null;
  weight: string | null;
  expiration: string | null;
  valid: boolean;
}

/** Valida una línea completa. */
export function validateLine(input: {
  quantity: string;
  weight: string;
  expirationDate: string;
  available: number;
}): LineValidation {
  const quantity = validateQuantity(input.quantity, input.available);
  const weight = validateWeight(input.weight);
  const expiration = validateExpiration(input.expirationDate);
  return {
    quantity,
    weight,
    expiration,
    valid: quantity === null && weight === null && expiration === null,
  };
}
