"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";

import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { ESTADO_INICIAL } from "@/ui/estado-accion";

import { guardarCajaInicialAccion } from "./acciones";

// El resumen balance (pedido del usuario, 10/10/2026): el cartel de arriba del tablero. Dice lo
// gastado en el día que se mira (Gastos), cuánto de eso ya se pagó (Pagado) y cuánto quedó a cuenta
// (Crédito), y a la derecha la Caja inicial, la plata con la que se cuenta, que se carga tocándola.
// Si los gastos la superan, el cartel lo avisa en rojo (y la campanita también). Se pone al día
// solo con cada cambio. La cuenta está en `src/dominio/reportes/resumen-balance.ts` (RN-180).

export interface ResumenParaVer {
  fecha: string;
  gastos: string;
  pagado: string;
  credito: string;
  cajaInicial: string | null;
  exceso: string | null;
  /** Puede cargar o cambiar la caja inicial (tiene el permiso y el día no está cerrado). */
  editable: boolean;
}

const AYUDA = {
  gastos: "Lo comprado para este día y los gastos de esta fecha: lo pagado más lo que quedó a crédito.",
  pagado: "Lo que ya se pagó: las compras pagadas y los gastos de esta fecha.",
  credito: "Lo comprado a cuenta que todavía falta pagar.",
  caja: "La plata con la que contás este día.",
} as const;

const COLOR = { gastos: "text-[#ffb3a7]", pagado: "text-[#86efc3]", credito: "text-[#ffd96a]", caja: "text-white" } as const;

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
        <input
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
 * En la computadora, en el encabezado: Gastos = Pagado + Crédito y, en el recuadro de la derecha,
 * la Caja inicial. Cada número se achica solo si no entra en su lugar.
 */
export function ResumenBalanceGrande({ resumen }: { resumen: ResumenParaVer }) {
  const [editando, setEditando] = useState(false);
  const numero = "px-1 leading-tight font-black whitespace-nowrap tabular-nums";
  const titulo = "flex items-center gap-1 text-xs leading-tight font-bold tracking-wide uppercase opacity-90";
  const celda = "@container flex min-w-0 flex-col items-center justify-center px-2 py-1.5 text-center";
  const signo = "flex items-center text-xl font-black opacity-60";
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
      <span className={`${numero} ${resumen.cajaInicial === null ? "text-[clamp(0.95rem,11cqw,1.5rem)] opacity-90" : "text-[clamp(1.05rem,15cqw,2.2rem)]"} ${COLOR.caja}`}>{valorDeCaja(resumen)}</span>
    </>
  );
  return (
    <section aria-label="Resumen balance del día" className="relative w-full max-w-[50rem] min-w-[26rem] flex-1">
      <div className={`overflow-hidden rounded-xl bg-black/35 text-white ring-1 ${resumen.exceso ? "ring-2 ring-[var(--vence-fondo)]" : "ring-white/15"}`}>
        <div className="grid w-full grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.35fr)]">
          <p className={celda} title={AYUDA.gastos}>
            <span className={titulo}>
              <span aria-hidden>💸</span>
              Gastos
            </span>
            <span className={`${numero} text-[clamp(1.05rem,15cqw,2.2rem)] ${COLOR.gastos}`}>{formatearMoneda(resumen.gastos)}</span>
          </p>
          <span aria-hidden className={signo}>
            =
          </span>
          <p className={celda} title={AYUDA.pagado}>
            <span className={titulo}>Pagado</span>
            <span className={`${numero} text-[clamp(1rem,13cqw,1.7rem)] ${COLOR.pagado}`}>{formatearMoneda(resumen.pagado)}</span>
          </p>
          <span aria-hidden className={signo}>
            +
          </span>
          <p className={celda} title={AYUDA.credito}>
            <span className={titulo}>Crédito</span>
            <span className={`${numero} text-[clamp(1rem,13cqw,1.7rem)] ${COLOR.credito}`}>{formatearMoneda(resumen.credito)}</span>
          </p>
          {resumen.editable ? (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-haspopup="dialog"
              aria-expanded={editando}
              title={`${AYUDA.caja} Tocá para ${resumen.cajaInicial === null ? "cargarla" : "cambiarla"}.`}
              className={`${celda} border-l border-white/20 bg-white/10 hover:bg-white/20`}
            >
              {cajaAdentro}
            </button>
          ) : (
            <p className={`${celda} border-l border-white/20 bg-white/10`} title={AYUDA.caja}>
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
 * En el celular, arriba del tablero: en letra normal, con los dos números que importan (Gastos y
 * Caja inicial) un poco más grandes y, debajo de Gastos, cuánto es Pagado y cuánto Crédito.
 */
export function ResumenBalanceChico({ resumen }: { resumen: ResumenParaVer }) {
  const [editando, setEditando] = useState(false);
  const titulo = "text-xs leading-tight font-semibold opacity-90";
  const cajaAdentro = (
    <>
      <span className={titulo}>
        <span aria-hidden>💰</span> Caja inicial
        {resumen.editable && (
          <span aria-hidden className="opacity-80">
            {" "}
            ✎
          </span>
        )}
      </span>
      <span className={`leading-tight font-black whitespace-nowrap tabular-nums ${resumen.cajaInicial === null ? "text-sm opacity-90" : "text-lg"} ${COLOR.caja}`}>{valorDeCaja(resumen)}</span>
    </>
  );
  const celdaCaja = "flex min-w-0 flex-col items-center justify-center bg-white/10 px-2 py-1 text-center";
  return (
    <section aria-label="Resumen balance del día" className="relative shrink-0">
      <div className={`overflow-hidden rounded-xl bg-black/35 text-white ring-1 ${resumen.exceso ? "ring-2 ring-[var(--vence-fondo)]" : "ring-white/15"}`}>
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] divide-x divide-white/20">
          {/* Como una suma: el total arriba y, debajo, sus dos partes, con los importes en una misma columna. */}
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] content-center items-baseline gap-x-2 px-2.5 py-1 leading-tight">
            <dt className={titulo} title={AYUDA.gastos}>
              <span aria-hidden>💸</span> Gastos
            </dt>
            <dd className={`text-right text-lg leading-tight font-black whitespace-nowrap tabular-nums ${COLOR.gastos}`}>{formatearMoneda(resumen.gastos)}</dd>
            <dt className="pl-[1.35em] text-xs opacity-90" title={AYUDA.pagado}>
              Pagado
            </dt>
            <dd className={`text-right text-xs font-bold whitespace-nowrap tabular-nums ${COLOR.pagado}`}>{formatearMoneda(resumen.pagado)}</dd>
            <dt className="pl-[1.35em] text-xs opacity-90" title={AYUDA.credito}>
              Crédito
            </dt>
            <dd className={`text-right text-xs font-bold whitespace-nowrap tabular-nums ${COLOR.credito}`}>{formatearMoneda(resumen.credito)}</dd>
          </dl>
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
