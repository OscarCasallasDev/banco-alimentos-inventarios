"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Plus,
  Search,
  X,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Order {
  id: string;
  number: string;
  date: string;
  nit: string | null;
  destination: string | null;
  status: "DRAFT" | "APPROVED" | "INVOICED" | "DISPATCHED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface WarehouseItem {
  id: string;
  code: string;
  name: string;
}

interface OrderItem {
  productId: string;
  warehouseId: string;
  quantity: number;
}

const emptyForm = {
  number: "",
  date: new Date().toISOString().split("T")[0],
  nit: "",
  destination: "",
  notes: "",
  items: [] as OrderItem[],
};

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchWarehouses();
  }, []);

  async function fetchOrders() {
    try {
      const res = await fetch("/api/pedidos");
      const data = await res.json();
      if (data.success) setOrders(data.data);
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
      items: [...form.items, { productId: "", warehouseId: "", quantity: 1 }],
    });
  }

  function removeItem(index: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm({ ...form, items: newItems });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/pedidos", {
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
      fetchOrders();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const filtered = orders.filter(
    (o) =>
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.destination?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    DRAFT: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-blue-100 text-blue-800",
    INVOICED: "bg-purple-100 text-purple-800",
    DISPATCHED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-600 mt-1">Gestión de pedidos de salida</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Nuevo Pedido
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número o destino..."
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
                <th className="text-left py-3 px-4 font-medium text-gray-600">Número</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Fecha</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Destino</th>
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
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay pedidos registrados
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-gray-900">{order.number}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {new Date(order.date).toLocaleDateString("es-CO")}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{order.destination || "—"}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", statusColors[order.status])}>
                        {order.status === "DRAFT" ? "Borrador" : order.status === "APPROVED" ? "Aprobado" : order.status === "INVOICED" ? "Facturado" : order.status === "DISPATCHED" ? "Despachado" : "Cancelado"}
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
              <h2 className="text-lg font-semibold text-gray-900">Nuevo Pedido</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
                  <input
                    type="text"
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
                  <input
                    type="text"
                    value={form.nit}
                    onChange={(e) => setForm({ ...form, nit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
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
                        <div className="col-span-5">
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
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-500 mb-1">Bodega</label>
                          <select
                            value={item.warehouseId}
                            onChange={(e) => updateItem(index, "warehouseId", e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Seleccionar...</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div className="col-span-1">
                          <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                  {saving ? "Guardando..." : "Guardar Pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
