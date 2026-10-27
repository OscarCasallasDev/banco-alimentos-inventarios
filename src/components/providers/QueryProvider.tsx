"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { STALE_TIME_MS } from "@/lib/routes";

/**
 * Proveedor de datos del cliente.
 *
 * React Query mantiene los datos en memoria: al volver a un módulo los
 * datos ya están disponibles (sin spinner). Los catálogos se conservan
 * varios minutos; el inventario y los indicadores tienen tiempos cortos
 * para no mostrar existencias desactualizadas.
 */
export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME_MS,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
