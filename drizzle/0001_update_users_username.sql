-- ============================================================
-- MIGRACIÓN 0001: Actualizar tabla users para usar username
-- en lugar de email
-- ============================================================

-- Agregar columna username
ALTER TABLE "users" ADD COLUMN "username" varchar(100);

-- Copiar datos de email a username (usando el parte antes del @)
UPDATE "users" SET "username" = SPLIT_PART(email, '@', 1);

-- Hacer username NOT NULL y UNIQUE
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");

-- Crear índice
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");

-- Eliminar columna email (opcional, después de verificar)
-- ALTER TABLE "users" DROP COLUMN "email";
-- DROP INDEX IF EXISTS "idx_users_email";

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
