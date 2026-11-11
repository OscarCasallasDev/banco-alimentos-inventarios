/**
 * Catálogo de programas / destinos.
 *
 * El Banco administra la lista: no hay opciones rígidas en el código.
 * Desactivar un programa NO lo borra: las salidas históricas lo referencian.
 */

"use client";

import { useState } from "react";
import { Target, Plus, Pencil, Ban, Check, X, Loader2 } from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Program {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresReceiver: boolean;
  status: string;
  sortOrder: number;
  exitCount: number;
}

export default function ProgramasPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{ items: Program[] }>(
    "/api/programas?all=true"
  );
  const [editing, setEditing] = useState<Program | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    requiresReceiver: true,
    status: "ACTIVE",
    sortOrder: 0,
  });

  const items = data?.items ?? [];

  function abrirNuevo() {
    setForm({
      code: "",
      name: "",
      description: "",
      requiresReceiver: true,
      status: "ACTIVE",
      sortOrder: items.length * 10,
    });
    setEditing(null);
    setCreating(true);
    setFormError(null);
  }

  function abrirEdicion(program: Program) {
    setForm({
      code: program.code,
      name: program.name,
      description: program.description ?? "",
      requiresReceiver: program.requiresReceiver,
      status: program.status,
      sortOrder: program.sortOrder,
    });
    setEditing(program);
    setCreating(false);
    setFormError(null);
  }

  async function guardar() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiSend(`/api/programas/${editing.id}`, "PUT", {
          code: form.code,
          name: form.name,
          description: form.description.trim() || null,
          requiresReceiver: form.requiresReceiver,
          status: form.status,
          sortOrder: form.sortOrder,
        });
      } else {
        await apiSend("/api/programas", "POST", {
          code: form.code,
          name: form.name,
          description: form.description.trim() || null,
          requiresReceiver: form.requiresReceiver,
          status: form.status,
          sortOrder: form.sortOrder,
        });
      }
      setCreating(false);
      setEditing(null);
      await refetch();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function desactivar(program: Program) {
    try {
      await apiSend(`/api/programas/${program.id}`, "DELETE");
      await refetch();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="w-7 h-7 text-primary-600" />
            Programas y destinos
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Catálogo configurable de destinos para las salidas de almacén.
          </p>
        </div>
        {!creating && !editing && (
          <button
            type="button"
            onClick={abrirNuevo}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Nuevo programa
          </button>
        )}
      </div>

      {formError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      {(creating || editing) && (
        <section className="bg-white rounded-xl border border-primary-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            {editing ? `Editar ${editing.name}` : "Nuevo programa"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Código *</span>
              <input
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((f) => ({ ...f, code: event.target.value }))
                }
                placeholder="GF"
                className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="text-xs font-medium text-gray-700">Nombre *</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((f) => ({ ...f, name: event.target.value }))
                }
                placeholder="Grupos de Familia"
                className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Orden</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((f) => ({ ...f, sortOrder: Number(event.target.value) }))
                }
                className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-medium text-gray-700">
                Descripción
              </span>
              <input
                type="text"
                value={form.description}
                onChange={(event) =>
                  setForm((f) => ({ ...f, description: event.target.value }))
                }
                className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </label>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.requiresReceiver}
                  onChange={(event) =>
                    setForm((f) => ({
                      ...f,
                      requiresReceiver: event.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-gray-300"
                />
                Exige receptor
              </label>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">
            No se pudo cargar el catálogo: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Cargando programas…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            No hay programas configurados.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((program) => (
              <div
                key={program.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 rounded px-2 py-0.5">
                      {program.code}
                    </span>
                    <span className="font-medium text-gray-900">
                      {program.name}
                    </span>
                    {program.status === "INACTIVE" && (
                      <span className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                        Inactivo
                      </span>
                    )}
                    {program.requiresReceiver && (
                      <span className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                        Exige receptor
                      </span>
                    )}
                  </div>
                  {program.description && (
                    <p className="text-xs text-gray-500 mt-1">
                      {program.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {program.exitCount} salida{program.exitCount === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(program)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <Pencil className="w-4 h-4" /> Editar
                  </button>
                  {program.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => desactivar(program)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      <Ban className="w-4 h-4" /> Desactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p
        className={cn(
          "text-xs text-gray-500 bg-white rounded-lg border border-gray-200 p-3"
        )}
      >
        Desactivar un programa no lo borra: las salidas ya generadas conservan
        su destino y se pueden reimprimir.
      </p>
    </div>
  );
}
