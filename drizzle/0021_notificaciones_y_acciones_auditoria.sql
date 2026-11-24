-- ============================================================
-- 0021 — Notificaciones y eventos de auditoría
-- ============================================================

ALTER TYPE "audit_log_action" ADD VALUE IF NOT EXISTS 'ORDER_RECEIVE';
ALTER TYPE "audit_log_action" ADD VALUE IF NOT EXISTS 'CONFIG_UPDATE';
ALTER TYPE "audit_log_action" ADD VALUE IF NOT EXISTS 'MODULE_TOGGLE';

CREATE TABLE IF NOT EXISTS "notification_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "audit_log_id" uuid NOT NULL REFERENCES "audit_logs"("id") ON DELETE CASCADE,
  "read_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_unique"
  ON "notification_reads" ("user_id", "audit_log_id");

CREATE INDEX IF NOT EXISTS "idx_notification_reads_user"
  ON "notification_reads" ("user_id");
