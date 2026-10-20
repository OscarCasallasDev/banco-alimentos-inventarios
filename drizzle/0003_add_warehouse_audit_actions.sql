-- ============================================================
-- MIGRACIÓN 0003: Acciones de auditoría para bodegas
-- Sistema de Gestión de Inventarios
-- Banco Arquidiocesano de Alimentos de Ibagué
--
-- Separa las acciones de bodegas de las de productos en la bitácora.
-- ============================================================

ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'WAREHOUSE_CREATE';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'WAREHOUSE_UPDATE';
ALTER TYPE "public"."audit_log_action" ADD VALUE IF NOT EXISTS 'WAREHOUSE_DEACTIVATE';

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
