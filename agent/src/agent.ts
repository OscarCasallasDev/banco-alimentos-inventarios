/**
 * Agente local de sincronización con Siigo Pyme.
 *
 * Se ejecuta en el computador del Banco (donde está instalado Siigo Pyme) y
 * envía el reporte de inventario al backend cada hora.
 *
 * POR QUÉ UN AGENTE LOCAL
 *
 *   Siigo Pyme es una aplicación de escritorio: el reporte se genera en ese
 *   equipo. La aplicación web está en la nube y NO puede leer las carpetas
 *   del computador del Banco. El agente es el puente: lee el archivo, lo
 *   interpreta y lo sube por HTTP con autenticación.
 *
 * FLUJO
 *
 *   1. Busca en la carpeta de intercambio los .xlsx modificados recently.
 *   2. Calcula el SHA-256 del archivo (identidad de la importación).
 *   3. Consulta al backend si ese archivo ya fue importado; si fue, no hace
 *      nada (evita reenvíos innecesarios).
 *   4. Crea la corrida de importación.
 *   5. Interpreta el archivo con el lector propio (rápido y de baja memoria).
 *   6. Envía las filas por lotes.
 *   7. Cierra la corrida.
 *   8. Registra el resultado en el log local.
 *
 * NO ejecuta ExcelSiigo ni escribe en Siigo Pyme: sólo lee el archivo que el
 * procedimiento autorizado del Banco deja en la carpeta de intercambio.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { parseSiigoReport } from "../../src/lib/siigo/import/parser";

// ============================================================
// Configuración
// ============================================================

export interface AgentConfig {
  /** URL base del backend (por ejemplo https://inventarios.banco.org). */
  apiUrl: string;
  /** Clave de API del agente (la que generó el administrador). */
  apiKey: string;
  /** Carpeta donde el Banco deja el reporte de Siigo Pyme. */
  watchFolder: string;
  /** Identificador de este equipo (aparece en el historial). */
  agentId: string;
  /** Filas por lote enviado al backend. */
  batchSize: number;
  /** Minutos de antigüedad máxima del archivo para considerarlo nuevo. */
  maxAgeMinutes: number;
  /** Si es true, procesa el archivo aunque el backend diga que ya se importó. */
  force: boolean;
}

export const DEFAULT_CONFIG: AgentConfig = {
  apiUrl: "http://localhost:3000",
  apiKey: "",
  watchFolder: "C:\\BancoAlimentos\\Siigo\\Salidas",
  agentId: "agente-pc-almacen",
  batchSize: 10000,
  maxAgeMinutes: 90,
  force: false,
};

/** Carga la configuración desde `config.json` junto al agente. */
export function loadConfig(configPath: string): AgentConfig {
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return { ...DEFAULT_CONFIG, ...raw };
}

// ============================================================
// Log
// ============================================================

export interface Logger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export function createLogger(logFile: string): Logger {
  function write(level: string, message: string) {
    const line = `[${new Date().toISOString()}] ${level} ${message}`;
    console.log(line);
    try {
      fs.appendFileSync(logFile, `${line}\n`);
    } catch {
      // Si no se puede escribir el log, no se interrumpe la sincronización.
    }
  }

  return {
    info: (message) => write("INFO ", message),
    error: (message, error) =>
      write("ERROR", `${message}${error ? ` :: ${String(error)}` : ""}`),
  };
}

// ============================================================
// Utilidades
// ============================================================

/** SHA-256 de un archivo. */
export async function hashFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Busca el reporte más reciente de la carpeta de intercambio.
 * Solo considera archivos .xlsx modificados dentro de `maxAgeMinutes`.
 */
export async function findReport(
  folder: string,
  maxAgeMinutes: number
): Promise<string | null> {
  if (!fs.existsSync(folder)) return null;

  const entries = await readdir(folder);
  const candidates: { path: string; mtime: number }[] = [];

  for (const entry of entries) {
    if (!/\.xlsx$/i.test(entry)) continue;
    if (entry.startsWith("~$")) continue; // archivo temporal de Excel
    const fullPath = path.join(folder, entry);
    const info = await stat(fullPath);
    if (!info.isFile()) continue;
    const ageMinutes = (Date.now() - info.mtimeMs) / 60000;
    if (ageMinutes > maxAgeMinutes) continue;
    candidates.push({ path: fullPath, mtime: info.mtimeMs });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

/** Cliente HTTP del backend con autenticación por clave de agente. */
export class BackendClient {
  constructor(private readonly config: AgentConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "X-Siigo-Agent-Key": this.config.apiKey,
      "User-Agent": `siigo-sync-agent/${this.config.agentId}`,
      ...extra,
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl.replace(/\/$/, "")}${path}`;
    const response = await fetch(url, init);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `El backend respondió ${response.status} ${response.statusText}: ${text.slice(0, 400)}`
      );
    }

    const payload = (await response.json()) as { data?: T };
    return (payload?.data ?? payload) as T;
  }

  /** Crea la corrida de importación. */
  async createRun(input: {
    fileSha256: string;
    fileName: string;
    fileSize: number;
    meta: Record<string, unknown>;
  }): Promise<{ id: string; alreadyProcessed: boolean }> {
    return this.request("/api/siigo/importaciones", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileSha256: input.fileSha256,
        fileName: input.fileName,
        fileSize: input.fileSize,
        source: "AGENT",
        agentId: this.config.agentId,
        meta: input.meta,
      }),
    });
  }

  /** Envía un lote de filas normalizadas. */
  async sendBatch(
    runId: string,
    batchIndex: number,
    rows: unknown[]
  ): Promise<{ accepted: number; rejected: number }> {
    const body = JSON.stringify({ batchIndex, rows });
    return this.request(`/api/siigo/importaciones/${runId}/lotes`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      }),
      body: gzipSync(Buffer.from(body, "utf8")),
    });
  }

  /** Cierra la corrida. */
  async finalize(runId: string): Promise<{ status: string; processedRows: number }> {
    return this.request(`/api/siigo/importaciones/${runId}/finalizar`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
  }
}

// ============================================================
// Sincronización
// ============================================================

export interface SyncResult {
  status:
    | "SIN_ARCHIVO"
    | "YA_PROCESADO"
    | "SINCRONIZADO"
    | "ERROR";
  fileName?: string;
  rowsSent?: number;
  durationMs?: number;
  message?: string;
}

/**
 * Ejecuta un ciclo de sincronización completo.
 */
export async function runSync(
  config: AgentConfig,
  logger: Logger
): Promise<SyncResult> {
  const started = Date.now();

  const reportPath = await findReport(config.watchFolder, config.maxAgeMinutes);
  if (!reportPath) {
    logger.info(
      `No hay reportes nuevos en ${config.watchFolder} (ventana de ${config.maxAgeMinutes} min).`
    );
    return { status: "SIN_ARCHIVO" };
  }

  const fileName = path.basename(reportPath);
  const fileInfo = await stat(reportPath);
  logger.info(`Reporte detectado: ${fileName} (${fileInfo.size} bytes)`);

  // ---------- 1. Huella del archivo ----------
  const fileSha256 = await hashFile(reportPath);
  logger.info(`SHA-256: ${fileSha256}`);

  const client = new BackendClient(config);

  try {
    // ---------- 2. Interpretación local ----------
    const buffer = await readFile(reportPath);
    const t0 = Date.now();
    const report = parseSiigoReport(buffer);
    logger.info(
      `Reporte interpretado en ${Date.now() - t0} ms: ` +
        `${report.stats.dataRows} filas de movimiento ` +
        `(${report.stats.openingRows} de apertura), ` +
        `${report.stats.skippedSubtotalRows} subtotales excluidos.`
    );

    // ---------- 3. Crear (o recuperar) la corrida ----------
    const run = await client.createRun({
      fileSha256,
      fileName,
      fileSize: fileInfo.size,
      meta: {
        title: report.meta.title,
        periodFrom: report.meta.periodFrom,
        periodTo: report.meta.periodTo,
        generatedAt: report.meta.generatedAt,
        reportDate: report.meta.reportDate,
      },
    });

    if (run.alreadyProcessed && !config.force) {
      logger.info(
        `El archivo ya se había importado (corrida ${run.id}). No se procesa de nuevo.`
      );
      return { status: "YA_PROCESADO", fileName };
    }

    logger.info(`Corrida de importación: ${run.id}`);

    // ---------- 4. Envío por lotes ----------
    const rows = report.rows.map((row) => ({
      rowNumber: row.rowNumber,
      productCode: row.productCode,
      productName: row.productName,
      reference: row.reference,
      unit: row.unit,
      brand: row.brand,
      description: row.description,
      document: row.document,
      date: row.date,
      isOpening: row.isOpening,
      bodega: row.bodega,
      ubicacion: row.ubicacion,
      qtyBefore: row.qtyBefore,
      qtyIn: row.qtyIn,
      qtyOut: row.qtyOut,
      qtyNet: row.qtyNet,
      qtyAccum: row.qtyAccum,
      valueMovement: row.valueMovement,
      qty2In: row.qty2In,
      qty2Out: row.qty2Out,
      qty2Balance: row.qty2Balance,
    }));

    let sent = 0;
    const tSend = Date.now();
    for (let i = 0; i < rows.length; i += config.batchSize) {
      const chunk = rows.slice(i, i + config.batchSize);
      const result = await client.sendBatch(run.id, i / config.batchSize, chunk);
      sent += chunk.length;
      logger.info(
        `Lote ${i / config.batchSize}: ${chunk.length} filas enviadas ` +
          `(${result.accepted} admitidas, ${result.rejected} rechazadas).`
      );
    }
    logger.info(
      `Filas enviadas: ${sent} en ${((Date.now() - tSend) / 1000).toFixed(1)} s`
    );

    // ---------- 5. Cierre ----------
    const finished = await client.finalize(run.id);
    logger.info(
      `Importación finalizada: ${finished.status}, ${finished.processedRows} filas procesadas.`
    );

    return {
      status: "SINCRONIZADO",
      fileName,
      rowsSent: sent,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    logger.error(`Falló la sincronización de ${fileName}`, error);
    return {
      status: "ERROR",
      fileName,
      durationMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
