"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { ROUTE_ENDPOINTS, STALE_TIME_MS } from "@/lib/routes";

/**
 * Los datos de stock cambian con cada movimiento: no conviene reutilizarlos
 * durante un minuto completo. Los catálogos, en cambio, son estables.
 */
const STALE_TIME_BY_ENDPOINT: Record<string, number> = {
  "/api/inventario": 10_000,
  "/api/dashboard": 30_000,
  "/api/reportes": 30_000,
  "/api/configuracion": 30_000,
  "/api/productos": 5 * STALE_TIME_MS,
  "/api/bodegas": 5 * STALE_TIME_MS,
  "/api/categorias": 5 * STALE_TIME_MS,
  "/api/unidades": 10 * STALE_TIME_MS,
  "/api/centros-costo": 10 * STALE_TIME_MS,
};

function getStaleTime(endpoint: string): number {
  return STALE_TIME_BY_ENDPOINT[endpoint] ?? STALE_TIME_MS;
}

/**
 * Consulta de datos de la API con caché en el navegador.
 *
 * La señal de React Query cancela la petición cuando el componente deja de
 * estar montado o la consulta queda obsoleta.
 */
export function useApiQuery<T>(
  endpoint: string,
  options?: { enabled?: boolean }
): UseQueryResult<T, Error> {
  return useQuery<T, Error>({
    queryKey: [endpoint],
    queryFn: ({ signal }) => apiGet<T>(endpoint, { signal }),
    enabled: options?.enabled ?? true,
    staleTime: getStaleTime(endpoint),
  });
}

/**
 * Precarga los datos de un módulo al pasar el cursor por el menú lateral.
 *
 * Se aplica un pequeño retardo para no disparar una petición por cada icono
 * que el usuario recorre con el ratón. Si el usuario hace clic antes del
 * retardo, la consulta real y la precarga comparten la misma clave y React
 * Query deduplica la petición.
 */
export function usePrefetchRoute() {
  const queryClient = useQueryClient();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;

    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return useCallback(
    (route: string) => {
      const endpoint = ROUTE_ENDPOINTS[route];
      if (!endpoint) return;

      // No se precarga la ruta en la que ya está el usuario.
      if (typeof window !== "undefined" && window.location.pathname === route) {
        return;
      }

      const previous = timers.current.get(route);
      if (previous) clearTimeout(previous);

      const timer = setTimeout(() => {
        timers.current.delete(route);

        void queryClient.prefetchQuery({
          queryKey: [endpoint],
          queryFn: ({ signal }) => apiGet<unknown>(endpoint, { signal }),
          staleTime: getStaleTime(endpoint),
        });
      }, 200);

      timers.current.set(route, timer);
    },
    [queryClient]
  );
}
