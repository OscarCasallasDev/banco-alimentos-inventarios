import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/lib/__tests__/setup.ts"],
    // Las pruebas de integración hablan con Supabase (Colombia → us-west-2):
    // cada consulta cuesta cientos de milisegundos, así que el margen es
    // holgado para que un análisis de red no se confunda con un fallo.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
