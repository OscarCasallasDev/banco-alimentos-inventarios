-- ============================================================
-- MIGRACIÓN 0008: Consecutivos documentales atómicos por año
-- Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Los documentos PED, FAC, REC y DES llevan el año en su número
-- (PED-2026-0001). Su consecutivo se calculaba con MAX()+1 sobre la
-- tabla del documento, lo que puede repetir un número si dos usuarios
-- registran a la vez.
--
-- Esta migración:
--   1. Siembra `document_sequences` con el último consecutivo YA usado de
--      cada tipo y año, para que el contador atómico continúe donde debe.
--   2. Deja el contador listo para los años que aún no existen.
--
-- No modifica ni borra documentos existentes.
-- ============================================================

INSERT INTO "document_sequences" ("type", "last_number")
SELECT
  origen."prefix" || '-' || origen."year" AS type,
  MAX(origen."seq")::int AS last_number
FROM (
  SELECT 'PED' AS "prefix", split_part("number", '-', 2) AS "year",
         (split_part("number", '-', 3))::int AS "seq"
  FROM "orders" WHERE "number" ~ '^PED-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'FAC', split_part("number", '-', 2), (split_part("number", '-', 3))::int
  FROM "invoices" WHERE "number" ~ '^FAC-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'REC', split_part("number", '-', 2), (split_part("number", '-', 3))::int
  FROM "receipts" WHERE "number" ~ '^REC-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT 'DES', split_part("number", '-', 2), (split_part("number", '-', 3))::int
  FROM "dispatches" WHERE "number" ~ '^DES-[0-9]{4}-[0-9]+$'
) origen
GROUP BY origen."prefix", origen."year"
ON CONFLICT ("type") DO UPDATE
  SET "last_number" = GREATEST("document_sequences"."last_number", EXCLUDED."last_number"),
      "updated_at" = now();

-- ============================================================
-- FIN DE LA MIGRACIÓN 0008
-- ============================================================
