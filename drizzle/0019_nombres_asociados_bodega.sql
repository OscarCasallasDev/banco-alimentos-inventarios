-- ============================================================
-- 0019 — Nombres asociados de las bodegas importadas
-- ============================================================
--
-- Una misma bodega numérica puede aparecer con rótulos distintos en las
-- columnas A y C del reporte de Siigo (por ejemplo "PRINCIPAL" y
-- "CAMPAÑA JUNTOS SOMOS MÁS FUERTES"). Todas esas denominaciones son la
-- MISMA bodega: se identifican por el código numérico (columna B).
--
-- Se añade una columna con los nombres asociados, separados por " · ".
-- NO se crea una bodega por cada descripción textual y no se borra ninguna:
-- el catálogo sigue teniendo como máximo siete bodegas de Siigo (1 a 7).
-- ============================================================

ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "alias_names" text;

COMMENT ON COLUMN "warehouses"."alias_names" IS
  'Otros nombres o descripciones con los que la bodega aparece en el reporte de Siigo (columnas A y C).';
