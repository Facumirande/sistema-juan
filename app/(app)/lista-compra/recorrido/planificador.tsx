"use client";

import { useOptimistic, useState, useTransition } from "react";

import { circuitoElegido, recorrerPorCircuito, type CircuitoDeCompra } from "@/dominio/compras/circuitos";
import { recordarCircuito } from "@/ui/circuito-elegido";
import Link from "@/ui/enlace";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { elegirPuestoAccion, ordenarParadasAccion } from "../acciones";

// El recorrido de compra del día, para armarlo antes de ir (RN-203). Tres pasos, todos en la misma
// pantalla y en cualquier orden: tocar los productos para elegirlos, mandarlos juntos a su puesto y
// subir o bajar las paradas hasta que queden como se recorre el mercado. Todo se guarda al momento.

export interface RenglonDelRecorrido {
  id: string;
  producto: string;
  cantidad: string;
  puestoId: string | null;
  puestoNombre: string | null;
  puestoUbicacion: string | null;
  hecho: boolean;
}

type Cambio = { id: string; puestoId: string | null; puestoNombre: string | null; puestoUbicacion: null };
const nuevoId = () => crypto.randomUUID();
/** La lista de compras se abre ya en orden "Por puesto" (lo recuerda cada aparato). */
const abrirPorPuesto = () => {
  try {
    window.localStorage.setItem("lista-de-compras:orden", "puesto");
  } catch {
    // Sin almacenamiento, la lista se abre como estaba.
  }
};

export function Planificador({
  fecha,
  renglones,
  proveedores,
  circuitos,
  circuitoInicial,
  puedeEditar,
}: {
  fecha: string;
  renglones: RenglonDelRecorrido[];
  proveedores: { id: string; nombre: string }[];
  circuitos: CircuitoDeCompra[];
  circuitoInicial: string | null;
  puedeEditar: boolean;
}) {
  const [vista, marcar] = useOptimistic(renglones, (actual: RenglonDelRecorrido[], cambios: Cambio[]) => actual.map((r) => ({ ...r, ...cambios.find((c) => c.id === r.id) })));
  const [circuitoId, setCircuitoId] = useState(circuitoInicial);
  // El orden recién acomodado, hasta que vuelve guardado del servidor.
  const [aMano, setAMano] = useState<{ id: string; paradas: string[] } | null>(null);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [aviso, setAviso] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [ocupado, empezar] = useTransition();

  const guardado = circuitoElegido(circuitos, circuitoId);
  const circuito = aMano && (!guardado || guardado.id === aMano.id) ? { id: aMano.id, nombre: guardado?.nombre ?? "Mi recorrido", paradas: aMano.paradas } : guardado;
  const paradas = recorrerPorCircuito(vista, circuito);
  const conPuesto = paradas.filter((p) => p.puestoId !== null);
  const sinPuesto = paradas.find((p) => p.puestoId === null) ?? null;
  const faltan = vista.filter((r) => !r.hecho).length;

  const ejecutar = (accion: (e: EstadoAccion, fd: FormData) => Promise<EstadoAccion>, datos: Record<string, string | string[]>, cambios: Cambio[] = []) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    empezar(async () => {
      if (cambios.length) marcar(cambios);
      const r = await accion(ESTADO_INICIAL, fd);
      setAviso(r.ok ? ESTADO_INICIAL : r.mensaje ? r : { ok: false, mensaje: "No se pudo guardar: revisá la conexión y probá de nuevo." });
    });
  };
  const elegirCircuito = (id: string) => {
    setCircuitoId(id);
    setAMano(null);
    recordarCircuito(id);
  };
  const tocar = (id: string) => {
    const nuevo = new Set(elegidos);
    if (!nuevo.delete(id)) nuevo.add(id);
    setElegidos(nuevo);
  };
  const tocarTodos = (ids: string[]) => {
    const yaEstan = ids.every((id) => elegidos.has(id));
    setElegidos(new Set(yaEstan ? [...elegidos].filter((id) => !ids.includes(id)) : [...elegidos, ...ids]));
  };
  const mandar = (proveedorId: string) => {
    const ids = vista.filter((r) => elegidos.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    const nombre = proveedores.find((p) => p.id === proveedorId)?.nombre ?? null;
    ejecutar(
      elegirPuestoAccion,
      { itemId: ids, proveedorId },
      ids.map((id) => ({ id, puestoId: proveedorId || null, puestoNombre: nombre, puestoUbicacion: null })),
    );
    setElegidos(new Set());
  };
  // Subir o bajar una parada: el orden queda guardado en el circuito (se crea uno si no había).
  const mover = (i: number, paso: -1 | 1) => {
    const j = i + paso;
    if (j < 0 || j >= conPuesto.length) return;
    const orden = conPuesto.map((p) => p.puestoId!);
    [orden[i], orden[j]] = [orden[j]!, orden[i]!];
    const id = circuito?.id ?? nuevoId();
    setAMano({ id, paradas: orden });
    if (!guardado) {
      setCircuitoId(id);
      recordarCircuito(id);
    }
    ejecutar(ordenarParadasAccion, { circuitoId: id, parada: orden });
  };

  const chip = (r: RenglonDelRecorrido) => {
    const elegido = elegidos.has(r.id);
    return (
      <li key={r.id}>
        <button
          type="button"
          role="checkbox"
          aria-checked={elegido}
          disabled={!puedeEditar}
          onClick={() => tocar(r.id)}
          className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 py-1 text-left ${elegido ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca"} ${r.hecho ? "opacity-60" : ""}`}
        >
          <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded border-2 text-sm font-bold ${elegido ? "border-marca-texto" : "border-borde"}`}>
            {elegido ? "✓" : ""}
          </span>
          <span className={`font-bold ${r.hecho ? "line-through" : ""}`}>{r.producto}</span>
          <span className={`text-sm tabular-nums ${elegido ? "" : "text-texto-suave"}`}>{r.cantidad}</span>
        </button>
      </li>
    );
  };
  const flecha = "flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-borde text-xl font-bold hover:border-marca disabled:opacity-30";
  const chico = "min-h-10 rounded-lg border-2 px-3 font-semibold";

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {["Tocá los productos para elegirlos.", "Mandalos juntos a su puesto.", "Subí o bajá los puestos y andá a comprar."].map((paso, i) => (
          <li key={paso} className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marca font-extrabold text-marca-texto">{i + 1}</span>
            {paso}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borde bg-superficie p-2" role="group" aria-label="Circuito de compra">
        <span className="px-1 font-bold">🧭 Circuito</span>
        {circuitos.map((c) => (
          <button key={c.id} type="button" onClick={() => elegirCircuito(c.id)} aria-pressed={circuito?.id === c.id} className={`${chico} ${circuito?.id === c.id ? "border-marca bg-marca text-marca-texto" : "border-borde hover:border-marca"}`}>
            {c.nombre}
          </button>
        ))}
        {circuitos.length > 0 && (
          <button type="button" onClick={() => elegirCircuito("")} aria-pressed={!circuito} className={`${chico} ${!circuito ? "border-marca bg-marca text-marca-texto" : "border-borde text-texto-suave hover:border-marca"}`}>
            Sin circuito
          </button>
        )}
        {circuitos.length === 0 && <span className="min-w-0 flex-1 basis-48 text-sm text-texto-suave">Al acomodar los puestos se guarda solo, como “Mi recorrido”.</span>}
        {puedeEditar && (
          <Link href={`/lista-compra/circuitos?fecha=${fecha}`} className="ml-auto flex min-h-10 items-center px-2 font-semibold underline underline-offset-4">
            ✏️ Editar circuitos
          </Link>
        )}
      </div>

      {aviso.mensaje && (
        <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 font-medium text-error">
          {aviso.mensaje}
        </p>
      )}

      {sinPuesto && (
        <section aria-label="Sin puesto" className="flex flex-col gap-2 rounded-2xl border-2 border-amber-500 bg-superficie p-3">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
            <span aria-hidden>📥</span> Por acomodar <span className="text-sm font-semibold text-texto-suave">· {sinPuesto.renglones.length} sin puesto (se compran en efectivo, donde sea)</span>
            {puedeEditar && (
              <button type="button" onClick={() => tocarTodos(sinPuesto.renglones.map((r) => r.id))} className={`${chico} ml-auto border-borde text-sm hover:border-marca`}>
                Elegir todos
              </button>
            )}
          </h2>
          <ul className="flex flex-wrap gap-2">{sinPuesto.renglones.map(chip)}</ul>
        </section>
      )}

      {conPuesto.map((p, i) => {
        const pendientes = p.renglones.filter((r) => !r.hecho).length;
        return (
          <section key={p.clave} aria-label={p.titulo} className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${pendientes === 0 ? "bg-[var(--listo-fondo)] text-white" : "bg-marca text-marca-texto"}`}>{pendientes === 0 ? "✓" : i + 1}</span>
              <span className="min-w-0 flex-1 basis-32">
                {p.titulo}
                <span className="block text-sm font-semibold text-texto-suave">
                  {p.detalle ? `${p.detalle} · ` : ""}
                  {pendientes === 0 ? "listo" : `${pendientes} por comprar`}
                </span>
              </span>
              {puedeEditar && (
                <>
                  <button type="button" onClick={() => tocarTodos(p.renglones.map((r) => r.id))} className={`${chico} border-borde text-sm hover:border-marca`}>
                    Elegir todos
                  </button>
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${p.titulo} en el recorrido`} title="Ir antes" className={flecha}>
                    ↑
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === conPuesto.length - 1} aria-label={`Bajar ${p.titulo} en el recorrido`} title="Ir después" className={flecha}>
                    ↓
                  </button>
                </>
              )}
            </h2>
            <ul className="flex flex-wrap gap-2">{p.renglones.map(chip)}</ul>
          </section>
        );
      })}

      {/* Siempre a la vista: adónde mandar lo elegido y el paso a comprar. */}
      <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-marca bg-superficie p-3 shadow-xl" aria-busy={ocupado}>
        {puedeEditar && elegidos.size > 0 ? (
          <>
            <b className="whitespace-nowrap">{elegidos.size === 1 ? "1 elegido" : `${elegidos.size} elegidos`}</b>
            <label className="flex min-w-0 flex-1 basis-44 items-center gap-1.5">
              <span aria-hidden>🏪</span>
              <span className="sr-only">Puesto adonde mandarlos</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border-2 border-borde bg-superficie px-2 font-semibold">
                <option value="">Sin puesto (efectivo)</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => mandar(destino)} className="min-h-11 rounded-xl bg-marca px-4 font-bold text-marca-texto">
              Mandar ahí
            </button>
            <button type="button" onClick={() => setElegidos(new Set())} aria-label="Quitar la selección" className="flex size-11 items-center justify-center rounded-xl border-2 border-borde text-xl font-bold">
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 basis-40 font-semibold">{faltan === 0 ? "✓ Está todo comprado" : faltan === 1 ? "Falta comprar 1 producto" : `Faltan comprar ${faltan} productos`}</span>
            <Link href={`/lista-compra?fecha=${fecha}`} onClick={abrirPorPuesto} className="flex min-h-12 items-center rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto">
              🛒 Ir a comprar →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
