/**
 * Punto de entrada del agente local de sincronización.
 *
 * La importación del reporte de Siigo Pyme es MANUAL: se hace desde el
 * botón «Importar Excel» del dashboard, con confirmación del usuario.
 *
 * Este agente queda como una herramienta opcional para quien quiera
 * dispararlo a mano. La Tarea Programada de Windows que lo ejecutaba cada
 * hora se instala DESHABILITADA (`install.ps1`), de modo que no hay ninguna
 * importación automática.
 *
 * Uso manual:
 *   npm run agent:run
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  createLogger,
  runSync,
  type AgentConfig,
} from "./agent";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, "..");

async function main() {
  const configPath =
    process.env.AGENT_CONFIG ?? path.join(baseDir, "config.json");
  const logFile =
    process.env.AGENT_LOG ?? path.join(baseDir, "logs", "sincronizacion.log");

  const config: AgentConfig = loadConfig(configPath);
  const logger = createLogger(logFile);

  logger.info("=== Iniciando sincronización con Siigo Pyme ===");
  logger.info(`Backend: ${config.apiUrl}`);
  logger.info(`Carpeta : ${config.watchFolder}`);
  logger.info(`Equipo  : ${config.agentId}`);

  if (!config.apiKey) {
    logger.error(
      "Falta la clave del agente (apiKey). Genérela en Integración Siigo → Agente local y colóquela en config.json."
    );
    process.exitCode = 1;
    return;
  }

  const result = await runSync(config, logger);

  switch (result.status) {
    case "SINCRONIZADO":
      logger.info(
        `Sincronización completada: ${result.rowsSent} filas en ${(
          (result.durationMs ?? 0) / 1000
        ).toFixed(1)} s.`
      );
      break;
    case "YA_PROCESADO":
      logger.info("El archivo ya estaba sincronizado. No se hizo nada.");
      break;
    case "SIN_ARCHIVO":
      logger.info("No había un reporte nuevo que sincronizar.");
      break;
    case "ERROR":
      logger.error(`La sincronización falló: ${result.message}`);
      process.exitCode = 1;
      break;
  }

  logger.info("=== Fin de la sincronización ===\n");
}

main().catch((error) => {
  console.error("Error inesperado en el agente:", error);
  process.exitCode = 1;
});
