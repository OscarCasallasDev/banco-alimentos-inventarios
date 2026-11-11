/**
 * Pruebas unitarias del formato de impresión de la ORDEN DE PEDIDO.
 *
 * El Banco reportó que el título, el número, la hora y el estado se cortaban
 * por el borde derecho de la página. Estas pruebas verifican la geometría del
 * CSS:
 *
 *   ancho del documento + márgenes de @page  ≤  ancho de la hoja carta
 *
 * También verifican que las firmas tengan los campos que se pidieron.
 *
 * No requieren navegador: se lee el CSS Module y se hacen los cálculos.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS_PATH = path.join(
  process.cwd(),
  "src",
  "components",
  "documents",
  "orden-pedido.module.css"
);

/** Ancho de una hoja carta en centímetros. */
const CARTA_ANCHO_CM = 21.59;

function cmToPx(cm: number): number {
  return (cm / 2.54) * 96;
}

describe("Geometría de impresión de la orden de pedido", () => {
  let css: string;

  beforeAll(() => {
    css = readFileSync(CSS_PATH, "utf8");
  });

  it("declara tamaño carta", () => {
    expect(css).toContain("size: 21.59cm 27.94cm");
  });

  it("el ancho del documento cabe dentro del área imprimible", () => {
    const margen = /@page\s*\{[^}]*margin:\s*([\d.]+)cm\s+([\d.]+)cm/.exec(css);
    expect(margen).not.toBeNull();
    const margenHorizontal = Number(margen![2]) * 2;

    const ancho = /\.documento\s*\{[^}]*width:\s*([\d.]+)cm/.exec(css);
    expect(ancho).not.toBeNull();
    const anchoDocumento = Number(ancho![1]);

    const disponible = CARTA_ANCHO_CM - margenHorizontal;
    expect(anchoDocumento).toBeLessThanOrEqual(disponible);
    // Al menos 3 mm de holgura para que ningún borde quede cortado.
    expect(disponible - anchoDocumento).toBeGreaterThanOrEqual(0.3);
  });

  it("el documento usa box-sizing border-box (el padding no lo desborda)", () => {
    expect(css).toMatch(/\.documento\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("el encabezado reparte el ancho sin desbordarse", () => {
    const columnas = /\.encabezado\s*\{[^}]*grid-template-columns:\s*([\d.]+)%\s+([\d.]+)%/
      .exec(css);
    expect(columnas).not.toBeNull();
    const suma = Number(columnas![1]) + Number(columnas![2]);
    expect(suma).toBeLessThanOrEqual(100);
  });

  it("el bloque derecho del encabezado puede partir el texto en vez de salirse", () => {
    const bloque = /\.encabezadoDocumento\s*\{([^}]*)\}/.exec(css);
    expect(bloque).not.toBeNull();
    expect(bloque![1]).toMatch(/min-width:\s*0/);
    expect(bloque![1]).toMatch(/overflow-wrap:\s*break-word/);
  });

  it("el número de orden no se parte en dos líneas", () => {
    const numero = /\.numeroDocumento\s*\{([^}]*)\}/.exec(css);
    expect(numero).not.toBeNull();
    expect(numero![1]).toMatch(/white-space:\s*nowrap/);
  });

  it("la tabla repite el encabezado en cada página", () => {
    expect(css).toContain("display: table-header-group");
  });

  it("las filas y el bloque de firmas no se cortan entre páginas", () => {
    const coincidencias = css.match(/break-inside:\s*avoid/g) ?? [];
    expect(coincidencias.length).toBeGreaterThanOrEqual(2);
  });

  it("el padding horizontal del documento no lo empuja fuera del margen", () => {
    const documento = /\.documento\s*\{([^}]*)\}/.exec(css);
    expect(documento).not.toBeNull();
    const padding = /padding:\s*([\d.]+)cm\s+([\d.]+)cm/.exec(documento![1]);
    if (padding) {
      // Con box-sizing border-box el padding se descuenta del contenido.
      expect(Number(padding[2])).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("Campos del bloque de firmas", () => {
  it("la hoja de estilos define el campo de firma y su etiqueta", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toMatch(/\.campoFirma\s*\{/);
    expect(css).toMatch(/\.campoEtiqueta\s*\{/);
    expect(css).toMatch(/\.lineaFirma\s*\{/);
  });

  it("la firma tiene altura suficiente para firmar a mano", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const linea = /\.lineaFirma\s*\{([^}]*)\}/.exec(css);
    expect(linea).not.toBeNull();
    const altura = /height:\s*([\d.]+)cm/.exec(linea![1]);
    expect(altura).not.toBeNull();
    // Al menos 1 cm de espacio físico para la firma.
    expect(Number(altura![1])).toBeGreaterThanOrEqual(1);
  });

  it("el documento incluye las dos firmas (entrega y recibe)", () => {
    const tsx = readFileSync(
      path.join(
        process.cwd(),
        "src",
        "components",
        "documents",
        "OrdenPedidoDocumento.tsx"
      ),
      "utf8"
    );
    expect(tsx).toContain("ENTREGA — ALMACENISTA");
    expect(tsx).toContain("RECIBE — ENCARGADO(A) DE DESPACHO");
    expect(tsx).toContain("Cédula:");
    expect(tsx).toContain("Hora:");
  });

  it("la firma de despacho queda en blanco si aún no se ha recibido", () => {
    const tsx = readFileSync(
      path.join(
        process.cwd(),
        "src",
        "components",
        "documents",
        "OrdenPedidoDocumento.tsx"
      ),
      "utf8"
    );
    // Los datos de recepción se imprimen solo si existen.
    expect(tsx).toContain("orden.receiverName ?? \"\"");
    expect(tsx).toContain("orden.receiverDocument ?? \"\"");
    expect(tsx).toContain("orden.receivedTime ?? \"____ : ____\"");
  });
});

describe("Conversión de unidades de impresión", () => {
  it("el área imprimible en píxeles es coherente", () => {
    const disponibleCm = CARTA_ANCHO_CM - 2;
    expect(cmToPx(disponibleCm)).toBeGreaterThan(700);
  });
});
