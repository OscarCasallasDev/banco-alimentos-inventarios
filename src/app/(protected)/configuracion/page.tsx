"use client";

import { Settings, Database, Shield, Bell, Palette } from "lucide-react";

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">Ajustes generales del sistema</p>
      </div>

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
            <div className="flex justify-between">
              <span className="text-gray-500">URL</span>
              <span className="font-mono text-gray-900">hszylkcojdjnbjatuhnv.supabase.co</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Estado</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Conectado
              </span>
            </div>
          </div>
        </div>

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
            <div className="flex justify-between">
              <span className="text-gray-500">Hash de contraseñas</span>
              <span className="text-gray-900">SHA-256</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">RLS</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Habilitado
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
            <div className="flex justify-between">
              <span className="text-gray-500">Stock bajo</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Activado
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Auditorías</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Activado
              </span>
            </div>
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
      </div>
    </div>
  );
}
