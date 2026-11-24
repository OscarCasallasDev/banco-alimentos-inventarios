"use client";

import { useState } from "react";
import { ClipboardList, RefreshCw, Search, ChevronDown } from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

interface AuditChange {
  field: string;
  before: string;
  after: string;
}

interface AuditDetails {
  actorName: string;
  orderNumber: string;
  summary: string;
  changes?: AuditChange[];
  snapshot?: Record<string, unknown>;
}

interface AuditItem {
  id: string;
  action: "CREO" | "EDITO" | "ELIMINO";
  createdAt: string;
  username: string;
  details: AuditDetails;
}

interface AuditResponse {
  items: AuditItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface UserItem {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

const ACTION_LABEL: Record<string, string> = {
  CREO: "Creó",
  EDITO: "Editó",
  ELIMINO: "Eliminó",
};

const ACTION_STYLE: Record<string, string> = {
  CREO: "bg-emerald-100 text-emerald-800",
  EDITO: "bg-amber-100 text-amber-800",
  ELIMINO: "bg-red-100 text-red-800",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(date);
}

export default function AuditoriaOrdenesPanel() {
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (action) params.set("action", action);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("pageSize", "100");

  const { data, isFetching, refetch } = useApiQuery<AuditResponse>(
    `/api/auditoria/ordenes?${params.toString()}`
  );
  const { data: users = [] } = useApiQuery<UserItem[]>("/api/usuarios");

  const items = data?.items ?? [];

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              Auditoría de órdenes de pedido
            </h2>
            <p className="text-sm text-gray-500">
              Creación, edición y eliminación de órdenes por usuario
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">Todos los usuarios</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.firstName} {user.lastName} ({user.username})
            </option>
          ))}
        </select>

        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">Todas las acciones</option>
          <option value="CREO">Creación</option>
          <option value="EDITO">Edición</option>
          <option value="ELIMINO">Eliminación</option>
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          aria-label="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          aria-label="Hasta"
        />
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          No hay movimientos de auditoría con estos filtros.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-3 py-2 font-medium text-gray-600">Fecha y hora</th>
                <th className="px-3 py-2 font-medium text-gray-600">Usuario</th>
                <th className="px-3 py-2 font-medium text-gray-600">Orden</th>
                <th className="px-3 py-2 font-medium text-gray-600">Acción</th>
                <th className="px-3 py-2 font-medium text-gray-600">Resumen</th>
                <th className="px-3 py-2 font-medium text-gray-600 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <AuditRow
                  key={item.id}
                  item={item}
                  open={openId === item.id}
                  onToggle={() =>
                    setOpenId((current) => (current === item.id ? null : item.id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditRow({
  item,
  open,
  onToggle,
}: {
  item: AuditItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-3 py-3 whitespace-nowrap text-gray-700">
          {formatDateTime(item.createdAt)}
        </td>
        <td className="px-3 py-3 text-gray-900">
          {item.details.actorName || item.username}
        </td>
        <td className="px-3 py-3 font-mono text-xs text-gray-700">
          {item.details.orderNumber}
        </td>
        <td className="px-3 py-3">
          <span
            className={cn(
              "inline-flex px-2 py-1 rounded-full text-xs font-medium",
              ACTION_STYLE[item.action]
            )}
          >
            {ACTION_LABEL[item.action] ?? item.action}
          </span>
        </td>
        <td className="px-3 py-3 text-gray-700">{item.details.summary}</td>
        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-primary-600 hover:underline"
          >
            {open ? "Ocultar" : "Ver"}
            <ChevronDown className={cn("w-4 h-4", open && "rotate-180")} />
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50/70">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-3">
              {item.details.changes && item.details.changes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    Campos modificados
                  </p>
                  <ul className="space-y-1 text-sm">
                    {item.details.changes.map((change, index) => (
                      <li key={`${change.field}-${index}`} className="text-gray-700">
                        <b>{change.field}:</b> {change.before} → {change.after}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.details.snapshot && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    Información de la orden
                  </p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-white border border-gray-200 p-3 text-xs text-gray-700">
                    {JSON.stringify(item.details.snapshot, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
