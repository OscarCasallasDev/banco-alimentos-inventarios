"use client";

import { useState } from "react";
import {
  Loader2,
  CalendarClock,
  UserCog,
  KeyRound,
  Check,
  AlertCircle,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";
import ModulosPanel from "@/components/config/ModulosPanel";
import { passwordRuleFailures, checkPasswordConfirmation } from "@/lib/auth/password-policy";

/**
 * Configuración del sistema.
 *
 * Se muestran SOLO los apartados que el personal del Banco utiliza:
 *
 *   - Mi cuenta: todo usuario puede ver y cambiar su nombre de usuario y su
 *     contraseña.
 *   - Control de vencimientos: días de anticipación de las alertas.
 *   - Módulos del sistema: activar o desactivar módulos (reversible).
 *
 * Los dos últimos apartados son exclusivos del superadministrador: un
 * usuario normal no administra usuarios, ni roles, ni permisos, ni banderas.
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

interface MiCuenta {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  modules: string[];
}

export default function ConfiguracionPage() {
  const { showToast } = useToast();

  const { data: me, isLoading: loadingMe } = useApiQuery<MiCuenta>(
    "/api/usuarios/me"
  );

  const isSuperAdmin = me?.role === "SUPERADMIN";

  const {
    data: status,
    isError,
    error,
    refetch,
  } = useApiQuery<SystemStatus>("/api/configuracion", {
    enabled: isSuperAdmin,
  });

  const [edit, setEdit] = useState<{
    alertDays: number;
    criticalDays: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Cuenta propia.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");

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

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSavingAccount(true);
    setAccountError("");

    const body: { username?: string; password?: string } = {};
    if (username.trim() && username.trim() !== me?.username) {
      body.username = username.trim();
    }

    if (password || confirmPassword) {
      const check = checkPasswordConfirmation(password, confirmPassword);
      if (!check.valid) {
        setAccountError(check.message ?? "Revise la contraseña");
        setSavingAccount(false);
        return;
      }

      body.password = password;
    }

    if (Object.keys(body).length === 0) {
      setAccountError("No hay ningún cambio que guardar.");
      setSavingAccount(false);
      return;
    }

    try {
      const res = await fetch("/api/usuarios/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setAccountError(data.error?.message || "No se pudo guardar");
        return;
      }

      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
      showToast(
        "success",
        "Cuenta actualizada",
        body.password
          ? "Su contraseña fue cambiada."
          : `Su nombre de usuario ahora es ${data.data?.username}.`
      );
    } catch {
      setAccountError("Error de conexión");
    } finally {
      setSavingAccount(false);
    }
  }

  const passwordFailures = passwordRuleFailures(password);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">
          {isSuperAdmin
            ? "Ajustes de alertas, módulos y su propia cuenta"
            : "Datos de su cuenta"}
        </p>
      </div>

      {/* ---------- Mi cuenta (todos los usuarios) ---------- */}
      <form
        onSubmit={handleSaveAccount}
        className="bg-white rounded-xl border border-gray-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <UserCog className="w-5 h-5 text-primary-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Mi cuenta</h2>
            <p className="text-sm text-gray-500">
              Su nombre de usuario y su contraseña
            </p>
          </div>
        </div>

        {accountError && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {accountError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={loadingMe ? "..." : (me?.username ?? "")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Con este nombre inicia sesión. No puede repetirse.
            </p>
          </div>

          {/* Cambio de contraseña: se revela al seleccionarlo. */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={changingPassword}
                onChange={(e) => {
                  setChangingPassword(e.target.checked);
                  if (!e.target.checked) {
                    setPassword("");
                    setConfirmPassword("");
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Cambiar contraseña
            </label>

            {changingPassword && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres, una letra, un número y un símbolo"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  {passwordFailures.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {passwordFailures.map((failure) => (
                        <li
                          key={failure}
                          className="text-xs text-red-600 flex items-center gap-1"
                        >
                          <AlertCircle className="w-3 h-3" />
                          {failure}
                        </li>
                      ))}
                    </ul>
                  )}
                  {password && passwordFailures.length === 0 && (
                    <p className="mt-1.5 text-xs text-green-700 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Cumple la política de seguridad.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la nueva contraseña"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Las contraseñas no coinciden.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={savingAccount}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {savingAccount ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Guardar mi cuenta
          </button>
        </div>
      </form>

      {/* ---------- Apartados administrativos (solo superadmin) ---------- */}
      {isSuperAdmin && (
        <>
          {isError && (
            <QueryError error={error} onRetry={() => void refetch()} />
          )}

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
        </>
      )}
    </div>
  );
}
