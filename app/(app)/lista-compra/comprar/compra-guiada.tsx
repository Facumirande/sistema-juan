"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { ESTADO_INICIAL } from "@/ui/estado-accion";

import { comprarYSeguirAccion, resolverYSeguirAccion } from "../acciones";

// La compra de un producto de la lista, en una pantalla y con los dedos: puesto, cómo se paga, en
// qué envase, cuántos y a cuánto. "Guardar y seguir" anota la compra y pasa al producto que sigue.

export interface OfertaDeCompra {
  ofertaId: string;
  proveedorId: string;
  presentacionId: string;
  /** Precio cargado del envase en ese puesto. */
  precio: string;
  /** Cuánto trae el envase, en la unidad del producto. */
  factor: string;
}

interface Props {
  fecha: string;
  itemId: string;
  /** "kg", "u"… */
  unidad: string;
  proveedores: {
    id: string;
    nombre: string;
    aCuenta: boolean;
    loVende: boolean;
  }[];
  envases: { id: string; nombre: string; factor: string | null }[];
  ofertas: OfertaDeCompra[];
  sugerido: {
    proveedorId: string | null;
    envaseId: string | null;
    cantidad: string;
  };
  volver: string;
  siguiente: string;
  haySiguiente: boolean;
  puedeExceder: boolean;
}

const sinPesos = (v: string) => formatearMoneda(v).replace("$", "").trim();

export function CompraGuiada({
  fecha,
  itemId,
  unidad,
  proveedores,
  envases,
  ofertas,
  sugerido,
  volver,
  siguiente,
  haySiguiente,
  puedeExceder,
}: Props) {
  const [estado, enviar, enviando] = useActionState(
    comprarYSeguirAccion,
    ESTADO_INICIAL,
  );
  const [estadoRapido, resolver, resolviendo] = useActionState(
    resolverYSeguirAccion,
    ESTADO_INICIAL,
  );
  const [clave] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "",
  );
  const [proveedorId, setProveedorId] = useState(
    sugerido.proveedorId ?? "",
  );
  const [envaseId, setEnvaseId] = useState(
    sugerido.envaseId ?? envases[0]?.id ?? "",
  );
  const ofertaDe = (p: string, e: string) =>
    ofertas.find((o) => o.proveedorId === p && o.presentacionId === e) ?? null;
  const [cantidad, setCantidad] = useState(sugerido.cantidad);
  const [precio, setPrecio] = useState(() => {
    const o = ofertaDe(sugerido.proveedorId ?? "", sugerido.envaseId ?? "");
    return o ? sinPesos(o.precio) : "";
  });
  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  // Con puesto, a cuenta; sin puesto, pagado en efectivo (se puede cambiar; 10/10/2026).
  const [pago, setPago] = useState<"CUENTA" | "PAGADO">(
    proveedor ? "CUENTA" : "PAGADO",
  );
  const oferta = ofertaDe(proveedorId, envaseId);
  const envase = envases.find((e) => e.id === envaseId) ?? null;
  const factor = oferta?.factor ?? envase?.factor ?? null;
  const c = interpretarNumero(cantidad);
  const p = interpretarNumero(precio);
  const total = c && p ? c.times(p) : null;
  const porUnidad =
    p && factor && Number(factor) > 0 && Number(factor) !== 1
      ? p.div(factor)
      : null;
  const ocupado = enviando || resolviendo;

  const elegir = (nuevoProveedor: string, nuevoEnvase: string) => {
    setProveedorId(nuevoProveedor);
    setEnvaseId(nuevoEnvase);
    const o = ofertaDe(nuevoProveedor, nuevoEnvase);
    setPrecio(o ? sinPesos(o.precio) : "");
  };
  const elegirProveedor = (id: string) => {
    // Si ese puesto lo vende en otro envase, se pasa a ese.
    const suya =
      ofertaDe(id, envaseId) ??
      ofertas.find((o) => o.proveedorId === id) ??
      null;
    elegir(id, suya?.presentacionId ?? envaseId);
    setPago(id ? "CUENTA" : "PAGADO");
  };
  const sumar = (paso: number) => {
    const actual = c ? Number(c.toString()) : 0;
    setCantidad(
      formatearNumero(String(Math.max(0, actual + paso)), {
        decimales: 3,
        recortarCeros: true,
      }),
    );
  };

  const etiqueta =
    "text-sm font-semibold tracking-wide text-texto-suave uppercase";
  const mensaje = estado.mensaje ?? estadoRapido.mensaje;
  const confirmar = estado.requiereConfirmacion === true;

  return (
    <form action={enviar} className="flex flex-col gap-5">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="claveIdempotencia" value={clave} />
      <input
        type="hidden"
        name="puesto"
        value={
          oferta
            ? `oferta:${oferta.ofertaId}`
            : proveedorId
              ? `proveedor:${proveedorId}:${envaseId}`
              : `sinpuesto::${envaseId}`
        }
      />
      <input type="hidden" name="pago" value={proveedorId ? pago : "PAGADO"} />
      <input type="hidden" name="volver" value={volver} />
      <input type="hidden" name="siguiente" value={siguiente} />
      {confirmar && (
        <input type="hidden" name="confirmarVariacion" value="on" />
      )}

      <label className="flex flex-col gap-1.5">
        <span className={etiqueta}>Proveedor (puesto)</span>
        <select
          value={proveedorId}
          onChange={(e) => elegirProveedor(e.target.value)}
          className="h-14 rounded-xl border-2 border-borde bg-superficie px-3 text-lg font-semibold"
        >
          <option value="">Sin puesto (efectivo)</option>
          {proveedores.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
              {x.loVende ? "" : " (todavía sin precio cargado)"}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={etiqueta}>Forma de pago</span>
        <div
          className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-borde"
          role="group"
          aria-label="Forma de pago"
        >
          {(
            [
              ["PAGADO", "💵 Efectivo"],
              ["CUENTA", "📒 A cuenta"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setPago(valor)}
              aria-pressed={(proveedorId ? pago : "PAGADO") === valor}
              disabled={!proveedorId && valor === "CUENTA"}
              className={`min-h-14 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50 ${(proveedorId ? pago : "PAGADO") === valor ? "bg-marca text-marca-texto" : "bg-superficie"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <p className="text-sm text-texto-suave">
          {!proveedor
            ? "Sin puesto: queda pagada en efectivo."
            : pago === "CUENTA"
            ? `A cuenta: esta compra se suma a lo que le debemos a ${proveedor.nombre}.`
            : "En efectivo: queda pagada, no suma deuda."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={etiqueta}>Presentación (envase)</span>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="En qué envase lo comprás"
        >
          {envases.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => elegir(proveedorId, e.id)}
              aria-pressed={envaseId === e.id}
              className={`min-h-12 rounded-full border-2 px-5 text-lg font-bold ${envaseId === e.id ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cantidad" className={etiqueta}>
          Cantidad
        </label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-borde bg-superficie p-1.5">
          <button
            type="button"
            onClick={() => sumar(-1)}
            aria-label="Uno menos"
            className="flex size-14 shrink-0 items-center justify-center rounded-lg text-4xl leading-none font-bold text-marca hover:bg-fondo"
          >
            −
          </button>
          <input
            id="cantidad"
            name="cantidad"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="h-14 min-w-0 flex-1 bg-transparent text-center text-3xl font-bold tabular-nums"
          />
          <button
            type="button"
            onClick={() => sumar(1)}
            aria-label="Uno más"
            className="flex size-14 shrink-0 items-center justify-center rounded-lg text-4xl leading-none font-bold text-marca hover:bg-fondo"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="precio" className={etiqueta}>
          Precio por {envase?.nombre.toLowerCase() ?? "envase"}
        </label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-borde bg-superficie px-4">
          <span aria-hidden className="text-3xl font-bold text-texto-suave">
            $
          </span>
          <input
            id="precio"
            name="precio"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="0"
            className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums"
          />
        </div>
        <p className="flex flex-wrap justify-between gap-x-4 text-sm text-texto-suave">
          <span>
            {oferta
              ? `Último precio cargado: ${formatearMoneda(oferta.precio)}`
              : "Este puesto todavía no tiene precio cargado: queda guardado con esta compra."}
          </span>
          {porUnidad && (
            <span>
              {formatearMoneda(porUnidad.toString())} por {unidad}
            </span>
          )}
        </p>
      </div>

      {puedeExceder && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-texto-suave">
            Si pasa el límite de crédito del puesto
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="exceder" className="size-5" />{" "}
              Anotarla igual
            </label>
            <input
              name="motivoExceso"
              placeholder="Por qué (ej. hay que abastecer al hospital)"
              className="h-11 rounded-lg border border-borde bg-superficie px-3"
            />
          </div>
        </details>
      )}

      {mensaje && (
        <p
          role="alert"
          className="rounded-xl bg-error/10 px-4 py-3 font-medium text-error"
        >
          {mensaje}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-borde bg-fondo px-4 py-3">
        <p className="flex items-baseline justify-between gap-3 text-lg">
          Total de esta compra{" "}
          <b className="text-3xl tabular-nums">
            {total ? formatearMoneda(total.toString()) : "$ —"}
          </b>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="submit"
            name="despues"
            value="volver"
            disabled={ocupado}
            className="min-h-14 rounded-xl border-2 border-borde bg-superficie text-lg font-bold disabled:animate-pulse disabled:opacity-60"
          >
            {enviando
              ? "Guardando…"
              : confirmar
                ? "✓ Confirmar"
                : "Guardar"}
          </button>
          <button
            type="submit"
            name="despues"
            value="seguir"
            disabled={ocupado}
            className="min-h-14 rounded-xl bg-marca text-lg font-bold text-marca-texto disabled:animate-pulse disabled:opacity-60"
          >
            {haySiguiente ? "Guardar y seguir\u00a0→" : "Guardar y terminar ✓"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm font-medium">
        <button
          type="submit"
          formAction={resolver}
          name="que"
          value="si"
          disabled={ocupado}
          className="min-h-10 underline underline-offset-4"
        >
          ☑ Ya lo compré (sin anotar precio)
        </button>
        <button
          type="submit"
          formAction={resolver}
          name="que"
          value="no"
          disabled={ocupado}
          className="min-h-10 text-error underline underline-offset-4"
        >
          ✕ No lo conseguí
        </button>
        {haySiguiente && (
          <Link
            href={siguiente}
            className="flex min-h-10 items-center underline underline-offset-4"
          >
            Saltear por ahora&nbsp;→
          </Link>
        )}
      </div>
    </form>
  );
}
