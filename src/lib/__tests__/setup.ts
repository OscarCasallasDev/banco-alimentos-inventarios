/**
 * Configuración de las pruebas — Sistema de Gestión de Inventarios
 *
 * Carga las variables de entorno del proyecto para que las pruebas de
 * integración puedan conectarse a la base de datos de desarrollo.
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envFile = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}
