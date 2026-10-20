/**
 * Utilidades compartidas de los scripts de base de datos
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Lee el archivo .env.local y devuelve sus variables.
 */
export function readEnvFile(file = ".env.local") {
  if (!fs.existsSync(file)) return {};

  const content = fs.readFileSync(file, "utf8");
  const env = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }

  return env;
}

/**
 * Escribe (o actualiza) una variable en el archivo .env.local.
 */
export function writeEnvValue(key, value, file = ".env.local") {
  let content = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8")
    : "";

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    if (content && !content.endsWith("\n")) content += "\n";
    content += `${line}\n`;
  }

  fs.writeFileSync(file, content, "utf8");
}

/**
 * Extrae el `project_ref` de Supabase de una URL de conexión o del propio
 * nombre del host. Ej: `db.abcdefghijklmnopqrst.supabase.co` → `abcdefghijklmnopqrst`
 */
export function extractProjectRef(url) {
  if (!url) return null;
  const match = /([a-z]{20})\.supabase\.co/i.exec(url);
  return match ? match[1] : null;
}

/**
 * Extrae la contraseña de una URL de conexión PostgreSQL.
 */
export function extractPassword(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.password);
  } catch {
    return null;
  }
}

/**
 * Construye las URLs candidatas de conexión para un proyecto de Supabase.
 * Se prueban en orden porque en redes sin IPv6 el host directo no resuelve.
 */
export function buildConnectionCandidates(databaseUrl, regions = []) {
  const candidates = [];

  if (databaseUrl) {
    candidates.push({ label: "Conexión directa (URL configurada)", url: databaseUrl });
  }

  const projectRef = extractProjectRef(databaseUrl);
  const password = extractPassword(databaseUrl);

  if (!projectRef || !password) return candidates;

  const defaultRegions = [
    "us-east-1",
    "us-west-2",
    "us-central-1",
    "sa-east-1",
    "eu-west-1",
    ...regions,
  ];

  for (const region of defaultRegions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    candidates.push({
      label: `Pooler sesión (${region}:5432)`,
      url: `postgresql://postgres.${projectRef}:${encodeURIComponent(
        password
      )}@${host}:5432/postgres`,
    });
    candidates.push({
      label: `Pooler transacción (${region}:6543)`,
      url: `postgresql://postgres.${projectRef}:${encodeURIComponent(
        password
      )}@${host}:6543/postgres`,
    });
  }

  return candidates;
}

/**
 * Lista los archivos de migración SQL en orden.
 */
export function listMigrations(directory = "drizzle") {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".sql") && !file.includes("seed"))
    .sort();
}

/**
 * Ruta absoluta de un archivo del proyecto.
 */
export function resolvePath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

/**
 * Formatea un mensaje con color en la consola (Windows compatible).
 */
export const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function colorize(text, color) {
  return `${colors[color] ?? ""}${text}${colors.reset}`;
}

export function logOk(message) {
  console.log(`${colorize("✓", "green")} ${message}`);
}

export function logFail(message) {
  console.log(`${colorize("✗", "red")} ${message}`);
}

export function logWarn(message) {
  console.log(`${colorize("!", "yellow")} ${message}`);
}

export function logInfo(message) {
  console.log(`${colorize("›", "cyan")} ${message}`);
}
