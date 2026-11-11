"use client";

import { useState } from "react";
import { Puzzle, Loader2, Eye, EyeOff } from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiSend } from "@/lib/api/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface ModuleFlag {
  key: string;
  module: string;
  label: string;
  description: string;
  status: "ACTIVO" | "EN_ESPERA";
  roles: string[];
  enabled: boolean;
}

/**
 * Panel de módulos habilitados.
 *
 * Desactivar un módulo NO elimina su ruta, sus tablas ni sus datos: solo
 * deja de mostrarse en la navegación y su API responde "módulo en espera".
 * Reactivar es cuestión de volver a encender la bandera.
 */
export default function ModulosPanel() {
  const { showToast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<{ items: ModuleFlag[] }>(
    "/api/configuracion/modulos"
  );
  const [saving, setSaving] = useState<string | null>(null);

  const items = data?.items ?? [];

  async function alternar(flag: ModuleFlag) {
    setSaving(flag.key);
    try {
      await apiSend("/api/configuracion/modulos", "PUT", {
        key: flag.key,
        enabled: !flag.enabled,
      });
      await refetch();
      showToast(
        "success",
        flag.enabled ? "Módulo en espera" : "Módulo activado",
        `${flag.label} · ${flag.enabled ? "Sus rutas y datos se conservan." : "Ya está disponible en el menú."}`
      );
    } catch (error) {
      showToast(
        "error",
        "No se pudo cambiar el módulo",
        (error as Error).message
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 md:col-span-2">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <Puzzle className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Módulos del sistema</h2>
          <p className="text-sm text-gray-500">
            Activa o deja en espera cada módulo. Los módulos en espera conservan
            sus rutas, sus tablas y sus datos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          Cargando módulos…
        </p>
      ) : (
        <div className="mt-4 divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold rounded-full px-2 py-0.5",
                      item.enabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {item.enabled ? "Habilitado" : "En espera"}
                  </span>
                  {item.status === "EN_ESPERA" && !item.enabled && (
                    <span className="text-[10px] text-gray-400">
                      (conservado para etapas futuras)
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {item.description}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Visible para: {item.roles.join(", ")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => alternar(item)}
                disabled={saving === item.key}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50",
                  item.enabled
                    ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                )}
              >
                {saving === item.key ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : item.enabled ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                {item.enabled ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
