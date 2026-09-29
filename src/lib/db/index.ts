/**
 * Capa de acceso a datos — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Este módulo proporciona una interfaz unificada para acceder a la base de datos
 * usando el cliente de Supabase (API REST).
 */

import { supabase } from "./supabase-client";

/**
 * Obtiene todos los registros de una tabla
 */
export async function getAll<T = Record<string, unknown>>(
  table: string,
  options?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
  }
): Promise<T[]> {
  let query = supabase.from(table).select(options?.select || "*");

  if (options?.order) {
    query = query.order(options.order.column, {
      ascending: options.order.ascending ?? true,
    });
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error obteniendo datos de ${table}: ${error.message}`);
  }

  return (data as T[]) || [];
}

/**
 * Obtiene un registro por ID
 */
export async function getById<T = Record<string, unknown>>(
  table: string,
  id: string,
  select?: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(select || "*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Error obteniendo registro de ${table}: ${error.message}`);
  }

  return data as T;
}

/**
 * Obtiene registros que coinciden con un filtro
 */
export async function getWhere<T = Record<string, unknown>>(
  table: string,
  column: string,
  value: string | number | boolean,
  select?: string
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select || "*")
    .eq(column, value);

  if (error) {
    throw new Error(`Error obteniendo datos de ${table}: ${error.message}`);
  }

  return (data as T[]) || [];
}

/**
 * Crea un nuevo registro
 */
export async function create<T = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const { data: newRecord, error } = await supabase
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Error creando registro en ${table}: ${error.message}`);
  }

  return newRecord as T;
}

/**
 * Actualiza un registro existente
 */
export async function update<T = Record<string, unknown>>(
  table: string,
  id: string,
  data: Record<string, unknown>
): Promise<T> {
  const { data: updatedRecord, error } = await supabase
    .from(table)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Error actualizando registro en ${table}: ${error.message}`);
  }

  return updatedRecord as T;
}

/**
 * Elimina un registro
 */
export async function remove(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) {
    throw new Error(`Error eliminando registro de ${table}: ${error.message}`);
  }
}

/**
 * Cuenta registros en una tabla
 */
export async function count(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Error contando registros de ${table}: ${error.message}`);
  }

  return count || 0;
}

/**
 * Verifica si un registro existe
 */
export async function exists(
  table: string,
  column: string,
  value: string | number | boolean
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq(column, value)
    .limit(1);

  if (error) {
    throw new Error(`Error verificando existencia en ${table}: ${error.message}`);
  }

  return (data?.length || 0) > 0;
}

/**
 * Busca registros por texto en una columna
 */
export async function search<T = Record<string, unknown>>(
  table: string,
  column: string,
  searchTerm: string,
  select?: string
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select || "*")
    .ilike(column, `%${searchTerm}%`);

  if (error) {
    throw new Error(`Error buscando en ${table}: ${error.message}`);
  }

  return (data as T[]) || [];
}

/**
 * Obtiene registros con joins
 */
export async function getWithJoin<T = Record<string, unknown>>(
  table: string,
  joinTable: string,
  joinColumn: string,
  select?: string
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select || `*, ${joinTable}(*)`);

  if (error) {
    throw new Error(`Error obteniendo datos de ${table} con join: ${error.message}`);
  }

  return (data as T[]) || [];
}

export { supabase };
