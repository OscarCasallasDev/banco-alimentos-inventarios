import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Optimización de producción: compresión Brotli/Gzip de respuestas.
  compress: true,

  // Cabecera `x-powered-by` desactivada (no revela stack interno).
  poweredByHeader: false,

  // React strict mode en desarrollo (detección temprana de efectos
  // duplicados / renders inconsistentes).
  reactStrictMode: true,
};

export default nextConfig;
