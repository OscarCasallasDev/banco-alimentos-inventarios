"use client";

import { useState } from "react";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  AlertCircle,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/hooks/useApiQuery";
import QueryError from "@/components/ui/QueryError";
import { LotTable, type LotRow } from "@/components/lots/LotComponents";

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  presentation: string | null;
  weight: number;
  unit: string;
  stockUnit: string;
  unitKind: "COUNT" | "MASS" | "VOLUME" | "UNKNOWN";
  netWeightGrams: number | null;
  netVolumeMl: number | null;
  weightIsEstimate: boolean;
  tracksExpiration: boolean;
  categoryId: string | null;
  categoryName: string | null;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
}

const emptyForm: {
  code: string;
  name: string;
  description: string;
  presentation: string;
  weight: string;
  unit: string;
  stockUnit: string;
  unitKind: "COUNT" | "MASS" | "VOLUME" | "UNKNOWN";
  netWeightGrams: string;
  netVolumeMl: string;
  weightIsEstimate: boolean;
  tracksExpiration: boolean;
  categoryId: string;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  minStock: number;
} = {
  code: "",
  name: "",
  description: "",
  presentation: "",
  weight: "",
  unit: "unidad",
  stockUnit: "UND",
  unitKind: "COUNT",
  netWeightGrams: "",
  netVolumeMl: "",
  weightIsEstimate: false,
  tracksExpiration: true,
  categoryId: "",
  status: "ACTIVE",
  minStock: 0,
};

export default function ProductosPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lotesProducto, setLotesProducto] = useState<Product | null>(null);

  // Los datos se piden una vez y quedan en memoria: al volver al módulo
  // la tabla aparece de inmediato, sin pantalla de carga.
  const {
    data: products = [],
    isLoading: loading,
    isError: loadError,
    error: queryError,
    refetch: refetchProducts,
  } = useApiQuery<Product[]>("/api/productos");

  const { data: categories = [] } = useApiQuery<Category[]>("/api/categorias");


  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    // Validar código
    if (!form.code.trim()) {
      errors.code = "El código es obligatorio";
    } else if (!/^[A-Z0-9-]+$/.test(form.code)) {
      errors.code = "El código solo puede contener letras mayúsculas, números y guiones";
    } else if (form.code.length < 3) {
      errors.code = "El código debe tener al menos 3 caracteres";
    }

    // Validar nombre
    if (!form.name.trim()) {
      errors.name = "El nombre es obligatorio";
    } else if (form.name.trim().length < 3) {
      errors.name = "El nombre debe tener al menos 3 caracteres";
    } else if (form.name.trim().length > 100) {
      errors.name = "El nombre no puede exceder 100 caracteres";
    }

    // Validar peso
    if (form.weight && parseFloat(form.weight) < 0) {
      errors.weight = "El peso no puede ser negativo";
    }

    // Validar stock mínimo
    if (form.minStock < 0) {
      errors.minStock = "El stock mínimo no puede ser negativo";
    }

    // Validar unidad
    if (!form.unit.trim()) {
      errors.unit = "La unidad es obligatoria";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setFieldErrors({});
    setShowModal(true);
  }

  function openEdit(product: Product) {
    setForm({
      code: product.code,
      name: product.name,
      description: product.description || "",
      presentation: product.presentation || "",
      weight: product.weight.toString(),
      unit: product.unit,
      stockUnit: product.stockUnit || "UND",
      unitKind: product.unitKind || "COUNT",
      netWeightGrams:
        product.netWeightGrams === null ? "" : product.netWeightGrams.toString(),
      netVolumeMl:
        product.netVolumeMl === null ? "" : product.netVolumeMl.toString(),
      weightIsEstimate: product.weightIsEstimate,
      tracksExpiration: product.tracksExpiration,
      categoryId: product.categoryId || "",
      status: product.status,
      minStock: product.minStock,
    });
    setEditingId(product.id);
    setError("");
    setFieldErrors({});
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validateForm()) {
      showToast("error", "Datos inválidos", "Por favor corrige los campos marcados en rojo");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const url = editingId ? `/api/productos/${editingId}` : "/api/productos";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          weight: parseFloat(form.weight) || 0,
          minStock: Number(form.minStock) || 0,
          categoryId: form.categoryId || null,
          netWeightGrams: form.netWeightGrams.trim()
            ? Number(form.netWeightGrams)
            : null,
          netVolumeMl: form.netVolumeMl.trim()
            ? Number(form.netVolumeMl)
            : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error?.message || "Error al guardar";
        setError(errorMsg);
        showToast("error", "Error al guardar", errorMsg);
        return;
      }

      showToast("success", editingId ? "Producto actualizado" : "Producto creado", `El producto "${form.name}" se guardó correctamente`);
      setShowModal(false);
      refetchProducts();
    } catch {
      setError("Error de conexión. Verifica tu internet e intenta nuevamente.");
      showToast("error", "Error de conexión", "Verifica tu internet e intenta nuevamente");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de desactivar este producto? Su historial se conserva y dejará de admitir movimientos.")) return;

    try {
      const res = await fetch(`/api/productos/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Producto desactivado", "El producto ya no admite movimientos. Su historial se conserva.");
        refetchProducts();
      } else {
        const data = await res.json();
        showToast("error", "Error al desactivar", data.error?.message || "No se pudo desactivar el producto");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Error de conexión", "No se pudo conectar con el servidor");
    }
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-800",
    DISCONTINUED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-600 mt-1">Gestión del catálogo de productos</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Producto
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {loadError && (
        <QueryError error={queryError} onRetry={() => void refetchProducts()} />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Código</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Nombre</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Categoría</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Unidad stock</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Peso unitario</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Vencimiento</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Stock Mín.</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay productos registrados
                  </td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-gray-900">{product.code}</td>
                    <td className="py-3 px-4 text-gray-900">
                      {product.name}
                      {product.presentation && (
                        <span className="block text-xs text-gray-500">
                          {product.presentation}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{product.categoryName || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {product.stockUnit}
                      <span className="block text-xs text-gray-400">
                        {product.unitKind}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {product.netWeightGrams === null ? (
                        <span className="text-xs text-gray-400">sin dato</span>
                      ) : (
                        <>
                          {product.netWeightGrams} g
                          {product.weightIsEstimate && (
                            <span className="block text-xs text-amber-600">
                              estimado
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {product.tracksExpiration ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          por lote
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">no aplica</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{product.minStock}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", statusColors[product.status])}>
                        {product.status === "ACTIVE" ? "Activo" : product.status === "INACTIVE" ? "Inactivo" : "Descontinuado"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setLotesProducto(product)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver lotes"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(product)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? "Editar Producto" : "Nuevo Producto"}
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
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                      fieldErrors.code ? "border-red-500 bg-red-50" : "border-gray-300"
                    )}
                    placeholder="Ej: GRN-001"
                    required
                  />
                  {fieldErrors.code && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.code}</p>
                  )}
                  {!fieldErrors.code && (
                    <p className="mt-1 text-xs text-gray-500">
                      Letras mayúsculas, números y guiones. Ej: GRN-001
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                      fieldErrors.name ? "border-red-500 bg-red-50" : "border-gray-300"
                    )}
                    placeholder="Ej: Arroz"
                    required
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  rows={2}
                  placeholder="Descripción del producto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Presentación</label>
                  <input
                    type="text"
                    value={form.presentation}
                    onChange={(e) => setForm({ ...form, presentation: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Ej: Bolsa 500g"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                      fieldErrors.weight ? "border-red-500 bg-red-50" : "border-gray-300"
                    )}
                    placeholder="0.00"
                  />
                  {fieldErrors.weight && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.weight}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Peso de la presentación (uso administrativo)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                      fieldErrors.unit ? "border-red-500 bg-red-50" : "border-gray-300"
                    )}
                    placeholder="Ej: kg, L, unidad"
                    required
                  />
                  {fieldErrors.unit && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.unit}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Mín.</label>
                  <input
                    type="number"
                    min="0"
                    value={form.minStock}
                    onChange={(e) => setForm({ ...form, minStock: parseInt(e.target.value) || 0 })}
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                      fieldErrors.minStock ? "border-red-500 bg-red-50" : "border-gray-300"
                    )}
                    placeholder="0"
                  />
                  {fieldErrors.minStock && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.minStock}</p>
                  )}
                  {!fieldErrors.minStock && (
                    <p className="mt-1 text-xs text-gray-500">
                      Alerta cuando el stock sea menor a este valor
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad de stock <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.stockUnit}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stockUnit: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Ej: BOLSA, CAJA, KG"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Unidad física en la que se cuenta el stock
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Naturaleza de la unidad
                  </label>
                  <select
                    value={form.unitKind}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unitKind: e.target.value as
                          | "COUNT"
                          | "MASS"
                          | "VOLUME"
                          | "UNKNOWN",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="COUNT">Conteo (UND, BOLSA, CAJA…)</option>
                    <option value="MASS">Masa (KG, LB, G)</option>
                    <option value="VOLUME">Volumen (L, ML)</option>
                    <option value="UNKNOWN">Desconocida</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Evita sumar unidades incompatibles
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Peso neto por unidad (g)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.netWeightGrams}
                    onChange={(e) =>
                      setForm({ ...form, netWeightGrams: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Ej: 500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Convierte unidades en kilos: 300 × 500 g = 150 kg
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Volumen neto por unidad (ml)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.netVolumeMl}
                    onChange={(e) =>
                      setForm({ ...form, netVolumeMl: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Ej: 1500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Déjalo vacío si el producto no informa volumen
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.tracksExpiration}
                    onChange={(e) =>
                      setForm({ ...form, tracksExpiration: e.target.checked })
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Controlar vencimiento por lote
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.weightIsEstimate}
                    onChange={(e) =>
                      setForm({ ...form, weightIsEstimate: e.target.checked })
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  El peso informado es una estimación
                </label>
                <p className="text-xs text-gray-500">
                  Si el producto controla vencimiento, cada ingreso debe
                  informar la fecha o declarar que se desconoce. Nunca se
                  inventa una fecha.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "INACTIVE" | "DISCONTINUED" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                  <option value="DISCONTINUED">Descontinuado</option>
                </select>
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

      {/* Lotes del producto */}
      {lotesProducto && (
        <ModalLotesProducto
          producto={lotesProducto}
          onClose={() => setLotesProducto(null)}
        />
      )}
    </div>
  );
}

/**
 * Lotes de un producto: cada fila es un ingreso independiente con su
 * cantidad, su peso y su fecha de vencimiento.
 */
function ModalLotesProducto({
  producto,
  onClose,
}: {
  producto: Product;
  onClose: () => void;
}) {
  const { data, isLoading } = useApiQuery<{
    items: LotRow[];
    summary: {
      lots: number;
      activeLots: number;
      totalReceived: number;
      totalAvailable: number;
      weightReceivedKg: number;
      weightAvailableKg: number;
      earliestExpiration: string | null;
      lotsWithoutWeight: number;
    };
  }>(`/api/productos/${producto.id}/lotes?includeEmpty=true`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Lotes de {producto.name}
            </h2>
            <p className="text-sm text-gray-500">
              {producto.code} · {producto.stockUnit}
              {producto.netWeightGrams
                ? ` · ${producto.netWeightGrams} g por unidad`
                : " · sin peso unitario informado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Cargando lotes…</p>
          ) : (
            <>
              {data && data.summary.lots > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Lotes</p>
                    <p className="text-lg font-bold text-gray-900">
                      {data.summary.lots}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Unidades disponibles</p>
                    <p className="text-lg font-bold text-gray-900">
                      {data.summary.totalAvailable}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Peso disponible</p>
                    <p className="text-lg font-bold text-gray-900">
                      {data.summary.weightAvailableKg} kg
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">
                      Vencimiento más próximo
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {data.summary.earliestExpiration ?? "—"}
                    </p>
                  </div>
                </div>
              )}

              {data && data.summary.lotsWithoutWeight > 0 && (
                <p className="text-xs text-amber-700">
                  {data.summary.lotsWithoutWeight} lote(s) sin contenido neto
                  informado: su peso no se calcula.
                </p>
              )}

              <LotTable
                lots={data?.items ?? []}
                showProduct={false}
                emptyMessage="Este producto todavía no tiene lotes registrados"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
