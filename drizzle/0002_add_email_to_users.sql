-- ============================================================
-- MIGRACIÓN 0002: Campo de correo electrónico en `users`
-- Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
-- ============================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);

-- Índice único de correo (coincide con `uniqueIndex` del schema Drizzle).
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");

-- Correo por defecto para los usuarios existentes.
UPDATE "users" SET "email" = username || '@bancoalimentos.org' WHERE "email" IS NULL;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
