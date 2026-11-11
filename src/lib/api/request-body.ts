/**
 * Lectura del cuerpo de una petición JSON.
 *
 * El agente local comprime los lotes con gzip para reducir el tráfico
 * (un lote de 10.000 filas pesa ~1.5 MB sin comprimir). Esta función
 * detecta si el cuerpo llegó comprimido y lo descomprime.
 *
 * Nota: en algunas plataformas el servidor ya descomprime automáticamente y
 * retira la cabecera `Content-Encoding`; en otras no. Por eso se comprueba
 * además la firma binaria del archivo gzip (0x1F 0x8B).
 */

import { gunzipSync } from "node:zlib";

export async function readJsonBody<T>(request: Request): Promise<T> {
  const buffer = Buffer.from(await request.arrayBuffer());

  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    const decompressed = gunzipSync(buffer).toString("utf8");
    return JSON.parse(decompressed) as T;
  }

  return JSON.parse(buffer.toString("utf8")) as T;
}
