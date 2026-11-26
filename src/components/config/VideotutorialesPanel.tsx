"use client";

import { useEffect, useState } from "react";
import { GraduationCap, PlayCircle, Clock3, X } from "lucide-react";
import {
  VIDEO_TUTORIALS,
  type VideoTutorial,
} from "@/lib/config/video-tutorials";
import { cn } from "@/lib/utils";

export default function VideotutorialesPanel() {
  const [active, setActive] = useState<VideoTutorial | null>(null);

  const categories = Array.from(
    new Set(VIDEO_TUTORIALS.map((tutorial) => tutorial.category))
  );

  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  function abrirVideo(tutorial: VideoTutorial) {
    if (tutorial.status !== "DISPONIBLE" || !tutorial.url) return;
    setActive(tutorial);
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 min-w-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-sky-700" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">Videotutoriales</h2>
          <p className="text-sm text-gray-500">
            Guías prácticas para aprender a utilizar el sistema del Banco
            Arquidiocesano de Alimentos de Ibagué.
          </p>
        </div>
      </div>

      <div className="max-h-[34rem] overflow-y-auto pr-1 space-y-5">
        {categories.map((category) => (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {category}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {VIDEO_TUTORIALS.filter(
                (tutorial) => tutorial.category === category
              ).map((tutorial) => {
                const disponible =
                  tutorial.status === "DISPONIBLE" && Boolean(tutorial.url);

                return (
                  <article
                    key={tutorial.id}
                    className="min-w-0 rounded-lg border border-gray-200 p-3 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 break-words">
                        {tutorial.title}
                      </h4>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0",
                          disponible
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {disponible ? (
                          <PlayCircle className="w-3 h-3" />
                        ) : (
                          <Clock3 className="w-3 h-3" />
                        )}
                        {disponible ? "Disponible" : "Próximamente"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-snug break-words">
                      {tutorial.description}
                    </p>
                    <div className="mt-auto">
                      <button
                        type="button"
                        onClick={() => abrirVideo(tutorial)}
                        disabled={!disponible}
                        title={
                          disponible
                            ? "Abrir videotutorial"
                            : "El video estará disponible próximamente"
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Ver video
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">
                  {active.category}
                </p>
                <h3 className="text-sm font-semibold text-gray-900 break-words">
                  {active.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                aria-label="Cerrar videotutorial"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <video
              key={active.id}
              src={active.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onRateChange={(event) => {
                // La velocidad de reproducción no se modifica.
                if (event.currentTarget.playbackRate !== 1) {
                  event.currentTarget.playbackRate = 1;
                }
              }}
              className="w-full aspect-video bg-black"
            >
              Tu navegador no admite la reproducción de video.
            </video>
          </div>
        </div>
      )}
    </section>
  );
}
