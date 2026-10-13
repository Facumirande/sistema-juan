"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";

import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { ESTADO_INICIAL } from "@/ui/estado-accion";
import { EntradaQueSePisa } from "@/ui/numero-que-se-pisa";

import { guardarCajaInicialAccion } from "./acciones";

// El resumen balance (pedido del usuario, 10 y 11/10/2026): el cartel de arriba del tablero, con el
// día que se mira en tres apartados. Uno con lo Pagado y, debajo, el Crédito (lo retirado que falta
// pagar); otro con la Ganancia (lo ya cobrado menos lo pagado) y, debajo, lo que falta cobrar; y a
// la derecha la Caja inicial, la plata con la que se cuenta, que se carga tocándola. "A cobrar" cuenta
// desde que se compra lo del pedido, antes de entregarlo (RN-198). Son apartados
// distintos: no se suman a la vista. Si los gastos del día superan la caja, el cartel lo avisa en
// rojo (y la campanita también). Se pone al día solo con cada cambio. La cuenta está en
// `src/dominio/reportes/resumen-balance.ts` (RN-180, RN-194).

export interface ResumenParaVer {
  fecha: string;
  pagado: string;
  credito: string;
  ganancia: string;
  aCobrar: string;
  cajaInicial: string | null;
  exceso: string | null;
  /** Puede cargar o cambiar la caja inicial (tiene el permiso y el día no está cerrado). */
  editable: boolean;
}

/** Los cuatro números, de a dos por apartado: el de arriba y el de abajo. */
const APARTADOS = [
  [
    { clave: "pagado", titulo: "Pagado", ayuda: "Lo que ya se pagó: las compras de este día pagadas y los gastos de esta fecha.", color: "text-[#ffb3a7]" },
    { clave: "credito", titulo: "Crédito", ayuda: "Lo que se retiró de los proveedores este día y todavía falta pagar.", color: "text-[#ffd96a]" },
  ],
  [
    { clave: "ganancia", titulo: "Ganancia", ayuda: "Lo que ya se cobró de lo entregado este día, menos lo pagado.", color: "text-[#86efc3]" },
    { clave: "aCobrar", titulo: "A cobrar", ayuda: "Lo que falta cobrar de este día: lo entregado y lo ya comprado que está por entregarse.", color: "text-[#a9d4ff]" },
  ],
] as const;

const AYUDA_CAJA = "La plata con la que contás este día.";

/** El color de cada número; la ganancia en negativo (salió más plata de la que volvió) va en el de lo pagado. */
const colorDe = (a: (typeof APARTADOS)[number][number], r: ResumenParaVer) => (a.clave === "ganancia" && r.ganancia.startsWith("-") ? "text-[#ffb3a7]" : a.color);

/** El recuadro para escribir la caja inicial: se abre debajo del cartel, sin tapar el tablero entero. */
function EditorDeCaja({ resumen, cerrar }: { resumen: ResumenParaVer; cerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const caja = useRef<HTMLFormElement>(null);
  const id = useId();

  useEffect(() => {
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [cerrar]);

  const guardar = (monto: string) => {
    const datos = new FormData();
    datos.set("fecha", resumen.fecha);
    datos.set("monto", monto);
    empezar(async () => {
      const r = await guardarCajaInicialAccion(ESTADO_INICIAL, datos);
      if (r.ok) cerrar();
      else setError(r.mensaje ?? "No se pudo guardar: revisá la conexión y probá de nuevo.");
    });
  };
  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const monto = String(new FormData(e.currentTarget).get("monto") ?? "").trim();
    if (!monto) {
      setError("Escribí la plata con la que contás (ej. 500.000).");
      return;
    }
    guardar(monto);
  };

  return (
    <form
      ref={caja}
      onSubmit={alEnviar}
      // Mientras está abierto, la pantalla no se redibuja sola (se perdería lo escrito).
      data-no-redibujar
      aria-busy={guardando}
      className="absolute top-full right-0 z-40 mt-2 flex w-[min(21rem,calc(100vw-1.5rem))] flex-col gap-2.5 rounded-2xl bg-superficie p-3 text-left text-texto shadow-2xl ring-1 ring-black/15"
    >
      <label htmlFor={id} className="leading-tight font-bold">
        💰 Caja inicial del {resumen.fecha.slice(8, 10)}/{resumen.fecha.slice(5, 7)}
        <span className="block text-sm font-normal text-texto-suave">La plata con la que contás ese día.</span>
      </label>
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-2xl font-bold">
          $
        </span>
        <EntradaQueSePisa
          id={id}
          name="monto"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          defaultValue={resumen.cajaInicial === null ? "" : formatearNumero(resumen.cajaInicial, { decimales: 0 })}
          placeholder="Ej. 500.000"
          aria-invalid={error ? true : undefined}
          onInput={() => setError(null)}
          className="h-12 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3 text-2xl font-bold tabular-nums"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className="min-h-12 flex-1 rounded-xl bg-marca px-4 text-lg font-bold text-marca-texto disabled:animate-pulse disabled:opacity-70">
          {guardando ? "Un momento…" : "Guardar"}
        </button>
        {resumen.cajaInicial !== null && (
          <button type="button" disabled={guardando} onClick={() => guardar("")} title="Dejarla sin cargar" className="min-h-12 rounded-xl border-2 border-borde px-3 font-semibold disabled:opacity-60">
            Quitar
          </button>
        )}
        <button type="button" onClick={cerrar} className="min-h-12 rounded-xl px-3 font-semibold hover:bg-fondo">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** La franja roja: los gastos superaron la caja inicial. */
function AvisoDeExceso({ exceso, chico = false }: { exceso: string; chico?: boolean }) {
  return (
    <p role="alert" className={`bg-[var(--vence-fondo)] text-center leading-tight font-bold text-[var(--vence-texto)] ${chico ? "px-2 py-1 text-xs" : "px-3 py-1 text-sm"}`}>
      ⚠ Los gastos superan la caja inicial por {formatearMoneda(exceso)}
    </p>
  );
}

/** Qué se lee en el recuadro de la caja: el importe o, si falta, cómo cargarla. */
function valorDeCaja(r: ResumenParaVer): string {
  if (r.cajaInicial !== null) return formatearMoneda(r.cajaInicial);
  return r.editable ? "＋ Cargar" : "Sin cargar";
}

/**
 * En la computadora, en el encabezado: Pagado sobre Crédito, Ganancia sobre A cobrar y, en el
 * recuadro de la derecha, la Caja inicial. Cada número se achica solo si no entra en su lugar.
 */
export function ResumenBalanceGrande({ resumen }: { resumen: ResumenParaVer }) {
  const [editando, setEditando] = useState(false);
  const numero = "leading-tight font-black whitespace-nowrap tabular-nums";
  const celda = "@container flex min-w-0 flex-col items-center justify-center px-2 py-1.5 text-center";
  const cajaAdentro = (
    <>
      {/* El título se achica con el recuadro para entrar siempre en un renglón, con su lápiz. */}
      <span className="flex items-center gap-1 text-[clamp(0.62rem,7.2cqw,0.875rem)] leading-tight font-bold whitespace-nowrap uppercase opacity-90">
        <span aria-hidden>💰</span>
        Caja inicial
        {resumen.editable && (
          <span aria-hidden className="opacity-80">
            ✎
          </span>
        )}
      </span>
      <span className={`${numero} px-1 ${resumen.cajaInicial === null ? "text-[clamp(0.95rem,11cqw,1.5rem)] opacity-90" : "text-[clamp(1.05rem,15cqw,2.2rem)]"}`}>{valorDeCaja(resumen)}</span>
    </>
  );
  return (
    <section aria-label="Resumen balance del día" className="relative w-full max-w-[52rem] min-w-[30rem] flex-1">
      <div className={`overflow-hidden rounded-xl bg-black/35 text-white ring-1 ${resumen.exceso ? "ring-2 ring-[var(--vence-fondo)]" : "ring-white/15"}`}>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] divide-x divide-white/20">
          {APARTADOS.map((apartado) => (
            <dl key={apartado[0].clave} className="@container flex min-w-0 flex-col justify-center gap-0.5 px-3 py-1.5">
              {apartado.map((a) => (
                <div key={a.clave} className="flex items-baseline justify-between gap-2" title={a.ayuda}>
                  <dt className="text-[clamp(0.62rem,5.6cqw,0.8rem)] leading-tight font-bold tracking-wide whitespace-nowrap uppercase opacity-90">{a.titulo}</dt>
                  <dd className={`${numero} text-[clamp(0.95rem,9cqw,1.55rem)] ${colorDe(a, resumen)}`}>{formatearMoneda(resumen[a.clave])}</dd>
                </div>
              ))}
            </dl>
          ))}
          {resumen.editable ? (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-haspopup="dialog"
              aria-expanded={editando}
              title={`${AYUDA_CAJA} Tocá para ${resumen.cajaInicial === null ? "cargarla" : "cambiarla"}.`}
              className={`${celda} bg-white/10 hover:bg-white/20`}
            >
              {cajaAdentro}
            </button>
          ) : (
            <p className={`${celda} bg-white/10`} title={AYUDA_CAJA}>
              {cajaAdentro}
            </p>
          )}
        </div>
        {resumen.exceso && <AvisoDeExceso exceso={resumen.exceso} />}
      </div>
      {editando && <EditorDeCaja resumen={resumen} cerrar={() => setEditando(false)} />}
    </section>
  );
}

/**
 * En el celular, arriba del tablero: los mismos tres apartados, en letra normal. En cada uno, el
 * nombre chico y su importe un poco más grande; el de arriba y el de abajo, uno debajo del otro.
 */
export function ResumenBalanceChico({ resumen }: { resumen: ResumenParaVer }) {
  const [editando, setEditando] = useState(false);
  const titulo = "text-[clamp(0.66rem,10.5cqw,0.8rem)] leading-tight font-semibold opacity-90";
  const cajaAdentro = (
    <>
      <span className={`${titulo} whitespace-nowrap`}>
        <span aria-hidden>💰</span> Caja inicial
        {resumen.editable && (
          <span aria-hidden className="opacity-80">
            {" "}
            ✎
          </span>
        )}
      </span>
      <span className={`leading-tight font-black whitespace-nowrap tabular-nums ${resumen.cajaInicial === null ? "text-[clamp(0.8rem,12.5cqw,1rem)] opacity-90" : "text-[clamp(0.85rem,14.5cqw,1.2rem)]"}`}>{valorDeCaja(resumen)}</span>
    </>
  );
  const celdaCaja = "@container flex min-w-0 flex-col items-center justify-center gap-0.5 bg-white/10 px-1.5 py-1 text-center";
  return (
    <section aria-label="Resumen balance del día" className="relative shrink-0">
      <div className={`overflow-hidden rounded-xl bg-black/35 text-white ring-1 ${resumen.exceso ? "ring-2 ring-[var(--vence-fondo)]" : "ring-white/15"}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] divide-x divide-white/20">
          {APARTADOS.map((apartado) => (
            <dl key={apartado[0].clave} className="@container flex min-w-0 flex-col justify-center gap-1 px-2 py-1">
              {apartado.map((a) => (
                <div key={a.clave} title={a.ayuda}>
                  <dt className={titulo}>{a.titulo}</dt>
                  <dd className={`text-[clamp(0.8rem,13.5cqw,1.1rem)] leading-tight font-black whitespace-nowrap tabular-nums ${colorDe(a, resumen)}`}>{formatearMoneda(resumen[a.clave])}</dd>
                </div>
              ))}
            </dl>
          ))}
          {resumen.editable ? (
            <button type="button" onClick={() => setEditando(true)} aria-haspopup="dialog" aria-expanded={editando} className={`${celdaCaja} active:bg-white/20`}>
              {cajaAdentro}
            </button>
          ) : (
            <div className={celdaCaja}>{cajaAdentro}</div>
          )}
        </div>
        {resumen.exceso && <AvisoDeExceso exceso={resumen.exceso} chico />}
      </div>
      {editando && <EditorDeCaja resumen={resumen} cerrar={() => setEditando(false)} />}
    </section>
  );
}
