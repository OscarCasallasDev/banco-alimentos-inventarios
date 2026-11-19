/**
 * Sincroniza las variables de entorno del proyecto con Vercel.
 *
 * Lee los valores de `.env.local` y los registra en el proyecto de Vercel
 * para los entornos production, preview y development.
 *
 * Usa la API REST de Vercel (no la CLI) por dos razones:
 *   1. Evita pasar secretos por la línea de comandos (quedan en el historial
 *      de procesos de la máquina).
 *   2. La CLI de Vercel en Windows exige `shell: true` para ejecutarse, y
 *      Node advierte que sus argumentos no se escapan.
 *
 * Uso:
 *   node scripts/vercel-env-sync.mjs            # sincroniza
 *   node scripts/vercel-env-sync.mjs --dry-run  # solo muestra qué haría
 *
 * Requisito: haber hecho `npx vercel login` una vez.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

const dryRun = process.argv.includes("--dry-run");

const PROJECT_ID = "prj_sj2Gl9Dc6BHnMYrGACjZ8QfqxyVm";
const TEAM_ID = "oscar-casallas-projects";
const ENVIRONMENTS = ["production", "preview", "development"];

/**
 * Valores que en Vercel (serverless) difieren de los de desarrollo local.
 *
 * - `DATABASE_POOL_MAX`: con el pooler en modo TRANSACCIÓN el límite ya no
 *   son las 15 conexiones de Supabase (ese pooler multiplexa), así que se
 *   puede permitir un pool más grande por proceso. Aun así se mantiene
 *   moderado: en Vercel cada instancia es un proceso aparte y un pool
 *   grande multiplica el consumo de conexiones del servidor.
 *
 * - `DATABASE_IDLE_TIMEOUT`: las instancias de Vercel se congelan cuando
 *   quedan inactivas; un socket congelado puede morir en silencio. Cerrar
 *   las conexiones ociosas pronto evita reutilizar una conexión zombi.
 *
 * `DATABASE_FALLBACK_URLS` NO se sobrescribe: se toma de `.env.local`, que
 * ya apunta al pooler en modo sesión (5432) como red de seguridad.
 */
const OVERRIDES = {
  DATABASE_POOL_MAX: "5",
  DATABASE_IDLE_TIMEOUT: "30",
};

/**
 * Variables que la aplicación necesita en el despliegue.
 *
 * - `sensitive: true`  → se guarda cifrada como Secret de Vercel.
 * - `sensitive: false` → se guarda como Config (legible en el panel).
 *
 * `NEXT_PUBLIC_*` se incrusta en el bundle del navegador durante el BUILD,
 * por eso debe existir en el entorno antes de que corra `next build`.
 */
const VARIABLES = [
  { name: "DATABASE_URL", sensitive: true, required: true },
  { name: "DATABASE_FALLBACK_URLS", sensitive: true, required: false },
  { name: "DATABASE_POOL_MAX", sensitive: false, required: false },
  { name: "DATABASE_IDLE_TIMEOUT", sensitive: false, required: false },
  { name: "SUPABASE_URL", sensitive: true, required: false },
  { name: "SUPABASE_SECRET_KEY", sensitive: true, required: false },
  { name: "SUPABASE_PUBLISHABLE_KEY", sensitive: false, required: false },
  { name: "NEXT_PUBLIC_SUPABASE_URL", sensitive: false, required: false },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", sensitive: false, required: false },
  { name: "SESSION_SECRET", sensitive: true, required: true },
];

/** Lee `.env.local` y devuelve un mapa nombre → valor. */
function readLocalEnv() {
  if (!existsSync(envPath)) {
    throw new Error(
      `No se encontró ${envPath}. La sincronización usa ese archivo como fuente.`
    );
  }

  const values = new Map();

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    // Quita las comillas envolventes si las hay.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(name, value);
  }

  return values;
}

/** Localiza el token que dejó `vercel login`. */
function readAuthToken() {
  const candidates = [
    join(process.env.APPDATA ?? "", "com.vercel.cli", "Data", "auth.json"),
    join(process.env.LOCALAPPDATA ?? "", "com.vercel.cli", "Data", "auth.json"),
    join(homedir(), ".vercel", "auth.json"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;

    const parsed = JSON.parse(readFileSync(candidate, "utf8"));
    const token = parsed?.token;
    if (token) return token;
  }

  throw new Error(
    "No se encontró el token de Vercel. Ejecuta «npx vercel login» primero."
  );
}

const API_BASE = "https://api.vercel.com";
const token = readAuthToken();

/**
 * Llama a la API de Vercel con reintentos.
 *
 * La conexión desde la máquina del usuario puede cortarse de forma
 * intermitente (ECONNRESET). Un fallo puntual de red no debe abortar la
 * sincronización a medias y dejar el proyecto con variables incompletas.
 */
async function api(method, endpoint, body, attempt = 0) {
  const MAX_ATTEMPTS = 4;

  let response;

  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      return api(method, endpoint, body, attempt + 1);
    }
    throw new Error(`fallo de red (${error.message})`);
  }

  if (!response.ok) {
    const text = await response.text();

    // 5xx: error del servidor, se puede reintentar.
    if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      return api(method, endpoint, body, attempt + 1);
    }

    throw new Error(`${method} ${endpoint} → ${response.status}: ${text}`);
  }

  return response.status === 204 ? null : response.json();
}

/** Lista las variables ya registradas en el proyecto. */
async function listEnvironmentVariables() {
  const result = await api(
    "GET",
    `/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`
  );
  return result.envs ?? [];
}

const localEnv = readLocalEnv();
const existing = await listEnvironmentVariables();
const missing = [];

for (const variable of VARIABLES) {
  const override = OVERRIDES[variable.name];
  const value = override !== undefined ? override : localEnv.get(variable.name);

  if (value === undefined) {
    if (variable.required) {
      missing.push(variable.name);
    } else {
      console.log(`- ${variable.name}: no está en .env.local (opcional, se omite)`);
    }
    continue;
  }

  if (value === "") {
    // Valor vacío intencional: si la variable existe con un valor peligroso
    // (por ejemplo, el pooler en modo transacción), se elimina.
    const current = existing.filter((env) => env.key === variable.name);

    if (current.length === 0) {
      console.log(`- ${variable.name}: valor vacío intencional → se omite`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${variable.name}: se eliminaría de Vercel`);
      continue;
    }

    for (const env of current) {
      await api(
        "DELETE",
        `/v10/projects/${PROJECT_ID}/env/${env.id}?teamId=${encodeURIComponent(TEAM_ID)}`
      );
    }
    console.log(`✓ ${variable.name} eliminada de Vercel`);
    continue;
  }

  if (dryRun) {
    const preview = value.length > 12 ? `${value.slice(0, 8)}…` : "…";
    console.log(
      `[dry-run] ${variable.name} = ${preview} (${variable.sensitive ? "secret" : "config"})`
    );
    continue;
  }

  const payload = {
    key: variable.name,
    value,
    type: variable.sensitive ? "encrypted" : "plain",
    target: ENVIRONMENTS,
  };

  const current = existing.find((env) => env.key === variable.name);

  try {
    if (current) {
      // Vercel no permite cambiar el tipo de una variable ya creada: si el
      // tipo no coincide, se borra y se vuelve a crear.
      //
      // Tipos que devuelve la API: "plain" | "encrypted" | "secret" |
      // "system". Tanto "encrypted" como "secret" son valores sensibles.
      const currentIsSensitive =
        current.type === "encrypted" || current.type === "secret";
      const desiredIsSensitive = variable.sensitive;

      if (currentIsSensitive !== desiredIsSensitive) {
        await api(
          "DELETE",
          `/v10/projects/${PROJECT_ID}/env/${current.id}?teamId=${encodeURIComponent(TEAM_ID)}`
        );
        await api(
          "POST",
          `/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`,
          payload
        );
      } else {
        // El tipo no se envía: Vercel lo rechaza en un PATCH.
        await api(
          "PATCH",
          `/v10/projects/${PROJECT_ID}/env/${current.id}?teamId=${encodeURIComponent(TEAM_ID)}`,
          { key: payload.key, value: payload.value, target: payload.target }
        );
      }
    } else {
      await api(
        "POST",
        `/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`,
        payload
      );
    }
    console.log(`✓ ${variable.name} (${variable.sensitive ? "secret" : "config"})`);
  } catch (error) {
    console.error(`✗ ${variable.name}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (missing.length > 0) {
  console.error(
    `\nFaltan en .env.local y no se pudieron sincronizar: ${missing.join(", ")}`
  );
  process.exitCode = 1;
}

if (!dryRun) {
  console.log("\nVariables sincronizadas. Verifica con: npx vercel env ls");
}
