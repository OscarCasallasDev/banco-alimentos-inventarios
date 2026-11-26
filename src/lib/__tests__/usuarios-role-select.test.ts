/** Pruebas del selector de roles del formulario de usuarios. */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Selector de rol", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "(protected)",
      "usuarios",
      "page.tsx"
    ),
    "utf8"
  );

  it("ofrece exactamente los cinco roles solicitados", () => {
    expect(source).toContain('{ value: "RECEPCION", label: "Recepcionista" }');
    expect(source).toContain('{ value: "DESPACHO", label: "Despacho" }');
    expect(source).toContain('{ value: "ALMACENISTA", label: "Almacenista" }');
    expect(source).toContain('{ value: "COORDINADOR", label: "Coordinador" }');
    expect(source).toContain('{ value: "SUPERADMIN", label: "Superadmin" }');
  });

  it("usa un select obligatorio y no un campo de texto libre", () => {
    expect(source).toContain("<select");
    expect(source).toContain("Seleccione un rol");
    expect(source).not.toContain('placeholder="almacenista"');
  });
});
