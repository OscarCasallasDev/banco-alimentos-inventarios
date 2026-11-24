-- ============================================================
-- 0020 — Cédula de usuarios y auditoría de órdenes de pedido
-- ============================================================

-- Cédula: opcional para no romper los usuarios existentes; única cuando
-- está diligenciada (PostgreSQL permite varios NULL en un índice único).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cedula" varchar(20);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_cedula_unique"
  ON "users" ("cedula");

-- Acciones de auditoría de órdenes. Se añaden al enum existente para
-- reutilizar la bitácora persistente `audit_logs`.
ALTER TYPE "audit_log_action" ADD VALUE IF NOT EXISTS 'ORDER_UPDATE';
ALTER TYPE "audit_log_action" ADD VALUE IF NOT EXISTS 'ORDER_DELETE';
