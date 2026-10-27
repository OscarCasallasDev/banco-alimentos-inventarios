"use client";

import { useEffect } from "react";

/**
 * Boundary de último recurso. Next.js solo lo usa cuando falla el layout
 * raíz; por eso debe incluir <html> y <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error crítico de la aplicación:", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f9fafb" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: "20px", color: "#111827", margin: 0 }}>
              La aplicación no pudo iniciar
            </h1>
            <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.6 }}>
              Ocurrió un error crítico. Recarga la página para intentarlo de
              nuevo. Si el problema continúa, revisa la conexión con la base de
              datos.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "16px",
                background: "#48151C",
                color: "#fff",
                border: 0,
                borderRadius: "8px",
                padding: "10px 16px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
