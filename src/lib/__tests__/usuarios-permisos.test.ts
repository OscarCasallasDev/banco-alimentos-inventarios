/**
 * Pruebas — Usuarios, autenticación y permisos por módulo
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Cubre lo específico de esta implementación:
 *   - Generación del nombre de usuario a partir del nombre y el apellido.
 *   - Política de seguridad de la contraseña.
 *   - Normalización del rol escrito a mano.
 *   - Persistencia de los permisos de módulo por usuario.
 *   - Inicio de sesión de un usuario creado por el superadmin.
 */

import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closeDb, type DbTransaction } from "@/lib/db/client";
import { users, userModules } from "@/lib/db/schema";
import { buildUsername, slugify, suggestUsername } from "@/lib/auth/username";
import { checkPasswordStrength } from "@/lib/auth/password";
import { normalizeRole, canAccessModule } from "@/lib/auth/permissions";
import {
  createUser,
  setUserModules,
  updateOwnProfile,
} from "@/lib/services/user.service";
import { getUserByUsername } from "@/lib/services/user.service";
import { verifyPassword } from "@/lib/auth/password";

const tieneBase = Boolean(process.env.DATABASE_URL);
const describeDb = tieneBase ? describe : describe.skip;

// ============================================================
// 1. GENERACIÓN DEL NOMBRE DE USUARIO
// ============================================================

describe("Generación del nombre de usuario", () => {
  it("une nombre y apellido en minúsculas", () => {
    expect(buildUsername("Carlos", "Ramírez")).toBe("carlosramirez");
    expect(buildUsername("Ana", "Maria")).toBe("anamaria");
  });

  it("elimina tildes, espacios y caracteres especiales", () => {
    expect(slugify("José")).toBe("jose");
    expect(slugify(" Ñoño ")).toBe("nono");
    expect(slugify("O'Brien")).toBe("obrien");
    expect(slugify("María-José")).toBe("mariajose");
  });

  it("normaliza acentos composed y decomposed por igual", () => {
    expect(buildUsername("Ángel", "Muñoz")).toBe("angelmunoz");
    expect(buildUsername("Ángel", "Muñoz")).toBe("angelmunoz");
  });

  it("usa 'usuario' cuando no queda nada utilizable", () => {
    expect(buildUsername("---", "***")).toBe("usuario");
  });
});

// ============================================================
// 2. POLÍTICA DE CONTRASEÑAS
// ============================================================

describe("Política de contraseñas", () => {
  it("acepta una contraseña que cumple todas las reglas", () => {
    expect(checkPasswordStrength("Banco2026!").valid).toBe(true);
  });

  it("rechaza contraseñas de menos de 8 caracteres", () => {
    const result = checkPasswordStrength("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("8 caracteres");
  });

  it("exige al menos una letra", () => {
    const result = checkPasswordStrength("12345678!");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("letra");
  });

  it("exige al menos un número", () => {
    const result = checkPasswordStrength("Abcdefghi!");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("número");
  });

  it("exige al menos un símbolo especial", () => {
    const result = checkPasswordStrength("Banco2026");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("símbolo especial");
  });

  it("acumula todos los motivos del rechazo", () => {
    const result = checkPasswordStrength("abc");
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ============================================================
// 3. NORMALIZACIÓN DEL ROL
// ============================================================

describe("Normalización del rol", () => {
  it("reconoce el mismo rol sin importar mayúsculas ni espacios", () => {
    expect(normalizeRole("almacenista")).toBe("ALMACENISTA");
    expect(normalizeRole("Almacenista")).toBe("ALMACENISTA");
    expect(normalizeRole("ALMACENISTA")).toBe("ALMACENISTA");
    expect(normalizeRole("  almacenista  ")).toBe("ALMACENISTA");
  });

  it("reconoce los roles escritos en lenguaje natural", () => {
    expect(normalizeRole("administrador")).toBe("ADMIN");
    expect(normalizeRole("coordinador")).toBe("COORDINADOR");
    expect(normalizeRole("despacho")).toBe("DESPACHO");
    expect(normalizeRole("almacen")).toBe("ALMACENISTA");
  });

  it("devuelve null para un rol desconocido", () => {
    expect(normalizeRole("inventado")).toBeNull();
    expect(normalizeRole("")).toBeNull();
  });
});

// ============================================================
// 4. ACCESO A MÓDULOS SEGÚN PERMISOS
// ============================================================

describe("Acceso a módulos", () => {
  it("el superadmin entra siempre", () => {
    expect(canAccessModule("SUPERADMIN", [], "usuarios")).toBe(true);
    expect(canAccessModule("SUPERADMIN", [], "inventario")).toBe(true);
  });

  it("un usuario normal solo entra a los módulos autorizados", () => {
    expect(canAccessModule("ALMACENISTA", ["inventario"], "inventario")).toBe(
      true
    );
    expect(canAccessModule("ALMACENISTA", ["inventario"], "usuarios")).toBe(
      false
    );
  });

  it("la configuración de la cuenta siempre está disponible", () => {
    expect(canAccessModule("ALMACENISTA", [], "configuracion")).toBe(true);
  });
});

// ============================================================
// 5. PERSISTENCIA E INICIO DE SESIÓN (base de datos)
// ============================================================

/** Señal interna que fuerza el rollback de la transacción. */
class RollbackSignal extends Error {
  constructor(public readonly result: unknown) {
    super("rollback");
  }
}

async function enTransaccion<T>(
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      const result = await fn(tx);
      throw new RollbackSignal(result);
    });
  } catch (error) {
    if (error instanceof RollbackSignal) return error.result as T;
    throw error;
  }
}

describeDb("Persistencia de permisos e inicio de sesión", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("crea el usuario con el nombre generado, la clave cifrada y los módulos", async () => {
    const resultado = await enTransaccion(async (tx) => {
      const creado = await createUser(tx, {
        firstName: "Carlos",
        lastName: "Ramírez",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: ["inventario", "salidas_almacen"],
      });

      // La clave se guarda cifrada, nunca en claro.
      expect(creado.username).toBe("carlosramirez");
      expect(creado.email).toBeNull();
      expect(creado.role).toBe("ALMACENISTA");
      expect(creado.status).toBe("ACTIVE");
      expect(creado.modules).toEqual(["inventario", "salidas_almacen"]);

      const guardado = await tx
        .select()
        .from(users)
        .where(eq(users.id, creado.id))
        .limit(1);

      expect(guardado[0].passwordHash).not.toBe("Banco2026!");
      expect(verifyPassword("Banco2026!", guardado[0].passwordHash)).toBe(true);

      // Los módulos quedan en la tabla, no solo en memoria.
      const filas = await tx
        .select()
        .from(userModules)
        .where(eq(userModules.userId, creado.id));

      expect(filas.map((f) => f.moduleKey).sort()).toEqual([
        "inventario",
        "salidas_almacen",
      ]);

      return creado;
    });

    expect(resultado.id).toBeTruthy();
  });

  it("el usuario puede iniciar sesión con su nombre generado", async () => {
    await enTransaccion(async (tx) => {
      await createUser(tx, {
        firstName: "Carlos",
        lastName: "Ramírez",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: ["inventario"],
      });

      // El login busca por nombre de usuario y compara el hash.
      const usuario = await getUserByUsername(tx, "carlosramirez");
      expect(usuario).not.toBeNull();
      expect(verifyPassword("Banco2026!", usuario!.passwordHash)).toBe(true);
      expect(verifyPassword("otraClave1!", usuario!.passwordHash)).toBe(
        false
      );

      return true;
    });
  });

  it("el segundo usuario con el mismo nombre recibe un sufijo numérico", async () => {
    // Los dos usuarios se crean en la MISMA transacción: si no, el rollback
    // del primero dejaría el nombre libre y no habría sufijo que probar.
    const nombres = await enTransaccion(async (tx) => {
      const primero = await createUser(tx, {
        firstName: "Carlos",
        lastName: "Ramírez",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: [],
      });

      const sugerido = await suggestUsername(tx, "Carlos", "Ramírez");

      const segundo = await createUser(tx, {
        firstName: "Carlos",
        lastName: "Ramírez",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: [],
      });

      return { primero: primero.username, sugerido, segundo: segundo.username };
    });

    expect(nombres.primero).toBe("carlosramirez");
    expect(nombres.sugerido).toBe("carlosramirez2");
    expect(nombres.segundo).toBe("carlosramirez2");
  });

  it("reemplaza los permisos sin dejar duplicados", async () => {
    await enTransaccion(async (tx) => {
      const creado = await createUser(tx, {
        firstName: "Laura",
        lastName: "Gómez",
        password: "Banco2026!",
        role: "COORDINADOR",
        modules: ["inventario", "bodegas", "programas"],
      });

      await setUserModules(tx, creado.id, ["inventario"]);

      const filas = await tx
        .select()
        .from(userModules)
        .where(eq(userModules.userId, creado.id));

      expect(filas).toHaveLength(1);
      expect(filas[0].moduleKey).toBe("inventario");
    });
  });

  it("el usuario cambia su nombre de usuario y su contraseña", async () => {
    await enTransaccion(async (tx) => {
      const creado = await createUser(tx, {
        firstName: "Miguel",
        lastName: "Soto",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: ["inventario"],
      });

      const actualizado = await updateOwnProfile(tx, creado.id, {
        username: "miguelsoto2",
        password: "NuevaClave2026!",
      });

      expect(actualizado.username).toBe("miguelsoto2");

      const guardado = await tx
        .select()
        .from(users)
        .where(eq(users.id, creado.id))
        .limit(1);

      expect(verifyPassword("NuevaClave2026!", guardado[0].passwordHash)).toBe(
        true
      );
      expect(verifyPassword("Banco2026!", guardado[0].passwordHash)).toBe(false);
    });
  });

  it("no permite que dos usuarios tengan el mismo nombre de usuario", async () => {
    await enTransaccion(async (tx) => {
      const creado = await createUser(tx, {
        firstName: "Pedro",
        lastName: "Gómez",
        password: "Banco2026!",
        role: "ALMACENISTA",
        modules: [],
      });

      await expect(
        updateOwnProfile(tx, creado.id, { username: "admin" })
      ).rejects.toThrow(/ya está en uso/i);
    });
  });
});
