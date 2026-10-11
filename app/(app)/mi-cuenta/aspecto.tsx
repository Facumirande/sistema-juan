"use client";

import type { AspectoDeTarjetas, PreferenciaDeTema } from "@/dominio/aspecto/aspecto";
import { elegirTarjetas, elegirTema, useAspecto } from "@/ui/aspecto";

// Mi cuenta → Aspecto (pedido del usuario, 11/10/2026): el modo claro u oscuro (lo mismo que el
// interruptor de la barra, más "como el aparato") y las tarjetas del tablero en colores o neutras.
// Cambia en el momento, sin botón de guardar, y queda en este aparato.

const MODOS: readonly { valor: PreferenciaDeTema; dibujo: string; titulo: string }[] = [
  { valor: "claro", dibujo: "☀️", titulo: "Claro" },
  { valor: "oscuro", dibujo: "🌙", titulo: "Oscuro" },
  { valor: "sistema", dibujo: "📱", titulo: "Como el aparato" },
];

const TARJETAS: readonly { valor: AspectoDeTarjetas; dibujo: string; titulo: string }[] = [
  { valor: "color", dibujo: "🎨", titulo: "En colores" },
  { valor: "neutro", dibujo: "◻️", titulo: "Neutras" },
];

const opcion = (elegida: boolean) =>
  // El dibujo arriba y el nombre debajo: así "Como el aparato" entra bien en el celular, en uno o dos renglones.
  `flex min-h-16 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-center leading-tight font-semibold ${elegida ? "border-marca bg-marca/15" : "border-borde hover:border-marca"}`;

export function Aspecto() {
  const { preferencia, tarjetas } = useAspecto();
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Modo</legend>
        <div className="flex gap-2">
          {MODOS.map((m) => (
            <button key={m.valor} type="button" aria-pressed={preferencia === m.valor} onClick={() => elegirTema(m.valor)} className={opcion(preferencia === m.valor)}>
              <span aria-hidden className="text-xl leading-none">
                {m.dibujo}
              </span>
              {m.titulo}
            </button>
          ))}
        </div>
        <p className="text-sm text-texto-suave">También se cambia con el interruptor de arriba, al lado de la campanita.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Tarjetas del tablero</legend>
        <div className="flex gap-2">
          {TARJETAS.map((t) => (
            <button key={t.valor} type="button" aria-pressed={tarjetas === t.valor} onClick={() => elegirTarjetas(t.valor)} className={opcion(tarjetas === t.valor)}>
              <span aria-hidden className="text-xl leading-none">
                {t.dibujo}
              </span>
              {t.titulo}
            </button>
          ))}
        </div>
        {/* Una columna de muestra con su tarjeta: las mismas clases del tablero, así se ve cómo queda. */}
        <div aria-hidden className="de-etapa color-violeta flex flex-col gap-2 rounded-2xl bg-[var(--col)] p-2.5 text-[var(--col-texto)]">
          <p className="px-1 leading-tight font-extrabold">Lista de compras</p>
          <div className="overflow-hidden rounded-xl bg-tarjeta text-tarjeta-texto shadow-tarjeta">
            <p className="bg-[var(--col-fuerte)] px-3 py-1.5 leading-tight font-bold text-[var(--col-fuerte-texto)]">Hospital San Martín</p>
            <div className="flex flex-col gap-2 p-2.5">
              <p className="rounded-lg bg-[var(--col-claro)] px-2.5 py-1.5 leading-tight font-bold text-[var(--col-claro-texto)]">🧺 5 productos</p>
              <p className="flex justify-between gap-2 text-sm text-tarjeta-suave">
                <span>☑ 3/5 comprado</span>
                <span className="font-semibold text-tarjeta-texto">$486.840</span>
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm text-texto-suave">{tarjetas === "neutro" ? "Las columnas y las tarjetas van sin el color de cada etapa." : "Cada etapa del día con su color."}</p>
      </fieldset>

      <p className="text-sm text-texto-suave">Queda guardado en este aparato: el celular puede estar en claro y la computadora en oscuro.</p>
    </div>
  );
}
