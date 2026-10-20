/**
 * Servicio de usuarios — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { desc, eq, or } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { conflictError, notFoundError } from "@/lib/utils/errors";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validations/schemas";

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

/**
 * Lista los usuarios sin exponer el hash de la contraseña.
 */
export async function listUsers(executor: DbExecutor) {
  return executor
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .orderBy(desc(users.createdAt));
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

  return user;
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
 * Crea un usuario.
 */
export async function createUser(
  executor: DbExecutor,
  input: CreateUserInput
) {
  const existing = await executor
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, input.username), eq(users.email, input.email)))
    .limit(1);

  if (existing.length > 0) {
    throw conflictError("El nombre de usuario o el correo ya están en uso");
  }

  const [user] = await executor
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      passwordHash: hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: input.status,
    })
    .returning(PUBLIC_USER_COLUMNS);

  return user;
}

/**
 * Actualiza un usuario. Si se envía contraseña, se rehashea.
 */
export async function updateUser(
  executor: DbExecutor,
  id: string,
  input: UpdateUserInput
) {
  await getUser(executor, id);

  if (input.username || input.email) {
    const duplicate = await executor
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          input.username ? eq(users.username, input.username) : undefined,
          input.email ? eq(users.email, input.email) : undefined
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw conflictError("El nombre de usuario o el correo ya están en uso");
    }
  }

  const [user] = await executor
    .update(users)
    .set({
      ...(input.username !== undefined && { username: input.username }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.password !== undefined && {
        passwordHash: hashPassword(input.password),
      }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
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
