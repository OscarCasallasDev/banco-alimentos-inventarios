"use client";

import { GraduationCap, PlayCircle, Clock3 } from "lucide-react";
import {
  VIDEO_TUTORIALS,
  type VideoTutorial,
} from "@/lib/config/video-tutorials";
import { cn } from "@/lib/utils";

function abrirVideo(tutorial: VideoTutorial) {
  if (tutorial.status !== "DISPONIBLE" || !tutorial.url) return;
  window.open(tutorial.url, "_blank", "noopener,noreferrer");
}

export default function VideotutorialesPanel() {
  const categories = Array.from(
    new Set(VIDEO_TUTORIALS.map((tutorial) => tutorial.category))
  );

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
    </section>
  );
}
