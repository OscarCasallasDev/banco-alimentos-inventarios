"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  Plus,
  Search,
  X,
  AlertCircle,
  Trash2,
  Printer,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ENTRY_TYPE_LIST, getEntryType } from "@/lib/entries/entry-types";

/* ------------------------------------------------------------------ */
/*  Tipos del formulario                                               */
/* ------------------------------------------------------------------ */

interface ProductOption {
  id: string;
  code: string;
  name: string;
  presentation: string | null;
  unit: string;
  categoryName: string | null;
}

interface ThirdPartyOption {
  id: string;
  nit: string;
  branch: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  city: string | null;
}

interface UnitOption {
  id: string;
  code: string;
  name: string;
}

interface CostCenterOption {
  id: string;
  code: string;
  name: string;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LotForm {
  key: string;
  code: string;
  description: string;
  expirationDate: string;
  quantity: string;
}

interface ItemForm {
  key: string;
  productId: string;
  productCode: string;
  productName: string;
  presentation: string;
  description: string;
  unit: string;
  quantity: string;
  value: string;
  debitCredit: string;
  warehouseId: string;
  location: string;
  costCenterId: string;
  lots: LotForm[];
  openLots: boolean;
}

interface EntryForm {
  format: string;
  number: string;
  date: string;
  thirdPartyId: string;
  nit: string;
  origin: string;
  costCenterId: string;
  purchaseOrder: string;
  sellerNumber: string;
  notes: string;
  items: ItemForm[];
}

interface EntryRow {
  id: string;
  format: string;
  number: string;
  date: string;
  status: string;
  origin: string | null;
  thirdPartyName: string | null;
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const newKey = () => Math.random().toString(36).slice(2, 10);

/** Normaliza a mayúsculas los campos de texto libre. */
const upper = (value: string) => value.toUpperCase();

/** Compone la descripción del producto como se imprime. */
function composeDescription(
  name: string,
  presentation: string | null,
  isCd: boolean,
  cdNumber: string
): string {
  const parts: string[] = [];

  if (isCd && cdNumber.trim()) {
    parts.push(`CD ${cdNumber.trim()}`);
  }

  parts.push(name.trim());

  if (presentation && presentation.trim()) {
    parts.push(presentation.trim());
  }

  return parts.join(" ");
}

function emptyItem(warehouseId: string, unit: string): ItemForm {
  return {
    key: newKey(),
    productId: "",
    productCode: "",
    productName: "",
    presentation: "",
    description: "",
    unit,
    quantity: "",
    value: "0",
    debitCredit: "0",
    warehouseId,
    location: "",
    costCenterId: "",
    lots: [],
    openLots: false,
  };
}

function emptyForm(): EntryForm {
  return {
    format: "E1",
    number: "",
    date: new Date().toISOString().slice(0, 10),
    thirdPartyId: "",
    nit: "",
    origin: "",
    costCenterId: "",
    purchaseOrder: "",
    sellerNumber: "1",
    notes: "",
    items: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export default function EntradasPage() {
  const router = useRouter();

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [thirdParties, setThirdParties] = useState<ThirdPartyOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);

  /* ---------------- Carga de catálogos ---------------- */

  useEffect(() => {
    let active = true;

    fetch("/api/entradas")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) setEntries(data.data);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch("/api/productos")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) setProducts(data.data);
      })
      .catch(() => undefined);

    fetch("/api/unidades")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) setUnits(data.data);
      })
      .catch(() => undefined);

    fetch("/api/centros-costo")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) setCostCenters(data.data);
      })
      .catch(() => undefined);

    fetch("/api/bodegas")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) setWarehouses(data.data);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  /* ---------------- Bodega sugerida según el tipo ---------------- */

  const entryType = useMemo(() => getEntryType(form.format), [form.format]);

  const suggestedWarehouse = useMemo(() => {
    if (!entryType.suggestedWarehouseType) return null;
    return (
      warehouses.find((w) => w.type === entryType.suggestedWarehouseType) ??
      null
    );
  }, [entryType, warehouses]);

  const defaultUnit = useMemo(() => {
    const first = units[0];
    return first?.code ?? "unidad";
  }, [units]);

  /* ---------------- Búsqueda de terceros ---------------- */

  const [thirdPartySearch, setThirdPartySearch] = useState("");
  const [showThirdPartyResults, setShowThirdPartyResults] = useState(false);
  const [selectedThirdParty, setSelectedThirdParty] =
    useState<ThirdPartyOption | null>(null);

  useEffect(() => {
    if (thirdPartySearch.trim().length < 2) return;

    let active = true;
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/terceros?search=${encodeURIComponent(thirdPartySearch)}`
      );
      const data = await res.json();
      if (active && data.success) setThirdParties(data.data);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [thirdPartySearch]);

  /**
   * Al escribir en el buscador de terceros se limpia el resultado anterior
   * cuando el texto es demasiado corto para consultar.
   */
  function handleThirdPartySearch(value: string) {
    setThirdPartySearch(value);
    setShowThirdPartyResults(true);

    if (value.trim().length < 2) {
      setThirdParties([]);
    }
  }

  function selectThirdParty(thirdParty: ThirdPartyOption) {
    setSelectedThirdParty(thirdParty);
    setForm((current) => ({
      ...current,
      thirdPartyId: thirdParty.id,
      nit: thirdParty.nit,
      origin: upper(thirdParty.name),
    }));
    setThirdPartySearch(`${thirdParty.nit} — ${thirdParty.name}`);
    setShowThirdPartyResults(false);
  }

  /* ---------------- Búsqueda de productos ---------------- */

  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [productResults, setProductResults] = useState<
    Record<string, ProductOption[]>
  >({});
  const [openProductSearch, setOpenProductSearch] = useState<string | null>(null);

  useEffect(() => {
    const key = openProductSearch;
    const term = key ? (productSearch[key] ?? "").trim() : "";

    if (!key || term.length < 2) return;

    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/productos?search=${encodeURIComponent(term)}`
      );
      const data = await res.json();
      if (data.success) {
        setProductResults((current) => ({ ...current, [key]: data.data }));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [openProductSearch, productSearch]);

  function selectProduct(itemKey: string, product: ProductOption) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              productId: product.id,
              productCode: product.code,
              productName: product.name,
              presentation: product.presentation ?? "",
              description: composeDescription(
                product.name,
                product.presentation,
                false,
                ""
              ),
              unit: product.unit || item.unit,
            }
          : item
      ),
    }));
    setProductSearch((current) => ({ ...current, [itemKey]: "" }));
    setProductResults((current) => ({ ...current, [itemKey]: [] }));
    setOpenProductSearch(null);
  }

  /* ---------------- Manejo de la entrada ---------------- */

  function openCreate() {
    setForm(emptyForm());
    setError("");
    setThirdPartySearch("");
    setSelectedThirdParty(null);
    setShowModal(true);
  }

  function updateItem(itemKey: string, patch: Partial<ItemForm>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === itemKey ? { ...item, ...patch } : item
      ),
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        emptyItem(suggestedWarehouse?.id ?? "", defaultUnit),
      ],
    }));
  }

  function removeItem(itemKey: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.key !== itemKey),
    }));
  }

  function addLot(itemKey: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              openLots: true,
              lots: [
                ...item.lots,
                {
                  key: newKey(),
                  code: "",
                  description: "Lotes Inicial",
                  expirationDate: "",
                  quantity: item.quantity || "",
                },
              ],
            }
          : item
      ),
    }));
  }

  function updateLot(
    itemKey: string,
    lotKey: string,
    patch: Partial<LotForm>
  ) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              lots: item.lots.map((lot) =>
                lot.key === lotKey ? { ...lot, ...patch } : lot
              ),
            }
          : item
      ),
    }));
  }

  function removeLot(itemKey: string, lotKey: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              lots: item.lots.filter((lot) => lot.key !== lotKey),
            }
          : item
      ),
    }));
  }

  /* ---------------- Validación antes de guardar ---------------- */

  function validate(): string | null {
    if (!form.format) return "Selecciona el tipo de entrada.";

    if (!form.date) return "Ingresa la fecha del documento.";

    if (form.thirdPartyId && !form.nit.trim()) {
      return "Ingresa el NIT de la entidad que entrega los productos.";
    }

    if (form.items.length === 0) return "Agrega al menos un producto.";

    for (const [index, item] of form.items.entries()) {
      const line = index + 1;

      if (!item.productId) return `Selecciona el producto de la línea ${line}.`;
      if (!item.warehouseId) return `Selecciona la bodega de la línea ${line}.`;
      if (!item.unit.trim()) return `Selecciona la unidad de la línea ${line}.`;

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return `La cantidad de la línea ${line} debe ser un número mayor que cero.`;
      }

      const value = item.value.trim() === "" ? 0 : Number(item.value);
      if (!Number.isFinite(value) || value < 0) {
        return `El valor de la línea ${line} no es válido.`;
      }

      if (item.lots.length > 0) {
        const lotTotal = item.lots.reduce(
          (sum, lot) => sum + (Number(lot.quantity) || 0),
          0
        );

        if (Math.abs(lotTotal - quantity) > 0.001) {
          return `Los lotes de la línea ${line} suman ${lotTotal} y la cantidad es ${quantity}.`;
        }

        for (const lot of item.lots) {
          if (!lot.expirationDate) {
            return `Ingresa la fecha de vencimiento de un lote de la línea ${line}.`;
          }
          if (!Number.isFinite(Number(lot.quantity)) || Number(lot.quantity) <= 0) {
            return `La cantidad del lote de la línea ${line} debe ser mayor que cero.`;
          }
        }
      }
    }

    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/entradas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: form.format,
          number: form.number.trim() || undefined,
          date: form.date,
          thirdPartyId: form.thirdPartyId || undefined,
          nit: form.nit.trim() || undefined,
          origin: form.origin.trim() || undefined,
          costCenterId: form.costCenterId || null,
          purchaseOrder: form.purchaseOrder.trim() || undefined,
          sellerNumber: Number(form.sellerNumber) || 1,
          notes: form.notes.trim() || undefined,
          status: "CONFIRMED",
          items: form.items.map((item) => ({
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: Number(item.quantity),
            unit: item.unit,
            presentation: item.presentation || undefined,
            description: item.description.trim() || undefined,
            costCenterId: item.costCenterId || null,
            location: item.location.trim() || undefined,
            value: item.value.trim() === "" ? 0 : Number(item.value),
            debitCredit:
              item.debitCredit.trim() === "" ? 0 : Number(item.debitCredit),
            lots: item.lots.map((lot) => ({
              code: lot.code.trim() || undefined,
              description: lot.description.trim() || undefined,
              expirationDate: lot.expirationDate || undefined,
              quantity: Number(lot.quantity),
            })),
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error al guardar la entrada");
        return;
      }

      setSavedEntryId(data.data.id);
      setShowModal(false);

      // Se refresca el listado sin recargar la página.
      fetch("/api/entradas")
        .then((res) => res.json())
        .then((list) => {
          if (list.success) setEntries(list.data);
        })
        .catch(() => undefined);
    } catch {
      setError("Error de conexión. Verifica tu internet e intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Render ---------------- */

  const filtered = entries.filter(
    (entry) =>
      entry.number.toLowerCase().includes(search.toLowerCase()) ||
      (entry.origin ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (entry.thirdPartyName ?? "")
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    DRAFT: "bg-yellow-100 text-yellow-800",
    CONFIRMED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entradas</h1>
          <p className="text-gray-600 mt-1">Registro de ingresos al inventario</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Nueva Entrada
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número, origen o entidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Número</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Tipo</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Fecha</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Entidad</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Estado</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <ArrowDownToLine className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    No hay entradas registradas
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-gray-900">{entry.number}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {entry.format}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{entry.date}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {entry.thirdPartyName ?? entry.origin ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          statusColors[entry.status]
                        )}
                      >
                        {entry.status === "DRAFT"
                          ? "Borrador"
                          : entry.status === "CONFIRMED"
                            ? "Confirmada"
                            : "Cancelada"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/entradas/${entry.id}/comprobante`)
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de registro */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Nueva Entrada — {entryType.documentTitle}
                </h2>
                <p className="text-sm text-gray-500">
                  Código documental: {entryType.documentCode} -
                  {form.number.trim() || "consecutivo automático"}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-5">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* --- 1. Tipo de entrada --- */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-sm font-medium text-gray-700">
                  1. Tipo de entrada
                </legend>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ENTRY_TYPE_LIST.map((type) => (
                    <label
                      key={type.code}
                      className={cn(
                        "flex flex-col gap-1 border rounded-lg px-3 py-2 cursor-pointer transition-colors",
                        form.format === type.code
                          ? "border-primary-500 bg-primary-50"
                          : "border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="format"
                          value={type.code}
                          checked={form.format === type.code}
                          onChange={(e) => {
                            const format = e.target.value;
                            setForm((current) => ({
                              ...current,
                              format,
                              items: current.items.map((item) => ({
                                ...item,
                                warehouseId:
                                  item.warehouseId ||
                                  (getEntryType(format).suggestedWarehouseType
                                    ? warehouses.find(
                                        (w) =>
                                          w.type ===
                                          getEntryType(format)
                                            .suggestedWarehouseType
                                      )?.id ?? ""
                                    : ""),
                              })),
                            }));
                          }}
                          className="text-primary-600"
                        />
                        <span className="font-semibold text-gray-900">
                          {type.code}
                        </span>
                      </span>
                      <span className="text-xs text-gray-600">{type.label}</span>
                      <span className="text-[11px] text-gray-400">
                        {type.documentTitle} · {type.documentCode}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* --- 2. Entidad que entrega --- */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-sm font-medium text-gray-700">
                  2. Entidad que entrega los productos
                </legend>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Buscar por NIT, cédula, nombre o sucursal
                    </label>
                    <input
                      type="text"
                      value={thirdPartySearch}
                      onChange={(e) => handleThirdPartySearch(e.target.value)}
                      onFocus={() => setShowThirdPartyResults(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                      placeholder="Ej: 222.222.222 o PARROQUIA"
                    />
                    {showThirdPartyResults && thirdParties.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {thirdParties.map((thirdParty) => (
                          <button
                            type="button"
                            key={thirdParty.id}
                            onClick={() => {
                              selectThirdParty(thirdParty);
                              setShowThirdPartyResults(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <span className="font-mono text-gray-700">
                              {thirdParty.nit}
                              {thirdParty.branch ? ` - ${thirdParty.branch}` : ""}
                            </span>
                            <span className="block text-gray-900">
                              {thirdParty.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {thirdParty.type}
                              {thirdParty.city ? ` · ${thirdParty.city}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      NIT
                    </label>
                    <input
                      type="text"
                      value={form.nit}
                      onChange={(e) => setForm({ ...form, nit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Se completa al elegir la entidad"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Razón social / nombre
                    </label>
                    <input
                      type="text"
                      value={form.origin}
                      onChange={(e) =>
                        setForm({ ...form, origin: upper(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                      placeholder="Nombre de la entidad"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={selectedThirdParty?.city ?? ""}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 text-gray-600"
                      placeholder="—"
                    />
                  </div>
                </div>
              </fieldset>

              {/* --- 3. Datos del documento --- */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-sm font-medium text-gray-700">
                  3. Datos del documento
                </legend>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Fecha del documento *
                    </label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      N.º de vendedor
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.sellerNumber}
                      onChange={(e) =>
                        setForm({ ...form, sellerNumber: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Centro de costo
                    </label>
                    <select
                      value={form.costCenterId}
                      onChange={(e) =>
                        setForm({ ...form, costCenterId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Sin centro de costo</option>
                      {costCenters.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.code} — {center.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Orden de compra
                    </label>
                    <input
                      type="text"
                      value={form.purchaseOrder}
                      onChange={(e) =>
                        setForm({ ...form, purchaseOrder: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Opcional"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      N.º de la entrada
                    </label>
                    <input
                      type="text"
                      value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Automático"
                    />
                  </div>
                </div>
              </fieldset>

              {/* --- 4. Productos --- */}
              <fieldset className="border border-gray-200 rounded-lg">
                <legend className="px-2 text-sm font-medium text-gray-700 ml-2">
                  4. Productos que ingresan
                </legend>

                <div className="p-4 space-y-3">
                  {form.items.length === 0 && (
                    <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                      <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      Agrega al menos un producto
                    </div>
                  )}

                  {form.items.map((item, index) => (
                    <div
                      key={item.key}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-600 text-white text-xs font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          {item.productCode || "Producto por seleccionar"}
                        </span>
                        <span className="text-xs text-gray-500 truncate">
                          {item.productName}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateItem(item.key, { openLots: !item.openLots })}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-white"
                          >
                            {item.openLots ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                            Lotes ({item.lots.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3 grid grid-cols-2 md:grid-cols-12 gap-3">
                        {/* Referencia del producto */}
                        <div className="col-span-12 md:col-span-3 relative">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Referencia del producto *
                          </label>
                          <input
                            type="text"
                            value={productSearch[item.key] ?? ""}
                            onChange={(e) => {
                              setProductSearch((current) => ({
                                ...current,
                                [item.key]: e.target.value,
                              }));
                              setOpenProductSearch(item.key);
                            }}
                            onFocus={() => setOpenProductSearch(item.key)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                            placeholder="Buscar por ref, nombre o categoría"
                          />
                          {openProductSearch === item.key &&
                            (productResults[item.key] ?? []).length > 0 && (
                              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                {(productResults[item.key] ?? []).map((product) => (
                                  <button
                                    type="button"
                                    key={product.id}
                                    onClick={() => selectProduct(item.key, product)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                                  >
                                    <span className="font-mono text-gray-700">
                                      {product.code}
                                    </span>
                                    <span className="block text-gray-900">
                                      {product.name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {product.categoryName ?? "Sin categoría"}
                                      {product.presentation
                                        ? ` · ${product.presentation}`
                                        : ""}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>

                        {/* Descripción */}
                        <div className="col-span-12 md:col-span-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Descripción
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) =>
                              updateItem(item.key, {
                                description: upper(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                            placeholder="Se completa al elegir el producto"
                          />
                        </div>

                        {/* NIT */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            NIT
                          </label>
                          <input
                            type="text"
                            value={form.nit}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 text-gray-600"
                          />
                        </div>

                        {/* D/C */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            D/C
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={item.debitCredit}
                            onChange={(e) =>
                              updateItem(item.key, { debitCredit: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>

                        {/* Bodega */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Bodega *
                          </label>
                          <select
                            value={item.warehouseId}
                            onChange={(e) =>
                              updateItem(item.key, { warehouseId: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          >
                            <option value="">Seleccionar...</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.code}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Ubicación */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Ubicación
                          </label>
                          <input
                            type="text"
                            value={item.location}
                            onChange={(e) =>
                              updateItem(item.key, {
                                location: upper(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Ej: 2"
                          />
                        </div>

                        {/* Cantidad */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Cantidad *
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(item.key, { quantity: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>

                        {/* Unidad */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Unidad *
                          </label>
                          <select
                            value={item.unit}
                            onChange={(e) =>
                              updateItem(item.key, { unit: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          >
                            {units.length === 0 && (
                              <option value={item.unit}>{item.unit}</option>
                            )}
                            {units.map((unit) => (
                              <option key={unit.id} value={unit.code}>
                                {unit.code} - {unit.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Valor */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Valor
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.value}
                            onChange={(e) =>
                              updateItem(item.key, { value: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>

                        {/* Centro de costo de la línea */}
                        <div className="col-span-6 md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            C. de costo
                          </label>
                          <select
                            value={item.costCenterId}
                            onChange={(e) =>
                              updateItem(item.key, { costCenterId: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          >
                            <option value="">—</option>
                            {costCenters.map((center) => (
                              <option key={center.id} value={center.id}>
                                {center.code}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Lotes */}
                      {item.openLots && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-700">
                              Lotes y fechas de vencimiento
                            </p>
                            <button
                              type="button"
                              onClick={() => addLot(item.key)}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                              + Agregar lote
                            </button>
                          </div>

                          {item.lots.length === 0 && (
                            <p className="text-xs text-gray-500 py-2">
                              Sin lotes. Si la operación no requiere control por
                              lotes, deja esta sección vacía.
                            </p>
                          )}

                          {item.lots.map((lot) => (
                            <div
                              key={lot.key}
                              className="grid grid-cols-12 gap-2 mb-2 items-end"
                            >
                              <div className="col-span-3">
                                <label className="block text-[11px] text-gray-500 mb-0.5">
                                  Código de lote
                                </label>
                                <input
                                  type="text"
                                  value={lot.code}
                                  onChange={(e) =>
                                    updateLot(item.key, lot.key, {
                                      code: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                                />
                              </div>
                              <div className="col-span-4">
                                <label className="block text-[11px] text-gray-500 mb-0.5">
                                  Denominación
                                </label>
                                <input
                                  type="text"
                                  value={lot.description}
                                  onChange={(e) =>
                                    updateLot(item.key, lot.key, {
                                      description: upper(e.target.value),
                                    })
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm uppercase"
                                />
                              </div>
                              <div className="col-span-3">
                                <label className="block text-[11px] text-gray-500 mb-0.5">
                                  Fecha de vencimiento
                                </label>
                                <input
                                  type="date"
                                  value={lot.expirationDate}
                                  onChange={(e) =>
                                    updateLot(item.key, lot.key, {
                                      expirationDate: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                              </div>
                              <div className="col-span-1">
                                <label className="block text-[11px] text-gray-500 mb-0.5">
                                  Cantidad
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.001"
                                  value={lot.quantity}
                                  onChange={(e) =>
                                    updateLot(item.key, lot.key, {
                                      quantity: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                              </div>
                              <div className="col-span-1">
                                <button
                                  type="button"
                                  onClick={() => removeLot(item.key, lot.key)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addItem}
                    className="w-full py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-primary-600 hover:bg-primary-50 transition-colors font-medium"
                  >
                    + Agregar producto
                  </button>
                </div>
              </fieldset>

              {/* --- 5. Observaciones --- */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="px-2 text-sm font-medium text-gray-700">
                  5. Observaciones
                </legend>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: upper(e.target.value) })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                  placeholder="Comentarios opcionales sobre la entrada"
                />
              </fieldset>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || form.items.length === 0}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar Entrada"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación de impresión */}
      {savedEntryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Entrada guardada
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              ¿Desea imprimir el comprobante de la entrada?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSavedEntryId(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = savedEntryId;
                  setSavedEntryId(null);
                  router.push(`/entradas/${id}/comprobante`);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
