/**
 * Proxy de autenticación — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Next.js 16 sustituyó la convención `middleware` por `proxy`.
 *
 * Protege todas las rutas salvo las públicas.
 * - Las rutas de página sin sesión se redirigen a /login.
 * - Las rutas de API sin sesión responden 401 en JSON.
 *
 * La validación criptográfica del token ocurre en el servidor
 * (`src/lib/auth/session.ts`); aquí solo se comprueba la presencia de la
 * cookie, porque el proxy corre en runtime Edge.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "No autenticado. Inicia sesión para continuar.",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protege páginas y APIs, pero nunca intercepta:
     * - _next/static y _next/image (recursos internos de Next.js)
     * - favicon.ico
     * - archivos estáticos de /public (logos, imágenes, fuentes, etc.)
     *
     * Sin esta exclusión, /logo1.jpeg y /logo2.jpeg se redirigían a /login
     * y el optimizador de imágenes recibía HTML en lugar de la imagen.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)",
  ],
};
