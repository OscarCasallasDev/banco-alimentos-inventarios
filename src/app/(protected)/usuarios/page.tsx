"use client";

import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { passwordRuleFailures } from "@/lib/auth/password-policy";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useState } from "react";

interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  cedula: string | null;
  role: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  lastLoginAt: string | null;
  createdAt: string;
  /** Módulos a los que tiene acceso. */
  modules: string[];
}

/** Módulo disponible para asignar (viene de las banderas del sistema). */
interface ModuleItem {
  module: string;
  label: string;
  description: string;
  enabled: boolean;
}

const roleLabels: Record<string, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ALMACENISTA: "Almacenista",
  RECEPCION: "Recepción",
  DESPACHO: "Despacho",
  CONTABILIDAD: "Contabilidad",
};

/** Roles disponibles en el formulario, con su valor interno real. */
const ROLE_OPTIONS = [
  { value: "RECEPCION", label: "Recepcionista" },
  { value: "DESPACHO", label: "Despacho" },
  { value: "ALMACENISTA", label: "Almacenista" },
  { value: "COORDINADOR", label: "Coordinador" },
  { value: "SUPERADMIN", label: "Superadmin" },
] as const;

const emptyForm = {
  firstName: "",
  lastName: "",
  cedula: "",
  password: "",
  role: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE" | "SUSPENDED",
  modules: [] as string[],
};

export default function UsuariosPage() {
  const { showToast } = useToast();

  const {
    data: users = [],
    isLoading,
    isError: loadError,
    error: queryError,
    refetch: refetchUsers,
  } = useApiQuery<User[]>("/api/usuarios");

  // Módulos disponibles: los que están activos en el sistema.
  const { data: moduleData } = useApiQuery<{ items: ModuleItem[] }>(
    "/api/configuracion/modulos"
  );
  const availableModules = (moduleData?.items ?? []).filter(
    (item) => item.enabled
  );

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [suggested, setSuggested] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setSuggested("");
    setError("");
    setShowModal(true);
  }

  function openEdit(user: User) {
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      cedula: user.cedula ?? "",
      password: "",
      role: user.role,
      status: user.status,
      modules: user.modules ?? [],
    });
    setEditingId(user.id);
    setSuggested(user.username);
    setError("");
    setShowModal(true);
  }

  // Nombre de usuario propuesto: se consulta al backend para descartar
  // duplicados. Es solo una sugerencia: el que vale es el que asigne el
  // backend al crear la cuenta.
  useEffect(() => {
    if (editingId) return;

    const first = form.firstName.trim();
    const last = form.lastName.trim();

    const timer = setTimeout(async () => {
      if (!first || !last) {
        setSuggested("");
        return;
      }

      try {
        const res = await fetch(
          `/api/usuarios/username?firstName=${encodeURIComponent(
            first
          )}&lastName=${encodeURIComponent(last)}`
        );
        const data = await res.json();
        if (res.ok) setSuggested(data?.data?.username ?? "");
      } catch {
        setSuggested("");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [form.firstName, form.lastName, editingId]);

  function toggleModule(moduleKey: string) {
    setForm((current) => ({
      ...current,
      modules: current.modules.includes(moduleKey)
        ? current.modules.filter((key) => key !== moduleKey)
        : [...current.modules, moduleKey],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // La contraseña se valida en el cliente para dar el aviso al instante.
    if (!editingId) {
      const failures = passwordRuleFailures(form.password);
      if (failures.length > 0) {
        setError(`La contraseña debe cumplir: ${failures.join(", ")}.`);
        setSaving(false);
        return;
      }
    }

    try {
      const url = editingId ? `/api/usuarios/${editingId}` : "/api/usuarios";
      const method = editingId ? "PUT" : "POST";

      const body = editingId
        ? {
            firstName: form.firstName,
            lastName: form.lastName,
            ...(form.cedula.trim() ? { cedula: form.cedula.trim() } : {}),
            role: form.role,
            status: form.status,
            modules: form.modules,
          }
        : {
            firstName: form.firstName,
            lastName: form.lastName,
            cedula: form.cedula.trim(),
            password: form.password,
            role: form.role,
            modules: form.modules,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error al guardar");
        return;
      }

      showToast(
        "success",
        editingId ? "Usuario actualizado" : "Usuario creado",
        editingId
          ? `Los permisos de ${data.data?.username} se guardaron.`
          : `El usuario ${data.data?.username} ya puede iniciar sesión.`
      );

      setShowModal(false);
      refetchUsers();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "¿Desactivar este usuario? Su historial se conserva y no podrá iniciar sesión."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast(
          "error",
          "No se pudo desactivar",
          data?.error?.message || "Intenta de nuevo."
        );
        return;
      }

      showToast(
        "success",
        "Usuario desactivado",
        "El historial se conserva."
      );
      refetchUsers();
    } catch {
      showToast(
        "error",
        "Error de conexión",
        "No se pudo conectar con el servidor."
      );
    }
  }

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.firstName.toLowerCase().includes(search.toLowerCase()) ||
      u.lastName.toLowerCase().includes(search.toLowerCase()) ||
      (u.cedula ?? "").includes(search)
  );

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-800",
    SUSPENDED: "bg-red-100 text-red-800",
  };

  const labelByModule = new Map(
    availableModules.map((item) => [item.module, item.label])
  );

  const passwordFailures = passwordRuleFailures(form.password);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-600 mt-1">
            Gestión de usuarios y permisos de acceso del sistema
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Crear nuevo usuario
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por usuario o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {loadError && (
        <QueryError error={queryError} onRetry={() => void refetchUsers()} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Usuario</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Nombre</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Cédula</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Rol</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Módulos</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4 font-mono text-gray-900">
                      {user.username}
                    </td>
                    <td className="py-3 px-4 text-gray-900">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-700">
                      {user.cedula ?? "Sin cédula"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                        {roleLabels[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {user.role === "SUPERADMIN" ? (
                          <span className="text-xs text-gray-500">
                            Acceso completo
                          </span>
                        ) : user.modules.length === 0 ? (
                          <span className="text-xs text-gray-400">Ninguno</span>
                        ) : (
                          user.modules.map((key) => (
                            <span
                              key={key}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              {labelByModule.get(key) ?? key}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          statusColors[user.status]
                        )}
                      >
                        {user.status === "ACTIVE"
                          ? "Activo"
                          : user.status === "INACTIVE"
                            ? "Inactivo"
                            : "Suspendido"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Desactivar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? "Editar Usuario" : "Crear nuevo usuario"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula {editingId ? "" : "*"}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.cedula}
                  onChange={(e) =>
                    setForm({ ...form, cedula: e.target.value.replace(/\D/g, "") })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Número de cédula, sin puntos"
                  maxLength={20}
                  required={!editingId}
                />
                {editingId && !form.cedula && (
                  <p className="mt-1 text-xs text-amber-700">
                    Complete la cédula para que el usuario pueda crear órdenes.
                  </p>
                )}
              </div>

              {/* El nombre de usuario se arma solo con nombre y apellido. */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-600">
                  Nombre de usuario generado
                </p>
                <p className="font-mono text-sm text-gray-900 mt-0.5">
                  {editingId
                    ? suggested
                    : suggested || "Escriba el nombre y el apellido"}
                </p>
                {!editingId && suggested && (
                  <p className="text-xs text-gray-500 mt-1">
                    Es el nombre con el que el usuario inicia sesión.
                  </p>
                )}
              </div>

              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                    autoComplete="new-password"
                  />
                  {passwordFailures.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
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
                  {form.password && passwordFailures.length === 0 && (
                    <p className="mt-2 text-xs text-green-700 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      La contraseña cumple la política de seguridad.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Seleccione un rol</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Seleccione el rol que tendrá el usuario. Los permisos se
                  asignan automáticamente según ese rol.
                </p>
              </div>

              {editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as
                          | "ACTIVE"
                          | "INACTIVE"
                          | "SUSPENDED",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                    <option value="SUSPENDED">Suspendido</option>
                  </select>
                </div>
              )}

              {/* Permisos de acceso a módulos. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Permisos de acceso a módulos
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {availableModules.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">
                      No hay módulos activos en el sistema.
                    </p>
                  ) : (
                    availableModules.map((item) => (
                      <label
                        key={item.module}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.modules.includes(item.module)}
                          onChange={() => toggleModule(item.module)}
                          className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span>
                          <span className="block text-sm text-gray-900">
                            {item.label}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {item.description}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  El usuario solo podrá ver y usar los módulos marcados. La
                  configuración de su cuenta siempre está disponible.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
