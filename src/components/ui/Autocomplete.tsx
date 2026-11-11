"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de autocompletado con coincidencias parciales.
 *
 * Se usa para el «Destino» (parroquias y grupos de familia) y para cualquier
 * otro catálogo que se amplíe. La búsqueda va al servidor con un retardo de
 * 250 ms y se cancela si el usuario sigue escribiendo.
 */

export interface AutocompleteOption {
  id: string;
  label: string;
  detail?: string | null;
  badge?: string | null;
}

interface AutocompleteProps {
  /** Ruta de la API: se llama con ?search=<texto>. */
  endpoint: string;
  /** Valor ya seleccionado (para mostrarlo). */
  value: AutocompleteOption | null;
  onChange: (option: AutocompleteOption | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export default function Autocomplete({
  endpoint,
  value,
  onChange,
  placeholder = "Buscar…",
  label,
  required,
  emptyMessage = "Sin coincidencias.",
  className,
  disabled,
}: AutocompleteProps) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{
    term: string;
    options: AutocompleteOption[];
  }>({ term: "", options: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Los resultados se guardan junto con el término al que corresponden: así
  // no hace falta limpiarlos desde un efecto (evita renders en cascada).
  const options = results.term === term.trim() ? results.options : [];

  // Búsqueda con retardo y cancelación.
  useEffect(() => {
    if (!open) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${endpoint}?search=${encodeURIComponent(trimmed)}`
        );
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        const items = payload?.data?.items ?? [];
        setResults({
          term: trimmed,
          options: items.map((item: Record<string, unknown>) => ({
            id: String(item.id),
            label: String(item.name ?? item.label ?? ""),
            detail: (item.type ?? item.description ?? null) as string | null,
            badge: (item.code ?? null) as string | null,
          })),
        });
      } catch {
        if (!cancelled) setResults({ term: trimmed, options: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, endpoint]);

  // Cierra el desplegable al hacer clic fuera.
  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const displayValue = value ? value.label : term;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      {label && (
        <span className="text-xs font-medium text-gray-700">{label}</span>
      )}
      <div className="relative mt-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={displayValue}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          placeholder={placeholder}
          className={cn(
            "w-full pl-9 pr-9 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
            required && !value ? "border-amber-300" : "border-gray-300",
            disabled && "bg-gray-100"
          )}
          aria-label={label ?? placeholder}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setTerm("");
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Limpiar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {!value && !loading && (
            <ChevronDown className="w-4 h-4 text-gray-400 pointer-events-none" />
          )}
        </div>
      </div>

      {open && term.trim().length >= 2 && (
        <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {options.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-500">
              {loading ? "Buscando…" : emptyMessage}
            </li>
          ) : (
            options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setTerm("");
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-primary-50 flex items-center justify-between gap-2"
                >
                  <span className="text-sm text-gray-900">{option.label}</span>
                  {option.badge && (
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                      {option.badge}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
