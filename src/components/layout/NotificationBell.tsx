"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  message: string;
  actorName: string;
  createdAt: string;
  read: boolean;
  href: string;
}

interface NotificationResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

const PAGE_SIZE = 20;

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

export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/notificaciones?limit=${PAGE_SIZE}&offset=${offset}`
      );
      const payload = await response.json();
      if (!response.ok) return;
      const data = payload?.data as NotificationResponse | undefined;
      if (!data) return;

      setItems((current) =>
        offset === 0 ? data.items : [...current, ...data.items]
      );
      setTotal(data.total);
      setUnreadCount(data.unreadCount);
    } catch {
      // Si falla la consulta se conserva lo que ya estaba visible.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  useEffect(() => {
    if (open) void load(0);
  }, [open, load]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function marcarTodas() {
    try {
      await fetch("/api/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // Sin conexión se conserva el estado anterior.
    }
  }

  async function abrirNotificacion(item: NotificationItem) {
    if (!item.read) {
      try {
        await fetch("/api/notificaciones", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        setItems((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, read: true } : row
          )
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // La navegación no depende de que se guarde el estado de lectura.
      }
    }

    setOpen(false);
    router.push(item.href);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="app-control relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        aria-label="Notificaciones"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-4 right-4 top-[4.25rem] z-50 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-2rem)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
            <button
              type="button"
              onClick={() => void marcarTodas()}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline disabled:opacity-40 whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas
            </button>
          </div>

          <div className="max-h-[calc(100dvh-11rem)] sm:max-h-96 overflow-y-auto overflow-x-hidden divide-y divide-gray-100">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Cargando notificaciones…
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">
                No hay notificaciones.
              </p>
            ) : (
              <>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void abrirNotificacion(item)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors",
                      !item.read && "bg-primary-50/70"
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className={cn(
                          "mt-1.5 w-2 h-2 rounded-full shrink-0",
                          item.read ? "bg-gray-300" : "bg-primary-600"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 break-words">
                          {item.actorName}
                        </p>
                        <p className="text-sm text-gray-700 leading-snug break-words">
                          {item.message}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1 break-words">
                          {formatDateTime(item.createdAt)}
                          {item.read ? " · Leída" : " · No leída"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                {items.length < total && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => void load(items.length)}
                      disabled={loading}
                      className="text-xs font-medium text-primary-700 hover:underline disabled:opacity-50"
                    >
                      {loading ? "Cargando…" : "Ver notificaciones anteriores"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
