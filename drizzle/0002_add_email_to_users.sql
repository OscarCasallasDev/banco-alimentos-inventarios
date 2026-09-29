-- Migración: Agregar campo email a la tabla users
-- Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);

-- Crear índice único para email
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");

-- Actualizar usuarios existentes con email basado en username
UPDATE "users" SET "email" = username || '@bancoalimentos.org' WHERE "email" IS NULL;

-- Hacer email NOT NULL después de actualizar
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
