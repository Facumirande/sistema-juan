"use client";

import { useActionState, useState } from "react";

import { ESTADO_INICIAL } from "@/ui/estado-accion";

import { ponerPrecioAccion } from "./acciones";

// "💲 Ponerle precio" en la tarjeta abierta (pedido del usuario, 10/10/2026): un producto que todavía
// no tiene precio (recién se sabe en el mercado) se puede tasar ahí mismo, en cualquier paso antes de
// entregarlo. Sin precio, el remito no se puede hacer; con esto se destraba.

export function PrecioSobreLaMarcha({ lineas }: { lineas: { id: string; producto: string; unidad: string }[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-[var(--pronto-fondo)] bg-[var(--pronto-fondo)]/25 p-3">
      <p className="font-bold">💲 {lineas.length === 1 ? "1 producto sin precio" : `${lineas.length} productos sin precio`}</p>
      <p className="text-sm text-tarjeta-suave">Ponele el precio de venta y queda para este pedido (el remito lo necesita).</p>
      <ul className="flex flex-col gap-2">
        {lineas.map((l) => (
          <Linea key={l.id} linea={l} />
        ))}
      </ul>
    </div>
  );
}

function Linea({ linea }: { linea: { id: string; producto: string; unidad: string } }) {
  const [estado, enviar, enviando] = useActionState(ponerPrecioAccion, ESTADO_INICIAL);
  const [precio, setPrecio] = useState("");
  return (
    <li>
      <form action={enviar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="itemId" value={linea.id} />
        <span className="min-w-0 flex-1 basis-32 font-semibold">{linea.producto}</span>
        <label className="flex items-center gap-1">
          <span aria-hidden className="text-lg font-bold">
            $
          </span>
          <input
            name="precio"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            required
            placeholder="0"
            aria-label={`Precio de venta de ${linea.producto} por ${linea.unidad}`}
            className="h-11 w-28 rounded-lg border-2 border-borde bg-superficie px-2 text-lg tabular-nums"
          />
          <span className="text-sm text-tarjeta-suave">por {linea.unidad}</span>
        </label>
        <button type="submit" disabled={enviando || !precio.trim()} className="min-h-11 rounded-lg bg-marca px-4 font-bold text-marca-texto disabled:opacity-60">
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {estado.mensaje && !estado.ok && <p className="mt-1 text-sm font-medium text-error">{estado.mensaje}</p>}
    </li>
  );
}
