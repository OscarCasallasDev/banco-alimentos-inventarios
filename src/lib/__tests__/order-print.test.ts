/**
 * Pruebas unitarias del formato de impresión de la ORDEN DE PEDIDO.
 *
 * Verifican, calculando la geometría a partir del CSS real:
 *
 *   - el documento cabe en una hoja tamaño carta;
 *   - el encabezado superior derecho no se corta (el `gap` de la rejilla se
 *     descuenta del espacio disponible);
 *   - la columna CÓDIGO muestra los códigos de Siigo en una sola línea;
 *   - la columna BODEGA DE SALIDA existe y tiene ancho suficiente;
 *   - el encabezado de la tabla se repite en cada página;
 *   - los bloques de firmas tienen los campos que pide el Banco.
 *
 * No requieren navegador: miden el CSS como lo mediría el motor de
 * impresión.
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
const TSX_PATH = path.join(
  process.cwd(),
  "src",
  "components",
  "documents",
  "OrdenPedidoDocumento.tsx"
);

/** Ancho de una hoja carta en centímetros. */
const CARTA_ANCHO_CM = 21.59;

/** Convierte centímetros a píxeles (96 dpi). */
function cmToPx(cm: number): number {
  return (cm / 2.54) * 96;
}

/** Lee una propiedad de un bloque CSS y la devuelve en centímetros. */
function valor(bloque: string, propiedad: string): number | null {
  const match = new RegExp(
    `(?:^|[;{\\s])${propiedad}\\s*:\\s*([\\d.]+)(cm|%|pt|px)?(?![\\w-])`
  ).exec(bloque);
  if (!match) return null;
  const numero = Number(match[1]);
  const unidad = match[2] ?? "";
  if (unidad === "%") return numero;
  if (unidad === "pt") return (numero * 2.54) / 72;
  if (unidad === "px") return (numero * 2.54) / 96;
  return numero;
}

/** Devuelve el cuerpo de la primera regla de un selector. */
function regla(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g").exec(css);
  return match ? match[1] : "";
}

describe("Geometría de impresión de la orden de pedido", () => {
  let css: string;

  beforeAll(() => {
    css = readFileSync(CSS_PATH, "utf8");
  });

  it("declara tamaño carta con 1 cm de margen", () => {
    expect(css).toContain("size: 21.59cm 27.94cm");
    const pagina = regla(css, "@page");
    // El margen se declara en forma abreviada: `1cm 1cm`.
    const margenes = /margin:\s*([\d.]+)cm(?:\s+([\d.]+)cm)?/.exec(pagina);
    expect(margenes).not.toBeNull();
    const vertical = Number(margenes![1]);
    const horizontal = margenes![2] ? Number(margenes![2]) : vertical;
    expect(vertical).toBe(1);
    expect(horizontal).toBe(1);
  });

  it("el documento cabe en el área imprimible", () => {
    const documento = regla(css, ".documento");
    const ancho = valor(documento, "width") ?? 0;
    const disponible = CARTA_ANCHO_CM - 2;
    expect(ancho).toBeLessThanOrEqual(disponible);
    // Al menos 3 mm de holgura para que ningún borde quede cortado.
    expect(disponible - ancho).toBeGreaterThanOrEqual(0.3);
  });

  it("el documento usa box-sizing border-box (el padding no lo desborda)", () => {
    expect(css).toMatch(/\.documento\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("el encabezado reparte el ancho descontando el gap de la rejilla", () => {
    // Con `56% 44%` más un `gap`, la columna derecha se salía de la hoja:
    // por eso se usa `fr`, que reparte el espacio YA descontado el gap.
    const columnas =
      /\.encabezado\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*([\d.]+)fr\)\s*minmax\(0,\s*([\d.]+)fr\)/
        .exec(css);
    expect(columnas).not.toBeNull();
    const suma = Number(columnas![1]) + Number(columnas![2]);
    expect(suma).toBeCloseTo(100, 5);
  });

  it("el bloque derecho del encabezado puede partir el texto en vez de salirse", () => {
    const bloque = regla(css, ".encabezadoDocumento");
    expect(bloque).toMatch(/min-width:\s*0/);
    expect(bloque).toMatch(/overflow-wrap:\s*break-word/);
    // Holgura extra a la derecha frente al borde de la hoja.
    expect(bloque).toMatch(/padding-right/);
  });

  it("el número de orden no se parte en dos líneas", () => {
    const numero = regla(css, ".numeroDocumento");
    expect(numero).toMatch(/white-space:\s*nowrap/);
  });

  it("la tabla repite el encabezado en cada página", () => {
    expect(css).toContain("display: table-header-group");
  });

  it("las filas y el bloque de firmas no se cortan entre páginas", () => {
    const coincidencias = css.match(/break-inside:\s*avoid/g) ?? [];
    expect(coincidencias.length).toBeGreaterThanOrEqual(2);
  });

  it("la columna de código es más ancha que la de cantidad", () => {
    const ancho = (clase: string): number => {
      const match = new RegExp(
        `\\.${clase}\\s*\\{[^}]*width:\\s*([\\d.]+)%`
      ).exec(css);
      expect(match).not.toBeNull();
      return Number(match![1]);
    };
    // El código de Siigo tiene 15 caracteres: necesita más espacio.
    expect(ancho("colCodigo")).toBeGreaterThan(ancho("colCantidad"));
    expect(ancho("colCodigo")).toBeGreaterThanOrEqual(14);
  });

  it("el código no se parte en dos líneas", () => {
    const codigo = regla(css, ".codigo");
    expect(codigo).toMatch(/white-space:\s*nowrap/);
    // Si aun así no cupiera, se recorta en vez de aumentar la altura de la fila.
    expect(codigo).toMatch(/overflow:\s*hidden/);
    expect(codigo).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("la tabla tiene columna de bodega de salida", () => {
    expect(css).toMatch(/\.colBodega\s*\{/);
    expect(css).toMatch(/\.bodega\s*\{/);
  });

  it("los anchos de columna suman 100 %", () => {
    const anchos = [...css.matchAll(/\.col\w+\s*\{[^}]*width:\s*([\d.]+)%/g)]
      .map((m) => Number(m[1]));
    expect(anchos.length).toBeGreaterThanOrEqual(9);
    const suma = anchos.reduce((a, b) => a + b, 0);
    expect(Math.abs(suma - 100)).toBeLessThan(0.01);
  });

  it("el padding horizontal del documento no lo empuja fuera del margen", () => {
    const documento = regla(css, ".documento");
    const padding = /padding:\s*([\d.]+)cm\s+([\d.]+)cm/.exec(documento);
    if (padding) {
      // Con box-sizing border-box el padding se descuenta del contenido.
      expect(Number(padding[2])).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("Bloques de firmas del documento", () => {
  let tsx: string;

  beforeAll(() => {
    tsx = readFileSync(TSX_PATH, "utf8");
  });

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

  it("incluye los dos bloques de firma que pide el Banco", () => {
    expect(tsx).toContain("ENTREGA — ALMACENISTA");
    expect(tsx).toContain("RECIBE — ENCARGADO(A) DE DESPACHO");
    expect(tsx).toContain("Cédula:");
    expect(tsx).toContain("Hora:");
  });

  it("la entrega usa el nombre y la cédula registrados al crear la orden", () => {
    expect(tsx).toContain("orden.delivererName ?? \"\"");
    expect(tsx).toContain("orden.delivererDocument ?? \"\"");
  });

  it("la recepción deja los espacios vacíos si aún no se ha recibido", () => {
    expect(tsx).toContain("orden.receiverName ?? \"\"");
    expect(tsx).toContain("orden.receiverDocument ?? \"\"");
    expect(tsx).toContain("orden.receivedTime ?? \"____ : ____\"");
    expect(tsx).toContain("\"____ / ____ / ______\"");
  });
});

describe("Conversión de unidades de impresión", () => {
  it("el área imprimible en píxeles es coherente", () => {
    const disponibleCm = CARTA_ANCHO_CM - 2;
    expect(cmToPx(disponibleCm)).toBeGreaterThan(700);
  });
});
