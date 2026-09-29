import { cookies } from "next/headers";
import { supabase } from "@/lib/db/supabase-client";

/**
 * Obtiene el usuario actual desde la cookie de sesión.
 * Retorna null si no hay sesión activa.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  if (!userId) {
    return null;
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, first_name, last_name, role, status")
    .eq("id", userId)
    .single();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    status: user.status,
  };
}

/**
 * Verifica si hay una sesión activa.
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Requiere que haya una sesión activa.
 * Retorna el usuario o null si no está autenticado.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return user;
}
