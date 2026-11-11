"use client";

import { useState } from "react";
import {
  Database,
  Shield,
  Bell,
  Palette,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  CalendarClock,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";
import ModulosPanel from "@/components/config/ModulosPanel";

interface SystemStatus {
  database: {
    connected: boolean;
    latencyMs: number | null;
    host: string | null;
    error: string | null;
  };
  catalog: {
    products: number;
  };
  inventory: {
    expiryAlertDays: number;
    expiryCriticalDays: number;
  };
  security: {
    passwordHash: string;
    session: string;
    rowLevelSecurity: string;
  };
}

export default function ConfiguracionPage() {
  const { showToast } = useToast();
  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
  } = useApiQuery<SystemStatus>("/api/configuracion");

  const [edit, setEdit] = useState<{
    alertDays: number;
    criticalDays: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // El valor por defecto viene del servidor; el formulario solo guarda lo
  // que el usuario edita (evita resincronizar el estado en un efecto).
  const alertDays =
    edit?.alertDays ?? status?.inventory.expiryAlertDays ?? 30;
  const criticalDays =
    edit?.criticalDays ?? status?.inventory.expiryCriticalDays ?? 7;

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/configuracion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertDays, criticalDays }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(
          "error",
          "No se pudo guardar",
          data.error?.message || "Verifica los valores e intenta de nuevo."
        );
        return;
      }

      showToast(
        "success",
        "Parámetros guardados",
        `Alertas de vencimiento: ${alertDays} días (crítico: ${criticalDays}).`
      );
      void refetch();
    } catch {
      showToast("error", "Error de conexión", "No se pudo conectar con el servidor");
    } finally {
      setSaving(false);
    }
  }

  const connected = status?.database.connected ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">
          Estado técnico y parámetros generales del sistema
        </p>
      </div>

      {isError && <QueryError error={error} onRetry={() => void refetch()} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Base de datos */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Base de Datos</h2>
              <p className="text-sm text-gray-500">Conexión a Supabase</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Motor</span>
              <span className="text-gray-900 text-right">
                Supabase PostgreSQL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Estado</span>
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  connected
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {connected ? "Conectado" : "Sin conexión"}
              </span>
            </div>
            {status?.database.latencyMs !== null && status?.database.latencyMs !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">Latencia</span>
                <span className="text-gray-900">{status.database.latencyMs} ms</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Productos en catálogo</span>
              <span className="text-gray-900">{status?.catalog.products ?? 0}</span>
            </div>
            {!connected && status?.database.error && (
              <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{status.database.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Control de vencimientos */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                Control de vencimientos
              </h2>
              <p className="text-sm text-gray-500">
                Horizonte de las alertas de próximos vencimientos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Días de alerta
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={alertDays}
                onChange={(e) =>
                  setEdit({
                    alertDays: Number(e.target.value),
                    criticalDays,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lotes que vencen dentro de este rango generan alerta.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Días críticos
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={criticalDays}
                onChange={(e) =>
                  setEdit({
                    alertDays,
                    criticalDays: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="mt-1 text-xs text-gray-500">
                A partir de aquí el vencimiento se marca como crítico.
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar parámetros
            </button>
          </div>
        </form>

        {/* Seguridad */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Seguridad</h2>
              <p className="text-sm text-gray-500">Políticas de seguridad</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Hash de contraseñas</span>
              <span className="text-gray-900">
                {status?.security.passwordHash ?? (isLoading ? "Verificando..." : "—")}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Sesión</span>
              <span className="text-gray-900 text-right">
                {status?.security.session ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Acceso a datos</span>
              <span className="text-gray-900 text-right">
                {status?.security.rowLevelSecurity ?? "—"}
              </span>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                La autenticación actual usa cookie firmada y hash SHA-256.
                Migrar a un hash con sal (Argon2/bcrypt) y activar RLS en
                Supabase sigue pendiente.
              </span>
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Notificaciones</h2>
              <p className="text-sm text-gray-500">Alertas del sistema</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Stock bajo</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Visible en pantalla
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Auditorías</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Visible en pantalla
              </span>
            </div>
            <p className="pt-1 text-xs text-gray-400">
              El envío automático de correos o alertas push aún no está
              implementado. Por ahora las alertas se consultan en Inventario y
              Reportes.
            </p>
          </div>
        </div>

        {/* Apariencia */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-accent-100 rounded-lg flex items-center justify-center">
              <Palette className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Apariencia</h2>
              <p className="text-sm text-gray-500">Colores y tema</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Color primario</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary-600" />
                <span className="font-mono text-xs text-gray-900">#48151C</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Color acento</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-accent-300" />
                <span className="font-mono text-xs text-gray-900">#D5C58A</span>
              </div>
            </div>
          </div>
        </div>

        {/* Módulos */}
        <ModulosPanel />
      </div>
    </div>
  );
}
