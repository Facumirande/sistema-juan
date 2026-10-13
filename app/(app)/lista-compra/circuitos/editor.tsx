"use client";

import { startTransition, useActionState, useRef, useState, type KeyboardEvent as EventoTecla, type PointerEvent as EventoPuntero } from "react";

import { LARGO_DEL_NOMBRE, MAXIMO_DE_CIRCUITOS, porDondeQuedan, type CircuitoDeCompra } from "@/dominio/compras/circuitos";
import Link from "@/ui/enlace";
import { ESTADO_INICIAL } from "@/ui/estado-accion";

import { guardarCircuitosAccion } from "../acciones";

// Armar los circuitos de compra: cada uno con su nombre y sus puestos, en el orden en que se recorren.
// Los puestos se acomodan arrastrando (o con las flechas del teclado), se agregan de una lista y se
// quitan con la ✕. Nada se guarda hasta tocar "Guardar", que está siempre a la vista.

interface Puesto {
  id: string;
  nombre: string;
  ubicacion: string | null;
}

const nuevoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16));

/** Los puestos como se recorren si nadie dijo otra cosa: por dónde quedan en el mercado y, después, por nombre. */
const porUbicacion = (puestos: readonly Puesto[]) => [...puestos].sort(porDondeQuedan);

export function EditorDeCircuitos({ circuitos: guardados, puestos, puedeEditar, fecha, volver }: { circuitos: CircuitoDeCompra[]; puestos: Puesto[]; puedeEditar: boolean; fecha: string; volver: string }) {
  // Sin ningún circuito, se empieza con uno que ya trae todos los puestos: solo falta acomodarlos.
  const [circuitos, setCircuitos] = useState<CircuitoDeCompra[]>(() => (guardados.length > 0 || !puedeEditar ? guardados : [{ id: nuevoId(), nombre: "Mi circuito", paradas: porUbicacion(puestos).map((p) => p.id) }]));
  const [estado, guardar, guardando] = useActionState(guardarCircuitosAccion, ESTADO_INICIAL);
  const cambiar = (id: string, cambio: Partial<CircuitoDeCompra>) => setCircuitos((actuales) => actuales.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
  const enviar = () => {
    const fd = new FormData();
    fd.append("circuitos", JSON.stringify(circuitos));
    fd.append("fecha", fecha);
    fd.append("volver", volver);
    startTransition(() => guardar(fd));
  };

  if (puestos.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-amber-500 bg-superficie p-4 text-lg font-semibold">
        Todavía no hay puestos cargados. Un circuito es el orden en que se recorren:{" "}
        <Link href="/proveedores/nuevo" className="underline underline-offset-2">
          cargá el primer puesto →
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {circuitos.length === 0 && <p className="rounded-2xl border border-borde bg-superficie p-4 text-texto-suave">No hay ningún circuito armado: la lista ordena los puestos por dónde quedan en el mercado.</p>}

      {circuitos.map((c) => (
        <UnCircuito
          key={c.id}
          circuito={c}
          puestos={puestos}
          puedeEditar={puedeEditar}
          alCambiar={(cambio) => cambiar(c.id, cambio)}
          alQuitar={() => {
            if (window.confirm(`¿Quitar el circuito “${c.nombre || "sin nombre"}”? Los puestos no se tocan.`)) setCircuitos((actuales) => actuales.filter((x) => x.id !== c.id));
          }}
        />
      ))}

      {puedeEditar && circuitos.length < MAXIMO_DE_CIRCUITOS && (
        <div>
          <button type="button" onClick={() => setCircuitos((actuales) => [...actuales, { id: nuevoId(), nombre: "", paradas: [] }])} className="min-h-12 rounded-xl border-2 border-dashed border-borde px-4 font-semibold hover:border-marca">
            ＋ Otro circuito
          </button>
        </div>
      )}

      {estado.mensaje && !estado.ok && (
        <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 font-medium text-error">
          {estado.mensaje}
        </p>
      )}

      {/* Guardar siempre a la vista: la barra queda pegada abajo. */}
      {puedeEditar && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-borde bg-superficie p-3 shadow-lg">
          <button type="button" onClick={enviar} disabled={guardando} className="min-h-12 flex-1 rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto disabled:animate-pulse disabled:opacity-60 sm:flex-none">
            {guardando ? "Guardando…" : "✓ Guardar los circuitos"}
          </button>
          <Link href={volver} className="flex min-h-12 items-center rounded-xl border border-borde px-4 font-semibold">
            Cancelar
          </Link>
        </div>
      )}
    </div>
  );
}

function UnCircuito({ circuito, puestos, puedeEditar, alCambiar, alQuitar }: { circuito: CircuitoDeCompra; puestos: Puesto[]; puedeEditar: boolean; alCambiar: (cambio: Partial<CircuitoDeCompra>) => void; alQuitar: () => void }) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const filas = useRef(new Map<string, HTMLLIElement>());
  const porId = new Map(puestos.map((p) => [p.id, p]));
  const paradas = circuito.paradas.filter((id) => porId.has(id));
  const sinPoner = porUbicacion(puestos.filter((p) => !paradas.includes(p.id)));

  const mover = (desde: number, hasta: number) => {
    if (hasta < 0 || hasta >= paradas.length || hasta === desde) return;
    const nuevo = [...paradas];
    const [quitado] = nuevo.splice(desde, 1);
    nuevo.splice(hasta, 0, quitado!);
    alCambiar({ paradas: nuevo });
  };
  // ——— Arrastrar un puesto para cambiarlo de lugar (igual que en la lista de compras) ———
  const agarrar = (e: EventoPuntero<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastrando(id);
  };
  const alMover = (e: EventoPuntero<HTMLButtonElement>) => {
    if (!arrastrando) return;
    const desde = paradas.indexOf(arrastrando);
    // El lugar nuevo: antes del primer puesto cuya mitad queda por debajo del dedo.
    let hasta = paradas.length - 1;
    for (const [i, id] of paradas.entries()) {
      const caja = filas.current.get(id)?.getBoundingClientRect();
      if (caja && e.clientY < caja.top + caja.height / 2) {
        hasta = i > desde ? i - 1 : i;
        break;
      }
    }
    mover(desde, hasta);
  };
  const conTecla = (e: EventoTecla<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!paso) return;
    e.preventDefault();
    mover(i, i + paso);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-2xl">
          🧭
        </span>
        <input
          value={circuito.nombre}
          onChange={(e) => alCambiar({ nombre: e.target.value })}
          maxLength={LARGO_DEL_NOMBRE}
          disabled={!puedeEditar}
          placeholder="Nombre del circuito (ej. Mercofrut de siempre)"
          aria-label="Nombre del circuito"
          className="h-12 min-w-0 flex-1 basis-48 rounded-xl border-2 border-borde bg-superficie px-3 text-xl font-bold"
        />
        {puedeEditar && (
          <button type="button" onClick={alQuitar} className="min-h-11 rounded-xl border border-borde px-3 font-semibold text-texto-suave hover:border-error hover:text-error">
            🗑 Quitar
          </button>
        )}
      </div>

      {paradas.length === 0 ? (
        <p className="text-texto-suave">Todavía sin puestos: agregá el primero, por donde empezás la vuelta.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {paradas.map((id, i) => {
            const p = porId.get(id)!;
            return (
              <li
                key={id}
                ref={(el) => {
                  if (el) filas.current.set(id, el);
                  else filas.current.delete(id);
                }}
                className={`flex items-center gap-2 rounded-xl border-2 bg-superficie px-2 py-1.5 ${arrastrando === id ? "border-marca shadow-lg" : "border-borde"}`}
              >
                {puedeEditar && (
                  <button
                    type="button"
                    aria-label={`Mover ${p.nombre} (con las flechas, sube o baja)`}
                    title="Arrastrá para cambiarlo de lugar"
                    onPointerDown={(e) => agarrar(e, id)}
                    onPointerMove={alMover}
                    onPointerUp={() => setArrastrando(null)}
                    onPointerCancel={() => setArrastrando(null)}
                    onKeyDown={(e) => conTecla(e, i)}
                    className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-texto-suave hover:bg-fondo active:cursor-grabbing"
                  >
                    ⠿
                  </button>
                )}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-lg font-extrabold text-marca-texto">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-lg">{p.nombre}</b>
                  {p.ubicacion && <span className="block truncate text-sm text-texto-suave">{p.ubicacion}</span>}
                </span>
                {puedeEditar && (
                  <button type="button" onClick={() => alCambiar({ paradas: paradas.filter((x) => x !== id) })} aria-label={`Sacar ${p.nombre} del circuito`} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-texto-suave hover:bg-fondo hover:text-error">
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {puedeEditar && sinPoner.length > 0 && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">＋ Agregar puesto</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) alCambiar({ paradas: [...paradas, e.target.value] });
            }}
            className="h-12 min-w-0 flex-1 basis-48 rounded-xl border-2 border-borde bg-superficie px-3 font-semibold"
          >
            <option value="">Elegí el que sigue en la vuelta…</option>
            {sinPoner.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.ubicacion ? ` · ${p.ubicacion}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
