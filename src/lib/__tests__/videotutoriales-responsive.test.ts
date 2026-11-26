/** Pruebas específicas de videotutoriales y contención responsive. */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { VIDEO_TUTORIALS } from "@/lib/config/video-tutorials";

const root = process.cwd();

describe("Catálogo de videotutoriales", () => {
  it("registra los 19 tutoriales solicitados con identificadores únicos", () => {
    expect(VIDEO_TUTORIALS).toHaveLength(19);
    expect(new Set(VIDEO_TUTORIALS.map((item) => item.id)).size).toBe(19);
  });

  it("activa los cinco videos existentes y deja el resto pendiente", () => {
    const disponibles = VIDEO_TUTORIALS.filter(
      (item) => item.status === "DISPONIBLE"
    );

    expect(disponibles).toHaveLength(5);
    expect(disponibles.map((item) => item.url)).toEqual([
      "/Videotutoriales/IngresarSistemaVideotutorial.mp4",
      "/Videotutoriales/RegistrarNuevoUsuario.mp4",
      "/Videotutoriales/ConsultaryAdministrarUsuario.mp4",
      "/Videotutoriales/ActualizarInformaciónPersonal.mp4",
      "/Videotutoriales/CambiarContraseña.mp4",
    ]);

    expect(
      VIDEO_TUTORIALS.filter((item) => item.status === "PROXIMAMENTE").every(
        (item) => item.url === null
      )
    ).toBe(true);
    expect(VIDEO_TUTORIALS.every((item) => item.title && item.description)).toBe(
      true
    );

    // Las rutas configuradas deben existir con el nombre y las mayúsculas
    // exactas del archivo real en public/Videotutoriales.
    for (const url of disponibles.map((item) => item.url!)) {
      const file = path.join(root, "public", url.replace(/^\//, ""));
      expect(existsSync(file)).toBe(true);
    }
  });

  it("abre un reproductor modal con controles y sin cambiar velocidad", () => {
    const component = readFileSync(
      path.join(root, "src", "components", "config", "VideotutorialesPanel.tsx"),
      "utf8"
    );
    expect(component).toContain("disabled={!disponible}");
    expect(component).toContain("Próximamente");
    expect(component).toContain("Ver video");
    expect(component).toContain("<video");
    expect(component).toContain("controls");
    expect(component).toContain("autoPlay");
    expect(component).toContain("playbackRate");
  });

  it("la sección está entre vencimientos y auditoría", () => {
    const config = readFileSync(
      path.join(root, "src", "app", "(protected)", "configuracion", "page.tsx"),
      "utf8"
    );
    const vencimientos = config.indexOf("Control de vencimientos");
    const videos = config.indexOf("<VideotutorialesPanel />");
    const auditoria = config.indexOf("<AuditoriaOrdenesPanel />");
    const modulos = config.indexOf("<ModulosPanel />");

    expect(vencimientos).toBeGreaterThan(-1);
    expect(videos).toBeGreaterThan(vencimientos);
    expect(auditoria).toBeGreaterThan(videos);
    expect(modulos).toBeGreaterThan(auditoria);
  });
});

describe("Contención responsive", () => {
  it("el panel de notificaciones respeta los bordes en móvil", () => {
    const bell = readFileSync(
      path.join(root, "src", "components", "layout", "NotificationBell.tsx"),
      "utf8"
    );
    expect(bell).toContain("fixed left-4 right-4");
    expect(bell).toContain("sm:absolute");
    expect(bell).toContain("overflow-x-hidden");
    expect(bell).toContain("break-words");
  });

  it("el dashboard no trunca sin permitir consultar el nombre completo", () => {
    const dashboard = readFileSync(
      path.join(root, "src", "app", "(protected)", "dashboard", "page.tsx"),
      "utf8"
    );
    expect(dashboard).toContain('title={lastRun.fileName ?? "Sin archivo"}');
    expect(dashboard).toContain("min-w-0 flex-1");
  });

  it("los estilos globales evitan que los contenedores crezcan de más", () => {
    const css = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("overflow-wrap: break-word");
  });
});
