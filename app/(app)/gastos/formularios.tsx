"use client";

import { useState } from "react";

import type { RubroDeGasto } from "@/modulos/gastos/gastos";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero } from "@/ui/formularios";

import { guardarRubroAccion, registrarMovimientoAccion } from "./acciones";

// Anotar un gasto o un ingreso: se toca el rubro (su dibujo y su título, bien grandes) y aparece lo
// que hay que completar: cuánto fue, la cantidad si el rubro se cuenta en algo (litros de nafta),
// el día y cómo se pagó.

const MEDIOS = [
  ["EFECTIVO", "💵 Efectivo"],
  ["TRANSFERENCIA", "🏦 Transferencia"],
  ["TARJETA", "💳 Tarjeta"],
  ["OTRO", "Otro"],
] as const;

function Rubros({ titulo, rubros, elegido, alElegir }: { titulo: string; rubros: RubroDeGasto[]; elegido: string | null; alElegir: (id: string) => void }) {
  if (rubros.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-texto-suave">{titulo}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {rubros.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => alElegir(r.id)}
            aria-pressed={elegido === r.id}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-colors ${elegido === r.id ? "border-marca bg-marca/15" : "border-borde bg-superficie hover:border-marca/60"}`}
          >
            <span aria-hidden className="text-3xl leading-none">
              {r.dibujo}
            </span>
            <span className="text-lg leading-tight font-bold">{r.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormularioDeGasto({ rubros, hoy }: { rubros: RubroDeGasto[]; hoy: string }) {
  const activos = rubros.filter((r) => r.activo);
  const [rubroId, setRubroId] = useState<string | null>(null);
  const [medio, setMedio] = useState<(typeof MEDIOS)[number][0]>("EFECTIVO");
  const rubro = activos.find((r) => r.id === rubroId) ?? null;
  const esGasto = rubro?.tipo !== "INGRESO";

  return (
    <div className="flex flex-col gap-4">
      <Rubros titulo="¿En qué se gastó?" rubros={activos.filter((r) => r.tipo === "GASTO")} elegido={rubroId} alElegir={setRubroId} />
      <Rubros titulo="¿O entró plata por otra cosa?" rubros={activos.filter((r) => r.tipo === "INGRESO")} elegido={rubroId} alElegir={setRubroId} />
      {!rubro ? (
        <p className="rounded-xl bg-fondo p-3 text-texto-suave">Tocá un rubro para anotar el importe. Si falta alguno, crealo más abajo en “Rubros”.</p>
      ) : (
        <div className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${esGasto ? "border-[var(--pastel-naranja)] bg-[var(--pastel-naranja)]/25" : "border-[var(--pastel-verde)] bg-[var(--pastel-verde)]/25"}`}>
          <p className="flex items-center gap-2 text-2xl font-bold">
            <span aria-hidden>{rubro.dibujo}</span>
            {rubro.nombre}
            <span className="rounded-full bg-superficie px-3 py-0.5 text-sm font-semibold">{esGasto ? "Gasto" : "Ingreso"}</span>
          </p>
          {/* La clave hace que, al cambiar de rubro, el formulario empiece vacío. */}
          <FormularioAccion key={rubro.id} accion={registrarMovimientoAccion} boton={esGasto ? "✓ Guardar el gasto" : "✓ Guardar el ingreso"}>
            <input type="hidden" name="rubroId" value={rubro.id} />
            <input type="hidden" name="medioPago" value={medio} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoNumero etiqueta="¿Cuánto fue?" name="monto" placeholder="Ej. 35.000" required autoFocus />
              {rubro.unidad && <CampoNumero etiqueta={`¿Cuántos ${rubro.unidad}? (opcional)`} name="cantidad" placeholder="Ej. 40" />}
              <Campo etiqueta="¿Qué día?" name="fecha" type="date" defaultValue={hoy} max={hoy} />
              <Campo etiqueta="Detalle (opcional)" name="detalle" placeholder={esGasto ? "Ej. tanque lleno, YPF" : "Ej. cajones vacíos"} />
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cómo se pagó">
              <span className="font-medium">{esGasto ? "Se pagó con" : "Entró por"}</span>
              {MEDIOS.map(([valor, texto]) => (
                <button key={valor} type="button" onClick={() => setMedio(valor)} aria-pressed={medio === valor} className={`min-h-11 rounded-full border-2 px-4 font-semibold ${medio === valor ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}>
                  {texto}
                </button>
              ))}
            </div>
          </FormularioAccion>
        </div>
      )}
    </div>
  );
}

const DIBUJOS = ["⛽", "🛣️", "🔧", "🚚", "📦", "👷", "🍽️", "🧾", "🏠", "📱", "💡", "🧹", "🧊", "🛞", "🧰", "📎", "💵", "♻️", "🎁", "💸"];

/** Crear un rubro o cambiar uno: el dibujo se elige de la lista (o se escribe otro), con su título. */
export function FormularioDeRubro({ rubro }: { rubro?: RubroDeGasto }) {
  const [dibujo, setDibujo] = useState(rubro?.dibujo ?? "🧾");
  const [tipo, setTipo] = useState(rubro?.tipo ?? "GASTO");
  return (
    <FormularioAccion accion={guardarRubroAccion} boton={rubro ? "Guardar los cambios" : "＋ Crear el rubro"} variante={rubro ? "secundario" : "principal"}>
      {rubro && <input type="hidden" name="rubroId" value={rubro.id} />}
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex flex-col gap-2">
        <span className="font-medium">Dibujo</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {DIBUJOS.map((d) => (
            <button key={d} type="button" onClick={() => setDibujo(d)} aria-pressed={dibujo === d} aria-label={`Dibujo ${d}`} className={`flex size-11 items-center justify-center rounded-xl border-2 text-2xl ${dibujo === d ? "border-marca bg-marca/15" : "border-borde bg-superficie"}`}>
              {d}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            u otro:
            <input name="dibujo" value={dibujo} onChange={(e) => setDibujo(e.target.value)} maxLength={16} aria-label="Otro dibujo (emoji)" className="h-11 w-16 rounded-lg border border-borde bg-superficie text-center text-2xl" />
          </label>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título" name="nombre" defaultValue={rubro?.nombre} placeholder="Ej. Lavado del camión" required />
        <Campo etiqueta="¿Se cuenta en algo? (opcional)" name="unidad" defaultValue={rubro?.unidad ?? ""} placeholder="Ej. litros, km, horas" ayuda="Si lo completás, al anotar se puede poner también la cantidad." />
      </div>
      {!rubro && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Qué es">
          <span className="font-medium">Es</span>
          {(
            [
              ["GASTO", "💸 Un gasto"],
              ["INGRESO", "💵 Un ingreso"],
            ] as const
          ).map(([valor, texto]) => (
            <button key={valor} type="button" onClick={() => setTipo(valor)} aria-pressed={tipo === valor} className={`min-h-11 rounded-full border-2 px-4 font-semibold ${tipo === valor ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}>
              {texto}
            </button>
          ))}
        </div>
      )}
    </FormularioAccion>
  );
}
