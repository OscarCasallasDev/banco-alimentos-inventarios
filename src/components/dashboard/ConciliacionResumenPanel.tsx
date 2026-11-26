"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Equal,
  Loader2,
  Scale,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

type MovementType =
  | "INCREASE"
  | "NO_CHANGE"
  | "DECREASE_MATCHED"
  | "DECREASE_DISCREPANCY";

interface RelatedOrder {
  id: string;
  number: string;
  status: string;
  userName: string;
  createdAt: string;
  quantity: number;
}

interface SummaryItem {
  id: string;
  productCode: string;
  productName: string;
  siigoBodegaCode: number;
  previousQuantity: number;
  newQuantity: number;
  variation: number;
  committedQuantity: number;
  expectedQuantity: number;
  difference: number;
  movementType: MovementType;
  note: string | null;
  relatedOrders: RelatedOrder[];
}

interface Summary {
  importRunId: string;
  previousRunFinishedAt: string | null;
  currentRunFinishedAt: string | null;
  counts: {
    increase: number;
    noChange: number;
    decreaseMatched: number;
    decreaseDiscrepancy: number;
    pendingAlerts: number;
  };
  items: SummaryItem[];
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

const CATEGORIES: {
  key: MovementType;
  label: string;
  description: string;
  countKey: keyof Summary["counts"];
  icon: typeof ArrowUpRight;
  className: string;
}[] = [
  {
    key: "INCREASE",
    label: "Incrementos",
    description: "Entradas o aumentos de inventario",
    countKey: "increase",
    icon: ArrowUpRight,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    key: "NO_CHANGE",
    label: "Sin cambios",
    description: "Existencias iguales entre importaciones",
    countKey: "noChange",
    icon: Equal,
    className: "border-gray-200 bg-gray-50 text-gray-700",
  },
  {
    key: "DECREASE_MATCHED",
    label: "Disminuciones correctas",
    description: "Coinciden con las órdenes justificadas",
    countKey: "decreaseMatched",
    icon: ArrowDownRight,
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "DECREASE_DISCREPANCY",
    label: "Con discrepancia",
    description: "Requieren revisión",
    countKey: "decreaseDiscrepancy",
    icon: Scale,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
];

export default function ConciliacionResumenPanel() {
  const { data, isLoading, isError } = useApiQuery<Summary | null>(
    "/api/conciliacion/resumen"
  );
  const [active, setActive] = useState<MovementType>("DECREASE_DISCREPANCY");
  const [visible, setVisible] = useState(100);

  if (isLoading) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando resumen de la última comparación…
        </p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm text-gray-600">
          Todavía no hay una comparación entre importaciones disponible.
        </p>
      </section>
    );
  }

  const items = data.items.filter((item) => item.movementType === active);
  const shown = items.slice(0, visible);
  const category = CATEGORIES.find((item) => item.key === active)!;

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">
          Resumen de la última comparación de importaciones
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatDateTime(data.previousRunFinishedAt)} →{" "}
          {formatDateTime(data.currentRunFinishedAt)} · Comparación por producto y
          bodega.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 p-3">
        {CATEGORIES.map((item) => {
          const Icon = item.icon;
          const count = data.counts[item.countKey];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActive(item.key);
                setVisible(100);
              }}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors",
                item.className,
                active === item.key && "ring-2 ring-primary-400"
              )}
            >
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </p>
              <p className="text-2xl font-bold mt-1 tabular-nums">{count}</p>
              <p className="text-[11px] opacity-80">{item.description}</p>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-900">
            {category.label}{" "}
            <span className="text-xs font-normal text-gray-500">
              ({items.length})
            </span>
          </h3>
          <p className="text-xs text-amber-700">
            {data.counts.pendingAlerts} alerta
            {data.counts.pendingAlerts === 1 ? "" : "s"} pendiente
            {data.counts.pendingAlerts === 1 ? "" : "s"} de revisión
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-gray-500 py-3">
            No hay productos en esta categoría.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {shown.map((item) => (
              <article key={item.id} className="p-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-gray-500">
                      {item.productCode} · Bodega {item.siigoBodegaCode}
                    </p>
                    <p className="text-sm font-medium text-gray-900 break-words">
                      {item.productName}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-gray-800">
                    {formatNumber(item.previousQuantity)} →{" "}
                    {formatNumber(item.newQuantity)} UND
                    <span className="ml-2">{formatSigned(item.variation)}</span>
                  </p>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-gray-600">
                  <span>
                    Justificadas: {formatNumber(item.committedQuantity)} UND
                  </span>
                  <span>
                    Esperada: {formatNumber(item.expectedQuantity)} UND
                  </span>
                  {item.movementType === "DECREASE_DISCREPANCY" && (
                    <span className="font-semibold text-amber-800">
                      Diferencia: {formatSigned(item.difference)} UND
                    </span>
                  )}
                </div>

                {item.relatedOrders.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-gray-600">
                    {item.relatedOrders.map((order) => (
                      <li key={order.id}>
                        Orden <b>{order.number}</b> · {order.userName} ·{" "}
                        {formatNumber(order.quantity)} UND ·{" "}
                        {formatDateTime(order.createdAt)}
                      </li>
                    ))}
                  </ul>
                )}

                {item.movementType === "DECREASE_DISCREPANCY" && item.note && (
                  <p className="mt-1 text-amber-800">{item.note}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {items.length > visible && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setVisible((value) => value + 100)}
              className="text-xs font-medium text-primary-600 hover:underline"
            >
              Mostrar más ({items.length - visible} restantes)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
