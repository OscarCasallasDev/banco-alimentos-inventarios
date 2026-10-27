/**
 * Cliente HTTP para el navegador — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Una sola forma de hablar con la API: devuelve `data` directamente y
 * lanza un error con el mensaje del servidor.
 */

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: Record<string, string[]>;
    } = {}
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code ?? "INTERNAL_ERROR";
    this.status = options.status ?? 0;
    this.details = options.details;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

function fallbackMessage(status: number): string {
  if (status === 401) {
    return "Tu sesión expiró. Inicia sesión nuevamente.";
  }
  if (status === 403) {
    return "No tienes permisos para realizar esta operación.";
  }
  if (status === 404) {
    return "El recurso solicitado no existe.";
  }
  if (status >= 500) {
    return "El servidor no pudo completar la solicitud. Intenta de nuevo.";
  }
  return "No se pudo completar la solicitud.";
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;

  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

async function request(
  endpoint: string,
  init: RequestInit,
  externalSignal?: AbortSignal
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(endpoint, {
      ...init,
      credentials: "same-origin",
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    return { response, payload };
  } catch (error) {
    if (externalSignal?.aborted) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError(
        "La solicitud tardó demasiado. Verifica la conexión e intenta de nuevo.",
        { code: "TIMEOUT" }
      );
    }

    throw new ApiClientError(
      "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
      { code: "NETWORK_ERROR" }
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function toApiError(
  response: Response,
  payload: unknown,
  fallback: string
): ApiClientError {
  const body = payload as ApiErrorBody | null;

  if (response.status === 401) {
    redirectToLogin();
  }

  return new ApiClientError(
    body?.error?.message ?? fallbackMessage(response.status) ?? fallback,
    {
      code: body?.error?.code ?? "HTTP_ERROR",
      status: response.status,
      details: body?.error?.details,
    }
  );
}

export async function apiGet<T>(
  endpoint: string,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const { response, payload } = await request(
    endpoint,
    { method: "GET" },
    options?.signal
  );

  if (!response.ok || !(payload as { success?: boolean } | null)?.success) {
    throw toApiError(
      response,
      payload,
      "No se pudo cargar la información"
    );
  }

  return (payload as { data: T }).data;
}

export async function apiSend<T>(
  endpoint: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const { response, payload } = await request(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok || !(payload as { success?: boolean } | null)?.success) {
    throw toApiError(
      response,
      payload,
      "No se pudo completar la operación"
    );
  }

  return (payload as { data: T }).data;
}
