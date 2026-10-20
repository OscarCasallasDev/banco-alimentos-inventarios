-- ============================================================
-- MIGRACIÓN 0001: Usuario de acceso por `username`
-- Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- NOTA: esta migración queda como no-op porque la migración base
-- (0000_wet_nighthawk.sql) ya crea la columna `username` con su
-- restricción de unicidad. Se conserva el archivo para no alterar el
-- historial del journal de Drizzle.
-- ============================================================

-- Verificación (no modifica nada):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    RAISE EXCEPTION 'La columna users.username no existe: revise la migración 0000';
  END IF;
END $$;

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
