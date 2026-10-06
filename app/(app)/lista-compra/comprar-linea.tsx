"use client";

import { useState } from "react";

import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { FormularioAccion } from "@/ui/formulario-accion";

import { comprarDeLaListaAccion } from "./acciones";

// "✓ Lo compré" de una línea de la lista: en qué puesto, cuántos bultos, a cuánto y cómo se pagó.
// Arranca con lo que sugiere la lista (puesto, cantidad y precio): casi siempre alcanza con tocar
// "Anotar la compra".

export interface OfertaDeCompra {
  ofertaId: string;
  proveedorId: string;
  proveedor: string;
  ubicacion: string | null;
  condicionHabitual: string;
  presentacionId: string;
  presentacion: string;
  precio: string;
}

const OTRO = "otro";

export function ComprarLinea({
  itemId,
  producto,
  cantidadSugerida,
  ofertas,
  ofertaSugeridaId,
  proveedores,
  envases,
  puedeExceder,
  secundario = false,
}: {
  /** Para un producto ya tildado: el botón es chico y dice "Anotar puesto y precio". */
  secundario?: boolean;
  itemId: string;
  producto: string;
  cantidadSugerida: string;
  ofertas: OfertaDeCompra[];
  ofertaSugeridaId: string | null;
  proveedores: { id: string; nombre: string; condicionHabitual: string }[];
  envases: { id: string; nombre: string }[];
  puedeExceder: boolean;
}) {
  const inicial = ofertas.find((o) => o.ofertaId === ofertaSugeridaId) ?? ofertas[0] ?? null;
  const [abierto, setAbierto] = useState(false);
  const [clave] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  const [puesto, setPuesto] = useState(inicial ? inicial.ofertaId : OTRO);
  const [otroProveedor, setOtroProveedor] = useState(proveedores[0]?.id ?? "");
  const [otroEnvase, setOtroEnvase] = useState(envases[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(cantidadSugerida);
  const [precio, setPrecio] = useState(inicial ? formatearMoneda(inicial.precio).replace("$", "") : "");
  const oferta = ofertas.find((o) => o.ofertaId === puesto) ?? null;
  const condicion = oferta?.condicionHabitual ?? proveedores.find((p) => p.id === otroProveedor)?.condicionHabitual ?? "CREDITO";
  const [pago, setPago] = useState<"CUENTA" | "PAGADO">(condicion === "CONTADO" ? "PAGADO" : "CUENTA");
  const c = interpretarNumero(cantidad);
  const p = interpretarNumero(precio);
  const total = c && p ? c.times(p) : null;
  const envase = oferta?.presentacion ?? envases.find((e) => e.id === otroEnvase)?.nombre ?? "bultos";

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={secundario ? "min-h-11 rounded-xl border-2 border-borde bg-superficie px-4 font-semibold hover:border-marca/60" : "min-h-12 rounded-xl bg-marca px-5 text-lg font-semibold text-marca-texto"}
      >
        {secundario ? "🧾 Anotar puesto y precio" : "✓ Lo compré"}
      </button>
    );
  }
  return (
    <FormularioAccion accion={comprarDeLaListaAccion} boton="Anotar la compra" className="flex w-full flex-col gap-3 rounded-xl border-2 border-marca bg-marca/5 p-4">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="claveIdempotencia" value={clave} />
      <input type="hidden" name="puesto" value={oferta ? `oferta:${oferta.ofertaId}` : `proveedor:${otroProveedor}:${otroEnvase}`} />
      <input type="hidden" name="pago" value={pago} />
      <p className="font-semibold">¿Cómo compraste {producto.toLowerCase()}?</p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">¿En qué puesto?</span>
        <select
          value={puesto}
          onChange={(e) => {
            setPuesto(e.target.value);
            const o = ofertas.find((x) => x.ofertaId === e.target.value);
            if (o) {
              setPrecio(formatearMoneda(o.precio).replace("$", ""));
              setPago(o.condicionHabitual === "CONTADO" ? "PAGADO" : "CUENTA");
            } else setPrecio("");
          }}
          className="h-12 rounded-lg border-2 border-borde bg-superficie px-2 text-base"
        >
          {ofertas.map((o) => (
            <option key={o.ofertaId} value={o.ofertaId}>
              {o.proveedor} · {o.presentacion} · {formatearMoneda(o.precio)}
            </option>
          ))}
          <option value={OTRO}>Otro puesto…</option>
        </select>
      </label>
      {!oferta && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Puesto</span>
            <select value={otroProveedor} onChange={(e) => setOtroProveedor(e.target.value)} className="h-12 rounded-lg border-2 border-borde bg-superficie px-2 text-base">
              {proveedores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Envase</span>
            <select value={otroEnvase} onChange={(e) => setOtroEnvase(e.target.value)} className="h-12 rounded-lg border-2 border-borde bg-superficie px-2 text-base">
              {envases.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Cuántos ({envase.toLowerCase()})</span>
          <input name="cantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="h-12 rounded-lg border-2 border-borde bg-superficie px-3 text-lg" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">A cuánto cada uno ($)</span>
          <input name="precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej. 12.000" className="h-12 rounded-lg border-2 border-borde bg-superficie px-3 text-lg" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cómo se pagó">
        <button type="button" onClick={() => setPago("CUENTA")} aria-pressed={pago === "CUENTA"} className={`min-h-11 rounded-xl border-2 px-4 font-semibold ${pago === "CUENTA" ? "border-marca bg-marca/10" : "border-borde"}`}>
          📒 Queda a cuenta
        </button>
        <button type="button" onClick={() => setPago("PAGADO")} aria-pressed={pago === "PAGADO"} className={`min-h-11 rounded-xl border-2 px-4 font-semibold ${pago === "PAGADO" ? "border-marca bg-marca/10" : "border-borde"}`}>
          💵 Le pagué en efectivo
        </button>
      </div>
      {total && <p className="text-lg">Total: <b>{formatearMoneda(total)}</b></p>}
      {puedeExceder && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Si pasa el límite de crédito del puesto</summary>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="exceder" className="size-5" /> Anotarla igual
            </label>
            <input name="motivoExceso" placeholder="Por qué (ej. hay que abastecer al hospital)" className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          </div>
        </details>
      )}
      <button type="button" onClick={() => setAbierto(false)} className="self-start text-sm font-medium underline underline-offset-2">
        Cancelar
      </button>
    </FormularioAccion>
  );
}
