-- Clasificación del resumen de conciliación entre importaciones.
-- Valores: INCREASE, NO_CHANGE, DECREASE_MATCHED, DECREASE_DISCREPANCY.
ALTER TABLE "siigo_balance_diffs"
  ADD COLUMN IF NOT EXISTS "movement_type" varchar(30) NOT NULL DEFAULT 'NO_CHANGE';

CREATE INDEX IF NOT EXISTS "idx_siigo_diffs_movement"
  ON "siigo_balance_diffs" ("import_run_id", "movement_type");
