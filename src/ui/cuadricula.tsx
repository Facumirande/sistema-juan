import Link from "next/link";
import type { ReactNode } from "react";

// Registros en cuadrícula (clientes, productos, proveedores): tarjetas como las de Trello, con una
// franja de color arriba, agrupadas por categoría o tipo, y la opción de verlas como lista.

export function Grupo({ titulo, icono, cantidad, children }: { titulo: string; icono?: string; cantidad: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icono && <span aria-hidden>{icono}</span>}
        {titulo}
        <span className="rounded-full bg-fondo px-2 text-sm font-bold text-texto-suave">{cantidad}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</ul>
    </section>
  );
}

export function TarjetaRegistro({
  href,
  franja,
  dibujo,
  titulo,
  subtitulo,
  inactivo,
  children,
}: {
  href: string;
  /** Color de la franja de arriba (una variable del tema, ej. "var(--etiqueta-verde)"). */
  franja: string;
  /** Un emoji o las iniciales, en el círculo de la izquierda. */
  dibujo: ReactNode;
  titulo: string;
  subtitulo?: ReactNode;
  inactivo?: boolean;
  children?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex h-full flex-col overflow-hidden rounded-lg bg-tarjeta text-tarjeta-texto shadow-tarjeta outline-offset-2 hover:bg-tarjeta-hover focus-visible:outline-2 focus-visible:outline-[var(--etiqueta-azul)] ${inactivo ? "opacity-60" : ""}`}
      >
        <span aria-hidden className="h-2 shrink-0" style={{ background: franja }} />
        <span className="flex flex-1 flex-col gap-2 p-3">
          <span className="flex items-start gap-3">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
              {dibujo}
            </span>
            <span className="min-w-0">
              <span className="block leading-snug font-semibold">
                {titulo}
                {inactivo && <span className="ml-2 rounded bg-black/10 px-1.5 text-xs font-semibold dark:bg-white/15">Desactivado</span>}
              </span>
              {subtitulo && <span className="block text-sm text-tarjeta-suave">{subtitulo}</span>}
            </span>
          </span>
          {children && <span className="flex flex-col gap-1.5 text-sm">{children}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Un dato de la tarjeta con su ícono: "📍 Av. Rivadavia 1234". */
export function Dato({ icono, children, destacado }: { icono: string; children: ReactNode; destacado?: boolean }) {
  return (
    <span className={`flex items-start gap-2 ${destacado ? "font-semibold" : "text-tarjeta-suave"}`}>
      <span aria-hidden className="w-4 shrink-0 text-center">
        {icono}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** "▦ Tarjetas | ☰ Lista", conservando los filtros de la pantalla. */
export function VistaTarjetasOLista({ vista, enlace }: { vista: "tarjetas" | "lista"; enlace: (vista: "tarjetas" | "lista") => string }) {
  const clases = (activa: boolean) => `min-h-10 rounded-md px-3 py-2 text-sm font-semibold ${activa ? "bg-superficie shadow-sm" : "text-texto-suave hover:text-texto"}`;
  return (
    <div role="tablist" aria-label="Cómo ver" className="flex rounded-lg bg-fondo p-1">
      <Link href={enlace("tarjetas")} role="tab" aria-selected={vista === "tarjetas"} className={clases(vista === "tarjetas")}>
        ▦ Tarjetas
      </Link>
      <Link href={enlace("lista")} role="tab" aria-selected={vista === "lista"} className={clases(vista === "lista")}>
        ☰ Lista
      </Link>
    </div>
  );
}
