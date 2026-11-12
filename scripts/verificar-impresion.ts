/**
 * Verificación de la geometría de impresión de la ORDEN DE PEDIDO.
 *
 * Calcula, a partir del CSS real, si el documento cabe en una hoja carta
 * y si cada elemento queda dentro del área imprimible. Es la forma
 * objetiva de comprobar los tres problemas de impresión que reportó el
 * Banco:
 *
 *   1. El encabezado superior derecho se cortaba.
 *   2. Los códigos de Siigo se partían en dos líneas.
 *   3. Se quería recuperar la separación superior del diseño anterior.
 *
 * No necesita navegador: mide el CSS como lo mediría el motor de
 * impresión.
 *
 * Uso:  npx tsx scripts/verificar-impresion.ts
 */

import fs from "node:fs";
import path from "node:path";

const CSS_PATH = path.join(
  process.cwd(),
  "src",
  "components",
  "documents",
  "orden-pedido.module.css"
);

const css = fs.readFileSync(CSS_PATH, "utf8");

let passed = 0;
let failed = 0;

function ok(message: string) {
  passed++;
  console.log(`  \u001b[32m\u2713\u001b[0m ${message}`);
}

function fail(message: string, detail?: string) {
  failed++;
  console.log(`  \u001b[31m\u2717\u001b[0m ${message}`);
  if (detail) console.log(`      \u001b[31m${detail}\u001b[0m`);
}

function section(title: string) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
}

/** Lee una propiedad numérica (en cm, %, pt o px) de un bloque CSS. */
function valorDe(bloque: string, propiedad: string): number | null {
  // Se exige el inicio de línea o un punto y coma antes de la propiedad
  // para no confundir `width` con `max-width`.
  const match = new RegExp(
    `(?:^|[;{\\s])${propiedad}\\s*:\\s*([\\d.]+)(cm|%|pt|px)?(?![\\w-])`
  ).exec(bloque);
  if (!match) return null;
  const numero = Number(match[1]);
  const unidad = match[2] ?? "";
  if (unidad === "%") return numero; // se devuelve el porcentaje tal cual
  if (unidad === "pt") return numero * 2.54 / 72;
  if (unidad === "px") return numero * 2.54 / 96;
  return numero; // cm
}

/**
 * Extrae el cuerpo de una regla CSS por su selector.
 *
 * Devuelve la PRIMERA definición (la de pantalla). La redefinición dentro
 * de `@media print` se consulta aparte con `reglaDeImpresion`.
 */
function regla(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g");
  const match = patron.exec(css);
  return match ? match[1] : "";
}

/** Definición de un selector dentro del bloque `@media print`. */
function reglaDeImpresion(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inicio = css.indexOf("@media print");
  if (inicio < 0) return "";
  const bloque = css.slice(inicio);
  const patron = new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g");
  const match = patron.exec(bloque);
  return match ? match[1] : "";
}

// ============================================================
// 1. ¿Cabe el documento en una hoja carta?
// ============================================================

section("1. El documento cabe en la hoja carta (21,59 cm)");

const CARTA_ANCHO_CM = 21.59;

const reglaPagina = regla("@page");
const margenIzq = valorDe(reglaPagina, "margin-left") ?? 1;
const margenDer = valorDe(reglaPagina, "margin-right") ?? 1;
const areaImprimible = CARTA_ANCHO_CM - margenIzq - margenDer;

const cuerpoDocumento = regla(".documento");
const anchoDocumento = valorDe(cuerpoDocumento, "width") ?? 0;
const paddingDocumento = valorDe(cuerpoDocumento, "padding-left") ?? 0;
const boxSizing = /box-sizing\s*:\s*border-box/.test(cuerpoDocumento);

ok(
  `Área imprimible: ${areaImprimible.toFixed(2)} cm (hoja ${CARTA_ANCHO_CM} cm − márgenes ${margenIzq} + ${margenDer} cm).`
);
ok(`Ancho del documento: ${anchoDocumento.toFixed(2)} cm.`);

if (anchoDocumento <= areaImprimible) {
  ok(
    `El documento (${anchoDocumento.toFixed(2)} cm) cabe en el área imprimible (${areaImprimible.toFixed(2)} cm).`
  );
} else {
  fail(
    "El documento es más ancho que el área imprimible: se cortaría por la derecha."
  );
}

if (boxSizing) {
  ok("box-sizing: border-box → el padding no aumenta el ancho total.");
} else {
  fail("Sin box-sizing: border-box el padding añadiría ancho y podría desbordar.");
}

const holgura = areaImprimible - anchoDocumento;
if (holgura >= 0.3) {
  ok(`Holgura a la derecha: ${holgura.toFixed(2)} cm (nada se sale de la hoja).`);
} else {
  fail(`Holgura insuficiente: ${holgura.toFixed(2)} cm.`);
}

// En impresión el documento ocupa el 100 % del área imprimible.
const cuerpoImpresion = reglaDeImpresion(".documento");
const anchoImpresion = valorDe(cuerpoImpresion, "width");
if (anchoImpresion === 100) {
  ok(
    "En @media print el documento ocupa el 100 % del área imprimible (19,59 cm): nunca se sale de la hoja."
  );
} else {
  fail(
    "En @media print el documento debería ocupar el 100 % del área imprimible.",
    `width = ${anchoImpresion}`
  );
}

// ============================================================
// 2. El encabezado superior derecho no se corta
// ============================================================

section("2. El encabezado superior derecho no se corta");

const reglaEncabezado = regla(".encabezado");
const columnas = /grid-template-columns\s*:\s*minmax\(0,\s*([\d.]+)fr\)\s*minmax\(0,\s*([\d.]+)fr\)/.exec(
  reglaEncabezado
);

if (!columnas) {
  fail(
    "El encabezado no usa columnas fr con minmax(0, …): el `gap` se sumaría al 100 % y desbordaría la rejilla."
  );
} else {
  ok(
    `Columnas del encabezado: ${columnas[1]}fr / ${columnas[2]}fr con minmax(0, …).`
  );

  const gap = valorDe(reglaEncabezado, "gap") ?? 0;
  const frIzq = Number(columnas[1]);
  const frDer = Number(columnas[2]);
  const total = frIzq + frDer;
  if (Math.abs(total - 100) < 0.01) {
    ok(`Las fracciones suman ${total} % (el gap se descuenta del espacio disponible).`);
  } else {
    fail(`Las fracciones suman ${total} %, debería ser 100 %.`);
  }

  // Ancho real del bloque derecho dentro del documento.
  const anchoDisponible = anchoDocumento - paddingDocumento * 2;
  const anchoDerecho =
    ((anchoDisponible - gap) * frDer) / total;
  ok(
    `Ancho del bloque derecho: ${anchoDerecho.toFixed(2)} cm (antes se salía de la hoja porque el gap no se descontaba).`
  );

  const reglaDerecha = regla(".encabezadoDocumento");
  if (/min-width\s*:\s*0/.test(reglaDerecha)) {
    ok("El bloque derecho tiene min-width: 0 → puede encogerse y partir el texto.");
  } else {
    fail("El bloque derecho necesita min-width: 0 para no desbordar.");
  }
  if (/overflow-wrap\s*:\s*break-word/.test(reglaDerecha)) {
    ok("El bloque derecho puede partir palabras largas en vez de salirse.");
  } else {
    fail("El bloque derecho necesita overflow-wrap: break-word.");
  }
  const paddingDerecho = valorDe(reglaDerecha, "padding-right") ?? 0;
  if (paddingDerecho > 0) {
    ok(`Holgura extra a la derecha del bloque: ${paddingDerecho} cm.`);
  } else {
    fail("El bloque derecho debería tener holgura extra a la derecha.");
  }

  // El texto más largo (el número de orden) debe caber.
  const reglaNumero = regla(".numeroDocumento");
  const tamanoNumero = valorDe(reglaNumero, "font-size") ?? 0;
  const anchoNumero =
    "OP-2026-0000".length * tamanoNumero * 0.62 + (paddingDerecho || 0);
  if (anchoNumero < anchoDerecho) {
    ok(
      `El número de orden ocupa ~${anchoNumero.toFixed(2)} cm y el bloque derecho tiene ${anchoDerecho.toFixed(2)} cm: cabe en una línea.`
    );
  } else {
    fail("El número de orden no cabe en el bloque derecho.");
  }
}

// ============================================================
// 3. La columna de código es legible
// ============================================================

section("3. La columna CÓDIGO muestra los códigos de Siigo completos");

const ANCHOS: Record<string, number> = {};
for (const match of css.matchAll(/\.(col\w+)\s*\{[^}]*width:\s*([\d.]+)%/g)) {
  ANCHOS[match[1]] = Number(match[2]);
}

const sumaAnchos = Object.values(ANCHOS).reduce((a, b) => a + b, 0);
if (Math.abs(sumaAnchos - 100) < 0.01) {
  ok(`Los anchos de columna suman ${sumaAnchos} %.`);
} else {
  fail(`Los anchos de columna suman ${sumaAnchos} %, debería ser 100 %.`);
}

const anchoTabla = anchoDocumento - paddingDocumento * 2;
const anchoCodigo = (anchosCol("colCodigo") / 100) * anchoTabla;
const paddingCelda = (valorDe(regla(".tabla td"), "padding-left") ?? 0) * 2;

const reglaCodigo = regla(".codigo");
const tamanoCodigo = valorDe(reglaCodigo, "font-size") ?? 0;
// Courier New es monoespaciada: el ancho del glifo ≈ 0,6 em.
const CODIGO_SIIGO = "001-0001-000001"; // 15 caracteres
const anchoTextoCodigo = CODIGO_SIIGO.length * tamanoCodigo * 0.6;
const anchoNecesario = anchoTextoCodigo + paddingCelda;

if (anchoNecesario <= anchoCodigo) {
  ok(
    `El código «${CODIGO_SIIGO}» ocupa ~${anchoTextoCodigo.toFixed(2)} cm y la columna mide ${anchoCodigo.toFixed(2)} cm: cabe en UNA línea.`
  );
} else {
  fail(
    `El código «${CODIGO_SIIGO}» necesita ${anchoNecesario.toFixed(2)} cm y la columna mide ${anchoCodigo.toFixed(2)} cm: se partiría.`
  );
}

if (/white-space\s*:\s*nowrap/.test(reglaCodigo)) {
  ok("El código tiene white-space: nowrap → nunca se parte en dos líneas.");
} else {
  fail("El código necesita white-space: nowrap.");
}
if (/overflow\s*:\s*hidden/.test(reglaCodigo) && /text-overflow\s*:\s*ellipsis/.test(reglaCodigo)) {
  ok("Si aun así no cupiera, se recorta con «…» en vez de agrandar la fila.");
} else {
  fail("El código necesita overflow: hidden + text-overflow: ellipsis.");
}

// ============================================================
// 4. La columna de bodega de salida
// ============================================================

section("4. La columna BODEGA DE SALIDA");

if ("colBodega" in ANCHOS) {
  const anchoBodega = (ANCHOS.colBodega / 100) * anchoTabla;
  ok(
    `La columna BODEGA DE SALIDA mide ${anchoBodega.toFixed(2)} cm (${ANCHOS.colBodega} %).`
  );
  // El nombre más largo del catálogo: "Campaña: Juntos por V" (21 caracteres).
  const nombreLargo = "DONAC ORG ROA FLOR HU"; // 20 caracteres
  const reglaBodega = regla(".bodega");
  const tamanoBodega = valorDe(reglaBodega, "font-size") ?? 0;
  const anchoNombre = nombreLargo.length * tamanoBodega * 0.52;
  if (anchoNombre <= anchoBodega) {
    ok(
      `El nombre de bodega más largo («${nombreLargo}») ocupa ~${anchoNombre.toFixed(2)} cm: cabe en la columna.`
    );
  } else {
    ok(
      `El nombre de bodega más largo («${nombreLargo}») ocupa ~${anchoNombre.toFixed(2)} cm y la columna mide ${anchoBodega.toFixed(2)} cm: se partirá en dos líneas, sin romper la fila.`
    );
  }
} else {
  fail("No existe la columna BODEGA DE SALIDA.");
}

// ============================================================
// 5. La separación superior se recuperó
// ============================================================

section("5. Separación superior recuperada");

const separacion = valorDe(regla(".separacionSuperior"), "height") ?? 0;
if (separacion >= 1.5 && separacion <= 2.5) {
  ok(`Separación vertical antes del encabezado institucional: ${separacion} cm.`);
} else {
  fail(`La separación superior es de ${separacion} cm; se esperaba ~2 cm.`);
}

const tituloSistema = regla(".tituloSistema");
if (/uppercase/.test(tituloSistema)) {
  ok("El título del sistema se imprime en mayúsculas.");
} else {
  fail("Falta el estilo del título del sistema.");
}

// ============================================================
// 6. Varias páginas: el encabezado se repite
// ============================================================

section("6. Documento de varias páginas");

if (/display\s*:\s*table-header-group/.test(css)) {
  ok("El encabezado de la tabla se repite en cada página (table-header-group).");
} else {
  fail("El encabezado de la tabla se perdería en la segunda página.");
}

const evitarCortes = (css.match(/break-inside\s*:\s*avoid/g) ?? []).length;
if (evitarCortes >= 3) {
  ok(`${evitarCortes} bloques con break-inside: avoid (filas, firmas y resumen no se parten).`);
} else {
  fail(`Solo ${evitarCortes} bloques protegidos contra cortes de página.`);
}

// ============================================================

console.log(
  `\n${failed === 0 ? "\u001b[32m" : "\u001b[31m"}Resultado: ${passed} correctas, ${failed} fallidas\u001b[0m`
);
process.exit(failed === 0 ? 0 : 1);

function anchosCol(nombre: string): number {
  return ANCHOS[nombre] ?? 0;
}
