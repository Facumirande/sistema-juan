"use client";

import { useState } from "react";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { FormularioAccion } from "@/ui/formulario-accion";

import { registrarCompraAccion } from "../acciones";

// Registrar una compra en un puesto: arranca con lo que la lista dice comprarle ahí (ya con
// cantidades y precios) y se agregan otros productos solo si hace falta, con "＋ Agregar otro
// producto". Nada de renglones vacíos de relleno. Abajo, cómo se pagó, con el total a la vista.

export interface ProductoDeCompra {
  productoId: string;
  presentacionId: string;
  producto: string;
  presentacion: string;
  /** Precio que se le pagó la última vez en este puesto (sugerido). */
  precio: string;
}

interface Renglon extends ProductoDeCompra {
  clave: string;
  cantidad: string;
  delPlan: boolean;
}

type Condicion = "CONTADO" | "CREDITO" | "MIXTA";

const COMO_SE_PAGA: readonly { valor: Condicion; texto: string; ayuda: string }[] = [
  { valor: "CONTADO", texto: "💵 Pagué todo", ayuda: "Se paga ahora: no queda deuda." },
  { valor: "CREDITO", texto: "📒 Queda a cuenta", ayuda: "No se paga nada ahora: se suma a lo que se le debe." },
  { valor: "MIXTA", texto: "✂️ Pagué una parte", ayuda: "Se paga una parte y el resto queda a cuenta." },
];

const MEDIOS: readonly { valor: string; texto: string }[] = [
  { valor: "EFECTIVO", texto: "Efectivo" },
  { valor: "TRANSFERENCIA", texto: "Transferencia" },
  { valor: "CHEQUE", texto: "Cheque" },
  { valor: "OTRO", texto: "Otro" },
];

let siguiente = 0;
const nuevaClave = () => `r${++siguiente}`;
const clavePP = (p: Pick<ProductoDeCompra, "productoId" | "presentacionId">) => `${p.productoId}:${p.presentacionId}`;

export function FormularioCompra({
  fecha,
  proveedorId,
  claveIdempotencia,
  condicionHabitual,
  delPlan,
  delPuesto,
  todos,
  puedeExceder,
}: {
  fecha: string;
  proveedorId: string;
  claveIdempotencia: string;
  condicionHabitual: Condicion;
  /** Lo que la lista dice comprarle a este puesto, con la cantidad y el precio sugeridos. */
  delPlan: (ProductoDeCompra & { cantidad: string })[];
  /** Otros productos que vende este puesto (con su último precio). */
  delPuesto: ProductoDeCompra[];
  /** Todos los productos, para lo que no se le compra habitualmente. */
  todos: Omit<ProductoDeCompra, "precio">[];
  puedeExceder: boolean;
}) {
  const [renglones, setRenglones] = useState<Renglon[]>(() => delPlan.map((p) => ({ ...p, clave: nuevaClave(), delPlan: true })));
  const [eligiendo, setEligiendo] = useState(delPlan.length === 0);
  const [condicion, setCondicion] = useState<Condicion>(condicionHabitual);
  const [medio, setMedio] = useState("EFECTIVO");

  const usados = new Set(renglones.map(clavePP));
  const sugeridos = delPuesto.filter((p) => !usados.has(clavePP(p)));
  const importes = renglones.map((r) => {
    const cantidad = interpretarNumero(r.cantidad);
    const precio = interpretarNumero(r.precio);
    return cantidad && precio ? cantidad.times(precio) : dec(0);
  });
  const total = sumar(importes);

  const agregar = (p: ProductoDeCompra) => {
    setRenglones((previos) => [...previos, { ...p, clave: nuevaClave(), cantidad: "", delPlan: false }]);
    setEligiendo(false);
  };
  const cambiar = (clave: string, cambios: Partial<Renglon>) => setRenglones((previos) => previos.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)));
  const quitar = (clave: string) => setRenglones((previos) => previos.filter((r) => r.clave !== clave));

  return (
    <FormularioAccion accion={registrarCompraAccion} boton="Registrar la compra" className="flex flex-col gap-6">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="proveedorId" value={proveedorId} />
      <input type="hidden" name="claveIdempotencia" value={claveIdempotencia} />
      <input type="hidden" name="condicion" value={condicion} />
      <input type="hidden" name="medioPago" value={medio} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1. ¿Qué compraste?</h2>
        {renglones.length === 0 ? (
          <p className="rounded-xl bg-fondo p-4 text-texto-suave">Todavía no hay productos. Tocá “Agregar un producto” y elegí lo que compraste.</p>
        ) : (
          <p className="text-texto-suave">Revisá cuántos bultos compraste y a cuánto cada uno. Si algo no lo compraste, sacalo con ✕.</p>
        )}
        <ul className="flex flex-col gap-3">
          {renglones.map((r, n) => (
            <li key={r.clave} className={`flex flex-col gap-3 rounded-xl border-2 p-4 ${r.delPlan ? "border-marca/60" : "border-borde"}`}>
              <input type="hidden" name={`item_${n}_producto`} value={r.productoId} />
              <input type="hidden" name={`item_${n}_presentacion`} value={r.presentacionId} />
              <div className="flex items-center gap-3">
                <span aria-hidden className="text-3xl leading-none">
                  {dibujoDeProducto(r.producto)}
                </span>
                <p className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{r.producto}</span>
                  <span className="text-texto-suave">
                    {r.presentacion}
                    {r.delPlan && " · de la lista de compras"}
                  </span>
                </p>
                <button type="button" onClick={() => quitar(r.clave)} aria-label={`Sacar ${r.producto}`} className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl hover:bg-fondo">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Cuántos ({r.presentacion.toLowerCase()})</span>
                  <input
                    name={`item_${n}_cantidad`}
                    value={r.cantidad}
                    onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-12 rounded-lg border-2 border-borde bg-superficie px-3 text-lg"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Precio de cada uno ($)</span>
                  <input
                    name={`item_${n}_precio`}
                    value={r.precio}
                    onChange={(e) => cambiar(r.clave, { precio: e.target.value })}
                    inputMode="decimal"
                    placeholder="Ej. 12.000"
                    className="h-12 rounded-lg border-2 border-borde bg-superficie px-3 text-lg"
                  />
                </label>
              </div>
              {importes[n]!.gt(0) && <p className="text-right font-semibold">= {formatearMoneda(importes[n]!)}</p>}
            </li>
          ))}
        </ul>

        {eligiendo ? (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-marca p-4">
            <p className="font-semibold">¿Qué otro producto compraste?</p>
            {sugeridos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sugeridos.map((p) => (
                  <button key={clavePP(p)} type="button" onClick={() => agregar(p)} className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-borde bg-superficie px-3 text-left hover:border-marca">
                    <span aria-hidden className="text-2xl">
                      {dibujoDeProducto(p.producto)}
                    </span>
                    <span>
                      <span className="block font-semibold">{p.producto}</span>
                      <span className="text-sm text-texto-suave">
                        {p.presentacion}
                        {p.precio && ` · $${p.precio}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{sugeridos.length > 0 ? "O buscalo entre todos los productos" : "Elegilo entre todos los productos"}</span>
              <select
                defaultValue=""
                onChange={(e) => {
                  const p = todos.find((x) => clavePP(x) === e.target.value);
                  if (p) agregar({ ...p, precio: delPuesto.find((x) => clavePP(x) === clavePP(p))?.precio ?? "" });
                }}
                className="h-12 rounded-lg border-2 border-borde bg-superficie px-2 text-base"
              >
                <option value="" disabled>
                  Elegí el producto…
                </option>
                {todos
                  .filter((p) => !usados.has(clavePP(p)))
                  .map((p) => (
                    <option key={clavePP(p)} value={clavePP(p)}>
                      {p.producto} · {p.presentacion}
                    </option>
                  ))}
              </select>
            </label>
            {renglones.length > 0 && (
              <button type="button" onClick={() => setEligiendo(false)} className="self-start text-sm font-medium underline underline-offset-2">
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setEligiendo(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borde font-semibold hover:border-marca">
            ＋ {renglones.length === 0 ? "Agregar un producto" : "Agregar otro producto"}
          </button>
        )}
        <p className="text-right text-xl">
          Total de la compra: <b>{formatearMoneda(total)}</b>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. ¿Cómo pagaste?</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {COMO_SE_PAGA.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setCondicion(c.valor)}
              aria-pressed={condicion === c.valor}
              className={`flex min-h-16 flex-col items-start justify-center rounded-xl border-2 px-4 py-2 text-left ${condicion === c.valor ? "border-marca bg-marca/10" : "border-borde"}`}
            >
              <span className="font-semibold">{c.texto}</span>
              <span className="text-sm text-texto-suave">{c.ayuda}</span>
            </button>
          ))}
        </div>
        {condicion !== "CREDITO" && (
          <div className="flex flex-wrap items-end gap-3">
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-medium">Con qué</legend>
              <div className="flex flex-wrap gap-2">
                {MEDIOS.map((m) => (
                  <button key={m.valor} type="button" onClick={() => setMedio(m.valor)} aria-pressed={medio === m.valor} className={`min-h-11 rounded-full border-2 px-4 font-semibold ${medio === m.valor ? "border-marca bg-marca/10" : "border-borde"}`}>
                    {m.texto}
                  </button>
                ))}
              </div>
            </fieldset>
            {condicion === "MIXTA" && (
              <label className="flex flex-col gap-1">
                <span className="font-medium">¿Cuánto pagaste ahora? ($)</span>
                <input name="pagadoEnElActo" inputMode="decimal" placeholder="Ej. 50.000" className="h-12 w-44 rounded-lg border-2 border-borde bg-superficie px-3 text-lg" />
              </label>
            )}
          </div>
        )}
      </section>

      <details className="rounded-xl border border-borde p-4">
        <summary className="cursor-pointer font-semibold">Más datos (opcional): número de boleta y notas</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium">N.º de boleta</span>
            <input name="numeroComprobante" className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Notas</span>
            <textarea name="observaciones" rows={2} className="rounded-lg border border-borde bg-superficie px-3 py-2" />
          </label>
          {puedeExceder && (
            <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3">
              <p className="text-sm text-texto-suave">Si esta compra hace pasar el límite de crédito del puesto, el sistema la frena. Para registrarla igual, tildá y explicá por qué.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="exceder" className="size-5" /> Registrarla aunque pase el límite
              </label>
              <input name="motivoExceso" placeholder="Por qué (ej. hay que abastecer al hospital)" className="h-11 rounded-lg border border-borde bg-superficie px-3" />
            </div>
          )}
        </div>
      </details>
    </FormularioAccion>
  );
}
