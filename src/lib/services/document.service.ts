/**
 * Servicio de documentos (soportes) — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Cada documento del flujo (entrada, pedido, factura, recibo, despacho)
 * queda registrado en la tabla `documents`, lo que permite reconstruir
 * la trazabilidad documental de cualquier operación.
 */

import { desc, eq } from "drizzle-orm";
import { documents } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import type { DocumentType } from "@/types/database";

export interface DocumentInput {
  type: DocumentType;
  number: string;
  relatedId: string;
  generatedBy: string;
}

/**
 * Registra un documento generado.
 */
export async function createDocument(
  executor: DbExecutor,
  input: DocumentInput
) {
  const [document] = await executor.insert(documents).values(input).returning();
  return document;
}

/**
 * Lista los documentos registrados, del más reciente al más antiguo.
 */
export async function listDocuments(executor: DbExecutor, limit = 200) {
  return executor
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(limit);
}

/**
 * Busca los documentos relacionados con un registro.
 */
export async function listDocumentsByRelated(
  executor: DbExecutor,
  relatedId: string
) {
  return executor
    .select()
    .from(documents)
    .where(eq(documents.relatedId, relatedId));
}
