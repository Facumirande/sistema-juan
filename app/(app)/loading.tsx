/**
 * Lo que se ve al instante al tocar un enlace, mientras llegan los datos de la pantalla: su
 * silueta. Así el toque responde enseguida y se entiende que está cargando.
 */
export default function Cargando() {
  const barra = "animate-pulse rounded-xl bg-borde/70";
  return (
    <div className="flex max-w-5xl flex-col gap-5" role="status" aria-label="Cargando">
      <div className={`${barra} h-9 w-64`} />
      <div className={`${barra} h-5 w-full max-w-xl`} />
      <div className="flex gap-3">
        <div className={`${barra} h-12 w-32`} />
        <div className={`${barra} h-12 w-32`} />
        <div className={`${barra} h-12 w-32`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${barra} h-36`} />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
