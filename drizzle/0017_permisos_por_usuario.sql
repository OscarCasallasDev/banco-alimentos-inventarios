-- ============================================================
-- 0017 — Permisos de acceso a módulos por usuario
-- ============================================================
--
-- El superadmin crea los usuarios desde el módulo de usuarios y decide,
-- módulo por módulo, a cuáles tiene acceso cada uno.
--
-- Lo que hace esta migración:
--
--   1. `user_modules`: tabla nueva que guarda los módulos autorizados para
--      CADA usuario. Es la fuente de verdad de la navegación y del acceso a
--      las rutas. Antes el acceso se decidía solo por el ROL, lo que
--      impedía conceder permisos individuales.
--      - Clave primaria compuesta (user_id, module_key): no hay duplicados.
--      - Clave foránea a `users` con ON DELETE CASCADE.
--
--   2. `users.email` pasa a NULLABLE. El formulario de creación solo pide
--      nombre, apellido, contraseña y rol: no se inventan correos.
--      (El índice único se conserva: en PostgreSQL varios NULL no chocan.)
--
--   3. Rol `COORDINADOR`. El superadmin escribe el rol a mano; este rol
--      concreto no existía. `ALTER TYPE ... ADD VALUE` es aditivo: no
--      reescribe ni elimina datos del enum.
--
-- Nada se borra: los usuarios existentes, sus roles y sus permisos quedan
-- intactos. El superadmin actual conserva el acceso completo.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_modules" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "module_key" varchar(64) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_modules_pkey" PRIMARY KEY ("user_id", "module_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_modules_user" ON "user_modules" ("user_id");
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'COORDINADOR';
--> statement-breakpoint
-- El rol coordinador supervisa la operación: ve el inventario y prepara
-- salidas, pero NO administra usuarios ni activa/desactiva módulos (eso es
-- exclusivo del superadmin).
INSERT INTO "roles" ("name", "description", "permissions")
VALUES (
  'COORDINADOR',
  'Coordinador operativo: supervisa inventario, bodegas y preparacion de salidas.',
  ARRAY[
    'inventory.read',
    'salidas.read',
    'salidas.create',
    'salidas.edit',
    'salidas.generate',
    'salidas.view_document',
    'salidas.receive',
    'siigo.import.read',
    'programs.manage'
  ]
)
ON CONFLICT ("name") DO NOTHING;
