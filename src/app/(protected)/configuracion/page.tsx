"use client";

import { useState } from "react";
import {
  Loader2,
  CalendarClock,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";
import ModulosPanel from "@/components/config/ModulosPanel";

/**
 * Configuración del sistema.
 *
 * Se muestran SOLO los apartados que el personal del Banco utiliza:
 *
 *   - Control de vencimientos: días de anticipación de las alertas.
 *   - Módulos del sistema: activar o desactivar módulos (reversible).
 *
 * Los demás apartados técnicos (base de datos, seguridad, apariencia y
 * notificaciones) se retiraron de la INTERFAZ. Su lógica interna, sus
 * tablas y sus servicios se conservan intactos: nada se eliminó del
 * sistema, simplemente el Banco no los necesita en su pantalla de
 * configuración.
 */

interface SystemStatus {
  inventory: {
    expiryAlertDays: number;
    expiryCriticalDays: number;
  };
}

export default function ConfiguracionPage() {
  const { showToast } = useToast();
  const {
    data: status,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">
          Ajustes de alertas y módulos del sistema
        </p>
      </div>

      {isError && <QueryError error={error} onRetry={() => void refetch()} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Módulos */}
        <ModulosPanel />
      </div>
    </div>
  );
}
