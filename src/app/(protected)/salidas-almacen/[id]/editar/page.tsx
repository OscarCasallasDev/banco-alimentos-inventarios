/**
 * Edición de una orden de pedido en borrador.
 *
 * Permite corregir la información general, los productos, las cantidades,
 * las bodegas y las observaciones. Solo se editan órdenes en DRAFT: una
 * orden ya generada conserva su contenido histórico (requisito del Banco).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Package,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Calendar,
  User,
  Warehouse,
} from "lucide-react";
import { apiSend } from "@/lib/api/client";
import Autocomplete, {
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { cn } from "@/lib/utils";
import {
  MESSAGES,
  validateExpiration,
  validateQuantity,
  validateWeight,
} from "@/lib/orders/validation";

interface Program {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface StockRow {
  productId: string;
  productCode: string;
  description: string;
  unit: string;
  siigoBodegaCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  quantity: number;
  reserved: number;
  available: number;
  locationCount: number;
  canAdd: boolean;
}

interface BodegaOpcion {
  siigoBodegaCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  available: number;
}

interface Linea {
  key: string;
  productId: string;
  productCode: string;
  description: string;
  unit: string;
  siigoBodegaCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
  available: number;
  opciones: BodegaOpcion[];
  quantity: string;
  weight: string;
  weightUnit: string;
  expirationDate: string;
  notes: string;
  touched: {
    quantity?: boolean;
    weight?: boolean;
    expirationDate?: boolean;
  };
}

interface SalidaExistente {
  id: string;
  status: string;
  notes: string | null;
  delivererName: string | null;
  delivererDocument: string | null;
  programId: string | null;
  customProgramName: string | null;
  destination: { id: string; label: string } | null;
  items: {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    unitCode: string | null;
    siigoBodegaCode: number;
    quantity: number;
    weight: number | null;
    weightUnit: string | null;
    expirationDate: string | null;
    notes: string | null;
  }[];
}

const UNIDADES_PESO = ["kg", "g", "ml", "l"];
const PROGRAMA_OTRO = "__OTRO__";

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    value
  );
}

export default function EditarOrdenPedidoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");
  const [customProgramName, setCustomProgramName] = useState("");
  const [destination, setDestination] = useState<AutocompleteOption | null>(null);
  const [delivererName, setDelivererName] = useState("");
  const [delivererDocument, setDelivererDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ term: string; items: StockRow[] }>({
    term: "",
    items: [],
  });
  const [searching, setSearching] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Programas del catálogo.
  const [programs, setPrograms] = useState<Program[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/programas")
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setPrograms(payload?.data?.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga de la orden existente.
  useEffect(() => {
    let cancelled = false;
    async function cargar() {
      try {
        const response = await fetch(`/api/salidas/${id}`);
        if (!response.ok) throw new Error("No se pudo cargar la orden.");
        const payload = await response.json();
        const salida: SalidaExistente = payload?.data;
        if (!salida) throw new Error("No se pudo cargar la orden.");

        if (salida.status !== "DRAFT") {
          setLoadError(
            "Esta orden ya fue generada: conserva su contenido histórico y no se puede editar."
          );
          setLoading(false);
          return;
        }

        if (cancelled) return;

        setProgramId(
          salida.customProgramName ? PROGRAMA_OTRO : (salida.programId ?? "")
        );
        setCustomProgramName(salida.customProgramName ?? "");
        setDelivererName(salida.delivererName ?? "");
        setDelivererDocument(salida.delivererDocument ?? "");
        setNotes(salida.notes ?? "");

        // Las líneas se reconstruyen con la disponibilidad real de cada
        // producto en su bodega.
        const cargadas = await Promise.all(
          salida.items.map(async (item) => {
            const opciones = await cargarBodegas(item.productId);
            const opcion = opciones.find(
              (o) => o.siigoBodegaCode === item.siigoBodegaCode
            );
            return {
              key: `${item.productId}-${item.siigoBodegaCode}`,
              productId: item.productId,
              productCode: item.productCode,
              description: item.productName,
              unit: item.unitCode ?? "UND",
              siigoBodegaCode: item.siigoBodegaCode,
              warehouseId: opcion?.warehouseId ?? null,
              warehouseName: opcion?.warehouseName ?? null,
              available: opcion?.available ?? 0,
              opciones,
              quantity: String(item.quantity),
              weight: item.weight === null ? "" : String(item.weight),
              weightUnit: item.weightUnit ?? "kg",
              expirationDate: item.expirationDate ?? "",
              notes: item.notes ?? "",
              touched: {},
            } satisfies Linea;
          })
        );

        if (!cancelled) {
          setLineas(cargadas);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError((err as Error).message);
          setLoading(false);
        }
      }
    }
    void cargar();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function cargarBodegas(productId: string): Promise<BodegaOpcion[]> {
    try {
      const response = await fetch(`/api/existencias/producto/${productId}`);
      if (!response.ok) return [];
      const payload = await response.json();
      const items: StockRow[] = payload?.data?.items ?? [];
      return items.map((item) => ({
        siigoBodegaCode: item.siigoBodegaCode,
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName,
        available: item.available,
      }));
    } catch {
      return [];
    }
  }

  // Búsqueda de productos con retardo y cancelación.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/existencias?search=${encodeURIComponent(trimmed)}&pageSize=25`
        );
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setResults({ term: trimmed, items: payload?.data?.items ?? [] });
        }
      } catch {
        if (!cancelled) setResults({ term: trimmed, items: [] });
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const resultados = results.term === search.trim() ? results.items : [];

  const esProgramaPropio = programId === PROGRAMA_OTRO;
  const effectiveProgramId = esProgramaPropio
    ? ""
    : programId || programs[0]?.id || "";

  async function agregar(stock: StockRow) {
    if (!stock.canAdd) {
      setError(MESSAGES.noStock);
      return;
    }
    const key = `${stock.productId}-${stock.siigoBodegaCode}`;
    if (lineas.some((line) => line.key === key)) return;
    setError(null);

    const opciones = await cargarBodegas(stock.productId);

    setLineas((prev) => [
      ...prev,
      {
        key,
        productId: stock.productId,
        productCode: stock.productCode,
        description: stock.description,
        unit: stock.unit || "UND",
        siigoBodegaCode: stock.siigoBodegaCode,
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouseName,
        available: stock.available,
        opciones,
        quantity: "",
        weight: "",
        weightUnit: "kg",
        expirationDate: "",
        notes: "",
        touched: {},
      },
    ]);
    setSearch("");
    setResults({ term: "", items: [] });
    setShowSearch(false);
  }

  function quitar(key: string) {
    setLineas((prev) => prev.filter((line) => line.key !== key));
  }

  function actualizar(key: string, cambios: Partial<Linea>) {
    setLineas((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...cambios } : line))
    );
  }

  function cambiarBodega(key: string, siigoBodegaCode: number) {
    setLineas((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const opcion = line.opciones.find(
          (o) => o.siigoBodegaCode === siigoBodegaCode
        );
        return {
          ...line,
          siigoBodegaCode,
          warehouseId: opcion?.warehouseId ?? null,
          warehouseName: opcion?.warehouseName ?? null,
          available: opcion?.available ?? 0,
          quantity:
            Number(line.quantity.replace(",", ".")) > (opcion?.available ?? 0)
              ? ""
              : line.quantity,
        };
      })
    );
  }

  function tocar(
    key: string,
    campo: "quantity" | "weight" | "expirationDate"
  ) {
    setLineas((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, touched: { ...line.touched, [campo]: true } }
          : line
      )
    );
  }

  const lineasCalculadas = useMemo(
    () =>
      lineas.map((line) => {
        const quantityError = validateQuantity(line.quantity, line.available);
        const weightError = validateWeight(line.weight);
        const expirationError = validateExpiration(line.expirationDate);
        const quantity = Number(line.quantity.replace(",", ".")) || 0;
        const weight = Number(line.weight.replace(",", ".")) || 0;
        return {
          ...line,
          quantity,
          weight,
          quantityError,
          weightError,
          expirationError,
          showQuantityError:
            (line.touched.quantity || submitAttempted) && quantityError !== null,
          showWeightError:
            (line.touched.weight || submitAttempted) && weightError !== null,
          showExpirationError:
            (line.touched.expirationDate || submitAttempted) &&
            expirationError !== null,
        };
      }),
    [lineas, submitAttempted]
  );

  const hayErrores = lineasCalculadas.some(
    (line) =>
      line.quantityError !== null ||
      line.weightError !== null ||
      line.expirationError !== null
  );

  const nombreValido = delivererName.trim().length > 0;
  const programaValido = esProgramaPropio
    ? customProgramName.trim().length > 0
    : effectiveProgramId.length > 0;

  async function guardar() {
    setError(null);
    setSubmitAttempted(true);

    if (!programaValido) {
      setError(
        esProgramaPropio
          ? "Escriba el nombre del programa."
          : "Seleccione el programa de la orden."
      );
      return;
    }
    if (!nombreValido) {
      setError("Escribe el nombre del almacenista que entrega la orden.");
      return;
    }
    if (lineas.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }
    if (hayErrores) {
      setError(
        "Revisa los campos marcados: la cantidad y el peso deben ser mayores que 0, y la fecha de vencimiento es obligatoria."
      );
      return;
    }

    setSaving(true);
    try {
      const items = lineasCalculadas.map((line) => ({
        productId: line.productId,
        siigoBodegaCode: line.siigoBodegaCode,
        locationCode: 0,
        quantity: line.quantity,
        unit: line.unit,
        weight: line.weight,
        weightUnit: line.weightUnit,
        expirationDate: line.expirationDate,
        notes: line.notes.trim() || undefined,
      }));

      await apiSend(`/api/salidas/${id}`, "PUT", {
        programId: esProgramaPropio ? null : effectiveProgramId,
        customProgramName: esProgramaPropio
          ? customProgramName.trim()
          : null,
        destinationId: destination?.id ?? null,
        delivererName: delivererName.trim(),
        delivererDocument: delivererDocument.trim() || null,
        notes: notes.trim() || null,
        items,
      });

      router.push(`/salidas-almacen/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-gray-500">
        Cargando la orden…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-10 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-gray-700">{loadError}</p>
        <Link
          href={`/salidas-almacen/${id}`}
          className="inline-block mt-3 text-sm text-primary-600 hover:underline"
        >
          Volver a la orden
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <Link
            href={`/salidas-almacen/${id}`}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">
              Banco Arquidiocesano de Alimentos de Ibagué
            </p>
            <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">
              Editar orden de pedido
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Corrija la información general, los productos y sus bodegas.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Información general
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Autocomplete
                label="Destino *"
                required
                endpoint="/api/destinos"
                value={destination}
                onChange={setDestination}
                placeholder="Escriba para buscar (ej. San Juan)…"
                emptyMessage="No hay destinos que coincidan."
              />

              <label className="block">
                <span className="text-xs font-medium text-gray-700">Programa</span>
                <select
                  value={esProgramaPropio ? PROGRAMA_OTRO : effectiveProgramId}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === PROGRAMA_OTRO) {
                      setProgramId(PROGRAMA_OTRO);
                    } else {
                      setProgramId(value);
                      setCustomProgramName("");
                    }
                  }}
                  className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                  <option value={PROGRAMA_OTRO}>Otro programa</option>
                </select>
              </label>

              {esProgramaPropio && (
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">
                    Nombre del programa *
                  </span>
                  <input
                    type="text"
                    value={customProgramName}
                    onChange={(event) => setCustomProgramName(event.target.value)}
                    placeholder="Ej.: Jornada de atención especial"
                    className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Nombre del almacenista (quien
                  entrega) *
                </span>
                <input
                  type="text"
                  value={delivererName}
                  onChange={(event) => setDelivererName(event.target.value)}
                  placeholder="Escriba el nombre de quien entrega"
                  className={cn(
                    "mt-1 w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none",
                    submitAttempted && !nombreValido
                      ? "border-amber-400"
                      : "border-gray-300"
                  )}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  Cédula del almacenista (opcional)
                </span>
                <input
                  type="text"
                  value={delivererDocument}
                  onChange={(event) => setDelivererDocument(event.target.value)}
                  placeholder="Documento de identificación"
                  className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </label>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Productos</h2>
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                <Plus className="w-4 h-4" />
                Agregar producto
              </button>
            </div>

            {showSearch && (
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="search"
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nombre, código o referencia…"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    aria-label="Buscar productos"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {resultados.length > 0 && (
                  <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
                    {resultados.map((stock) => {
                      const key = `${stock.productId}-${stock.siigoBodegaCode}`;
                      const yaAgregado = lineas.some((line) => line.key === key);
                      return (
                        <li
                          key={`${key}-${stock.productCode}`}
                          className={cn(
                            "flex items-center justify-between gap-3 p-3",
                            stock.canAdd ? "hover:bg-gray-50" : "bg-gray-50/60"
                          )}
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-gray-500">
                              {stock.productCode}
                            </p>
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {stock.description}
                            </p>
                            <p className="text-xs text-gray-500">
                              {stock.warehouseName ?? "Bodega sin asignar"} ·{" "}
                              <span
                                className={cn(
                                  "font-semibold",
                                  stock.available > 0
                                    ? "text-emerald-700"
                                    : stock.available < 0
                                      ? "text-red-600"
                                      : "text-gray-500"
                                )}
                              >
                                disponible: {formatNumber(stock.available)}{" "}
                                {stock.unit}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!stock.canAdd || yaAgregado}
                            onClick={() => agregar(stock)}
                            className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:bg-gray-300 disabled:cursor-not-allowed"
                          >
                            {yaAgregado ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {search.trim().length >= 2 &&
                  !searching &&
                  resultados.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Sin resultados. Verifique que el inventario de Siigo esté
                      sincronizado.
                    </p>
                  )}
              </div>
            )}

            {lineas.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">
                  Agrega al menos un producto a la orden.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {lineasCalculadas.map((line) => (
                  <div
                    key={line.key}
                    className="rounded-lg border border-gray-200 bg-gray-50/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-gray-500">
                          {line.productCode}
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {line.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitar(line.key)}
                        className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        aria-label={`Quitar ${line.description}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      <label className="block col-span-2 lg:col-span-2">
                        <span className="text-[11px] font-medium text-gray-600 flex items-center gap-1">
                          <Warehouse className="w-3 h-3" /> Bodega de salida *
                        </span>
                        <select
                          value={line.siigoBodegaCode}
                          onChange={(event) =>
                            cambiarBodega(line.key, Number(event.target.value))
                          }
                          className="mt-1 w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                          aria-label="Bodega de salida"
                        >
                          {line.opciones.length === 0 && (
                            <option value={line.siigoBodegaCode}>
                              {line.warehouseName ?? "Bodega sin asignar"}
                            </option>
                          )}
                          {line.opciones.map((opcion) => (
                            <option
                              key={opcion.siigoBodegaCode}
                              value={opcion.siigoBodegaCode}
                            >
                              {opcion.warehouseName ??
                                `Bodega ${opcion.siigoBodegaCode}`}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] text-gray-500">
                          Disponible: {formatNumber(line.available)} {line.unit}
                        </span>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-600">
                          Cantidad *
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            actualizar(line.key, { quantity: event.target.value })
                          }
                          onBlur={() => tocar(line.key, "quantity")}
                          placeholder="0"
                          aria-invalid={line.showQuantityError}
                          className={cn(
                            "mt-1 w-full px-2.5 py-2 border rounded-lg text-sm tabular-nums focus:ring-2 focus:ring-primary-500 outline-none",
                            line.showQuantityError
                              ? "border-red-400 bg-red-50"
                              : "border-gray-300"
                          )}
                          aria-label="Cantidad"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-600">
                          Unidad
                        </span>
                        <select
                          value={line.unit}
                          onChange={(event) =>
                            actualizar(line.key, { unit: event.target.value })
                          }
                          className="mt-1 w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                          aria-label="Unidad"
                        >
                          {[...new Set([line.unit || "UND", "UND", "KG", "GR", "ML", "L", "CAJA", "PAQUETE"])]
                            .filter(Boolean)
                            .map((unidad) => (
                              <option key={unidad} value={unidad}>
                                {unidad}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-600">
                          Peso *
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.weight}
                          onChange={(event) =>
                            actualizar(line.key, { weight: event.target.value })
                          }
                          onBlur={() => tocar(line.key, "weight")}
                          placeholder="0"
                          aria-invalid={line.showWeightError}
                          className={cn(
                            "mt-1 w-full px-2.5 py-2 border rounded-lg text-sm tabular-nums focus:ring-2 focus:ring-primary-500 outline-none",
                            line.showWeightError
                              ? "border-red-400 bg-red-50"
                              : "border-gray-300"
                          )}
                          aria-label="Peso"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-600">
                          Unidad de peso
                        </span>
                        <select
                          value={line.weightUnit}
                          onChange={(event) =>
                            actualizar(line.key, { weightUnit: event.target.value })
                          }
                          className="mt-1 w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                          aria-label="Unidad de peso"
                        >
                          {UNIDADES_PESO.map((unidad) => (
                            <option key={unidad} value={unidad}>
                              {unidad}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-medium text-gray-600">
                          Vencimiento *
                        </span>
                        <div className="relative mt-1">
                          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                          <input
                            type="date"
                            value={line.expirationDate}
                            onChange={(event) =>
                              actualizar(line.key, {
                                expirationDate: event.target.value,
                              })
                            }
                            onBlur={() => tocar(line.key, "expirationDate")}
                            aria-invalid={line.showExpirationError}
                            className={cn(
                              "w-full pl-8 pr-2 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none",
                              line.showExpirationError
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            )}
                            aria-label="Fecha de vencimiento"
                          />
                        </div>
                      </label>
                    </div>

                    {line.showQuantityError && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {line.quantityError}
                      </p>
                    )}
                    {line.showWeightError && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {line.weightError}
                      </p>
                    )}
                    {line.showExpirationError && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {line.expirationError}
                      </p>
                    )}

                    <input
                      type="text"
                      value={line.notes}
                      onChange={(event) =>
                        actualizar(line.key, { notes: event.target.value })
                      }
                      placeholder="Observación del producto (opcional)"
                      className="mt-2 w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      aria-label="Observación del producto"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Observaciones generales
            </h2>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Ej.: Entregar los productos en el área de despacho (opcional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-y"
            />
          </section>

          <div className="flex justify-end gap-2">
            <Link
              href={`/salidas-almacen/${id}`}
              className="px-5 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="button"
              onClick={guardar}
              disabled={saving || lineas.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-40 disabled:bg-gray-400 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Guardar cambios
                </>
              )}
            </button>
          </div>
        </div>

        <aside className="xl:col-span-1">
          <div className="xl:sticky xl:top-4 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Programa</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {esProgramaPropio
                    ? customProgramName.trim() || "—"
                    : (programs.find((p) => p.id === effectiveProgramId)?.name ??
                      "—")}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Almacenista</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {delivererName.trim() || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Líneas</dt>
                <dd className="font-medium text-gray-900 tabular-nums">
                  {lineas.length}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Bodegas</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {new Set(lineas.map((l) => l.siigoBodegaCode)).size || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
