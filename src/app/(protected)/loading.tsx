export default function ProtectedLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando módulo">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-200" />
      </div>

      <div className="h-11 w-full max-w-md animate-pulse rounded-lg bg-gray-200" />

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-gray-100"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
