"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Search,
  X,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Audit {
  id: string;
  date: string;
  warehouseId: string;
  warehouseName: string | null;
  responsible: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  code: string;
  name: string;
}

interface AuditItem {
  productId: string;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  observation: string;
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  warehouseId: "",
  responsible: "",
  notes: "",
  items: [] as AuditItem[],
};

export default function AuditoriaPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAudits();
    fetchProducts();
    fetchWarehouses();
  }, []);

  async function fetchAudits() {
    try {
      const res = await fetch("/api/auditoria");
      const data = await res.json();
      if (data.success) setAudits(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/productos");
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchWarehouses() {
    try {
      const res = await fetch("/api/bodegas");
      const data = await res.json();
      if (data.success) setWarehouses(data.data);
    } catch (err) {
      console.error(err);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function addItem() {
    setForm({
      ...form,
      items: [
        ...form.items,
        { productId: "", systemQuantity: 0, physicalQuantity: 0, difference: 0, observation: "" },
      ],
    });
  }

  function removeItem(index: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItem(index: number, field: keyof AuditItem, value: string | number) {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    // Recalcular diferencia
    if (field === "systemQuantity" || field === "physicalQuantity") {
      newItems[index].difference = newItems[index].physicalQuantity - newItems[index].systemQuantity;
    }
    setForm({ ...form, items: newItems });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/auditoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error al guardar");
        return;
      }

      setShowModal(false);
      fetchAudits();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const filtered = audits.filter(
    (a) =>
      a.responsible.toLowerCase().includes(search.toLowerCase()) ||
      a.warehouseName?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditoría</h1>
          <p className="text-gray-600 mt-1">Control y conciliación de inventarios</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Nueva Auditoría
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por responsable o bodega..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Fecha</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Bodega</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Responsable</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay auditorías registradas
                  </td>
                </tr>
              ) : (
                filtered.map((audit) => (
                  <tr key={audit.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">
                      {new Date(audit.date).toLocaleDateString("es-CO")}
                    </td>
                    <td className="py-3 px-4 text-gray-900">{audit.warehouseName || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{audit.responsible}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", statusColors[audit.status])}>
                        {audit.status === "PENDING" ? "Pendiente" : audit.status === "IN_PROGRESS" ? "En Progreso" : audit.status === "COMPLETED" ? "Completada" : "Cancelada"}
                      </span>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nueva Auditoría</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bodega *</label>
                  <select
                    value={form.warehouseId}
                    onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable *</label>
                  <input
                    type="text"
                    value={form.responsible}
                    onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Items *</label>
                  <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                    + Agregar item
                  </button>
                </div>

                {form.items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                    Agrega al menos un item
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg">
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-500 mb-1">Producto</label>
                          <select
                            value={item.productId}
                            onChange={(e) => updateItem(index, "productId", e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Seleccionar...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Sistema</label>
                          <input
                            type="number"
                            min="0"
                            value={item.systemQuantity}
                            onChange={(e) => updateItem(index, "systemQuantity", parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Físico</label>
                          <input
                            type="number"
                            min="0"
                            value={item.physicalQuantity}
                            onChange={(e) => updateItem(index, "physicalQuantity", parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Diferencia</label>
                          <div className={cn(
                            "px-2 py-1.5 rounded text-sm text-center font-medium",
                            item.difference > 0 ? "bg-green-100 text-green-800" : item.difference < 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                          )}>
                            {item.difference > 0 ? "+" : ""}{item.difference}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="col-span-12">
                          <input
                            type="text"
                            placeholder="Observación..."
                            value={item.observation}
                            onChange={(e) => updateItem(index, "observation", e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || form.items.length === 0} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar Auditoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
