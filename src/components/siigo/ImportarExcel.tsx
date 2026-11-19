"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  esArchivoImportable,
  importarArchivoExcel,
} from "@/lib/siigo/import-excel";

interface ImportarExcelProps {
  /** Se llama al terminar la importación, para refrescar el dashboard. */
  onFinished?: (resumen: unknown) => void;
}

/** Datos del resumen que usa el mensaje de éxito. */
interface ResumenImportacion {
  processedRows?: number;
  totalRows?: number;
  alreadyProcessed?: boolean;
}

/**
 * Botón «Importar Excel» del dashboard.
 *
 * El archivo se elige en el equipo del usuario (nunca una ruta del
 * servidor): se envía directamente a Supabase Storage con una URL firmada.
 */
export default function ImportarExcel({ onFinished }: ImportarExcelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setSelected(null);
    setConfirming(false);
    setProgress("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    setDone(null);

    if (!file) {
      setSelected(null);
      return;
    }

    if (!esArchivoImportable(file.name)) {
      setSelected(null);
      setError(
        "El archivo debe ser un Excel (.xlsx) generado por Siigo Pyme."
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    // No se importa todavía: primero se pide confirmación.
    setSelected(file);
    setConfirming(true);
  }

  function cancel() {
    // Cancelar no ejecuta ningún proceso ni modifica información.
    reset();
  }

  async function confirm() {
    if (!selected || busy) return;

    setConfirming(false);
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress("Preparando la importación…");

    const resumen = await importarArchivoExcel<ResumenImportacion>(selected, {
      onProgress: setProgress,
      onError: (mensaje) => {
        setError(mensaje);
        setProgress("");
      },
    });

    setBusy(false);
    setProgress("");

    if (resumen) {
      const filas = resumen.processedRows ?? resumen.totalRows ?? 0;
      setDone(
        `Importación completada: ${filas} fila(s) procesada(s). El inventario ya está actualizado.`
      );
      onFinished?.(resumen);
      router.refresh();
    }

    reset();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handlePick}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" />
        )}
        Importar Excel
      </button>

      {/* Confirmación antes de importar. */}
      {confirming && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              ¿Estás seguro de que deseas importar este archivo?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              El archivo seleccionado es:
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <FileSpreadsheet className="w-4 h-4 text-primary-600 shrink-0" />
              <span className="truncate">{selected.name}</span>
            </p>
            <p className="mt-3 text-xs text-gray-500">
              La importación actualiza productos, inventarios, bodegas,
              programas y vencimientos con los datos del archivo.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancel}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Confirmar importación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de carga durante la importación. */}
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <Loader2 className="w-10 h-10 mx-auto text-primary-600 animate-spin" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Importando información
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Estamos importando la información del archivo Excel. Por favor,
              espera mientras actualizamos los datos.
            </p>
            {progress && (
              <p className="mt-3 text-xs text-gray-500">{progress}</p>
            )}
            <p className="mt-4 text-xs text-gray-400">
              No cierres esta ventana: la importación se cancelaría.
            </p>
          </div>
        </div>
      )}

      {/* Resultado de la importación. */}
      {(error || done) && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
          <div
            className={
              error
                ? "flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-lg text-sm"
                : "flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl shadow-lg text-sm"
            }
          >
            {error ? (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <p className="flex-1">{error ?? done}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDone(null);
              }}
              className="shrink-0 text-current opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
