/**
 * Servicio de usuarios — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { desc, eq } from "drizzle-orm";
import { users, userModules } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import { suggestUsername } from "@/lib/auth/username";
import { modulesForRole } from "@/lib/config/modules";
import type { RoleName } from "@/lib/auth/permissions";

/**
 * Columnas de usuario que se exponen a la API (nunca el hash).
 */
const PUBLIC_USER_COLUMNS = {
  id: users.id,
  username: users.username,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/** Datos necesarios para crear un usuario. */
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  password: string;
  role: RoleName;
  /**
   * Módulos a los que tendrá acceso.
   *
   * `null` = los que le corresponden por su rol (alta automática).
   * `[]`   = ninguno (decisión explícita del superadmin).
   */
  modules: string[] | null;
}

/** Datos que puede cambiar el superadmin sobre un usuario. */
export interface UpdateUserInput {
  role?: RoleName;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  modules?: string[];
}

/** Datos que puede cambiar un usuario sobre su propia cuenta. */
export interface UpdateProfileInput {
  username?: string;
  password?: string;
}

/**
 * Agrupa los módulos autorizados por usuario.
 */
async function modulesByUser(
  executor: DbExecutor
): Promise<Map<string, string[]>> {
  const rows = await executor.select().from(userModules);
  const map = new Map<string, string[]>();

  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row.moduleKey);
    map.set(row.userId, list);
  }

  return map;
}

/**
 * Lista los usuarios sin exponer el hash de la contraseña.
 */
export async function listUsers(executor: DbExecutor) {
  const list = await executor
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .orderBy(desc(users.createdAt));

  const modules = await modulesByUser(executor);

  return list.map((user) => ({
    ...user,
    modules: modules.get(user.id) ?? [],
  }));
}

/**
 * Obtiene un usuario por su identificador.
 */
export async function getUser(executor: DbExecutor, id: string) {
  const [user] = await executor
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    throw notFoundError("Usuario");
  }

  const modules = await modulesByUser(executor);

  return { ...user, modules: modules.get(user.id) ?? [] };
}

/**
 * Obtiene un usuario por nombre de usuario, incluyendo el hash (uso interno).
 */
export async function getUserByUsername(
  executor: DbExecutor,
  username: string
) {
  const [user] = await executor.select().from(users).where(eq(users.username, username)).limit(1);
  return user ?? null;
}

/**
 * Módulos autorizados de un usuario.
 */
export async function listUserModules(
  executor: DbExecutor,
  userId: string
): Promise<string[]> {
  const rows = await executor
    .select({ moduleKey: userModules.moduleKey })
    .from(userModules)
    .where(eq(userModules.userId, userId));

  return rows.map((row) => row.moduleKey);
}

/**
 * Reemplaza los módulos autorizados de un usuario.
 *
 * Se borra y se vuelve a insertar: la lista completa es la que el superadmin
 * envía, y así no quedan módulos viejos ni duplicados.
 */
export async function setUserModules(
  executor: DbExecutor,
  userId: string,
  modules: string[]
): Promise<void> {
  await executor.delete(userModules).where(eq(userModules.userId, userId));

  if (modules.length > 0) {
    await executor.insert(userModules).values(
      modules.map((moduleKey) => ({ userId, moduleKey }))
    );
  }
}

/**
 * Crea un usuario.
 *
 * El nombre de usuario se genera con el nombre y el apellido; no lo escribe
 * el superadmin. El correo queda vacío: el formulario no lo pide.
 */
export async function createUser(
  executor: DbExecutor,
  input: CreateUserInput
) {
  const username = await suggestUsername(
    executor,
    input.firstName,
    input.lastName
  );

  const modules = input.modules ?? modulesForRole(input.role);

  const [user] = await executor
    .insert(users)
    .values({
      username,
      email: null,
      passwordHash: hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: "ACTIVE",
    })
    .returning(PUBLIC_USER_COLUMNS);

  if (modules.length > 0) {
    await executor.insert(userModules).values(
      modules.map((moduleKey) => ({ userId: user.id, moduleKey }))
    );
  }

  return { ...user, modules };
}

/**
 * Actualiza un usuario (superadmin): rol, estado y módulos autorizados.
 */
export async function updateUser(
  executor: DbExecutor,
  id: string,
  input: UpdateUserInput
) {
  await getUser(executor, id);

  const [user] = await executor
    .update(users)
    .set({
      ...(input.role !== undefined && { role: input.role }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning(PUBLIC_USER_COLUMNS);

  if (input.modules !== undefined) {
    await setUserModules(executor, id, input.modules);
  }

  return { ...user, modules: input.modules ?? (await modulesByUser(executor)).get(id) ?? [] };
}

/**
 * Actualiza la cuenta propia: nombre de usuario y contraseña.
 *
 * El usuario NO puede cambiar aquí su rol, su estado ni sus permisos.
 */
export async function updateOwnProfile(
  executor: DbExecutor,
  userId: string,
  input: UpdateProfileInput
) {
  if (input.username !== undefined) {
    const username = input.username.trim();

    const [duplicate] = await executor
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (duplicate && duplicate.id !== userId) {
      throw conflictError("Ese nombre de usuario ya está en uso");
    }
  }

  const [user] = await executor
    .update(users)
    .set({
      ...(input.username !== undefined && { username: input.username.trim() }),
      ...(input.password !== undefined && {
        passwordHash: hashPassword(input.password),
      }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(PUBLIC_USER_COLUMNS);

  return user;
}

/**
 * Baja lógica de un usuario (regla 4: no se eliminan datos históricos).
 */
export async function deactivateUser(executor: DbExecutor, id: string) {
  await getUser(executor, id);

  const [user] = await executor
    .update(users)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(PUBLIC_USER_COLUMNS);

  return user;
}

/**
 * Registra el último inicio de sesión.
 */
export async function touchLastLogin(
  executor: DbExecutor,
  id: string
): Promise<void> {
  await executor
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, id));
}
