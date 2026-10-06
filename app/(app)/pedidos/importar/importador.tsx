"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { MAXIMO_BYTES_PLANILLA } from "@/dominio/pedidos/planilla";
import type { PedidoCargado } from "@/modulos/pedidos/pedidos";
import type { RevisionDePlanilla } from "@/modulos/pedidos/planilla";
import { fechaConDia } from "@/ui/etiquetas";

import { importarPedidosAccion, revisarPlanillaAccion } from "./acciones";

// Subir pedidos desde Excel en dos toques: se elige el archivo y el sistema muestra qué pedidos
// entendió (o qué hay que corregir, fila por fila); recién al tocar "Cargar" quedan en el tablero.

export function Importador({ fecha, hoy }: { fecha: string; hoy: string }) {
  const [dia, setDia] = useState(fecha);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [revision, setRevision] = useState<RevisionDePlanilla | null>(null);
  const [cargados, setCargados] = useState<PedidoCargado[] | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  const revisar = (file: File | undefined) => {
    setRevision(null);
    setCargados(null);
    setMensaje(null);
    if (!file) return;
    setArchivo(file.name);
    if (file.size > MAXIMO_BYTES_PLANILLA) {
      setMensaje("El archivo es muy grande: dejá solo la hoja de los pedidos y volvé a subirlo.");
      return;
    }
    const datos = new FormData();
    datos.set("archivo", file);
    datos.set("fecha", dia);
    empezar(async () => {
      const r = await revisarPlanillaAccion(datos);
      if (r.revision) setRevision(r.revision);
      else setMensaje(r.mensaje ?? "No se pudo leer el archivo. Probá de nuevo.");
    });
  };
  const cargar = () => {
    if (!revision) return;
    empezar(async () => {
      const r = await importarPedidosAccion(revision.pedidos.map((p) => ({ fecha: p.fecha, clienteId: p.clienteId, lineas: p.lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad, observaciones: l.observaciones })) })));
      if (r.cargados) {
        setCargados(r.cargados);
        setRevision(null);
      } else setMensaje(r.mensaje ?? "No se pudieron cargar los pedidos. Probá de nuevo.");
    });
  };
  const otraVez = () => {
    setArchivo(null);
    setRevision(null);
    setCargados(null);
    setMensaje(null);
    if (campo.current) campo.current.value = "";
  };

  if (cargados) {
    const dias = [...new Set(cargados.map((p) => p.fecha))].sort();
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-borde bg-superficie p-6 text-center" role="status">
        <span aria-hidden className="text-6xl leading-none">
          ✅
        </span>
        <p className="text-2xl font-semibold">{cargados.length === 1 ? "Se cargó 1 pedido" : `Se cargaron ${cargados.length} pedidos`}</p>
        <ul className="flex w-full max-w-md flex-col divide-y divide-borde rounded-xl border border-borde text-left">
          {cargados.map((p) => (
            <li key={p.pedidoId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <b>{p.cliente}</b> <span className="text-texto-suave">· {fechaConDia(p.fecha)}</span>
              </span>
              <span className="shrink-0 text-sm text-texto-suave">{p.numero}</span>
            </li>
          ))}
        </ul>
        <p className="text-texto-suave">Ya están en la columna “Pedidos” del tablero.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {dias.map((d) => (
            <Link key={d} href={`/inicio?fecha=${d}`} className="flex min-h-12 items-center rounded-xl bg-marca px-5 font-semibold text-marca-texto">
              Ver el tablero del {fechaConDia(d)}
            </Link>
          ))}
          <button type="button" onClick={otraVez} className="min-h-12 rounded-xl border-2 border-borde px-5 font-semibold">
            Subir otra planilla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Día de entrega para las filas sin fecha</span>
          <input type="date" min={hoy} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-12 rounded-xl border-2 border-borde bg-superficie px-3 text-base" />
        </label>
        <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-5 text-lg font-semibold ${pendiente ? "bg-marca/60 text-marca-texto" : "bg-marca text-marca-texto"}`}>
          <span aria-hidden>📥</span>
          {pendiente && !revision ? "Leyendo…" : archivo ? "Elegir otro archivo" : "Elegir el archivo de Excel"}
          <input ref={campo} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" disabled={pendiente} onChange={(e) => revisar(e.target.files?.[0])} />
        </label>
        {archivo && <span className="min-w-0 truncate text-texto-suave">📄 {archivo}</span>}
      </div>

      {mensaje && (
        <p role="alert" className="rounded-xl border-2 border-error bg-error/10 p-4 font-semibold text-error">
          {mensaje}
        </p>
      )}

      {revision && revision.problemas.length > 0 && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border-2 border-error bg-error/5 p-4">
          <p className="text-lg font-semibold text-error">
            {revision.problemas.length === 1 ? "Hay 1 cosa para corregir en la planilla" : `Hay ${revision.problemas.length} cosas para corregir en la planilla`}
          </p>
          <ul className="flex flex-col gap-2">
            {revision.problemas.map((p, i) => (
              <li key={`${p.fila}-${i}`} className="flex gap-3 rounded-xl bg-superficie p-3">
                {p.fila > 0 && <span className="shrink-0 rounded-lg bg-error/15 px-2 py-0.5 font-bold text-error">Fila {p.fila}</span>}
                <span>{p.mensaje}</span>
              </li>
            ))}
          </ul>
          <p className="text-texto-suave">No se cargó nada. Corregí esas filas en el Excel, guardalo y volvé a elegir el archivo.</p>
        </div>
      )}

      {revision && revision.problemas.length === 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-marca/50 bg-superficie p-4">
          <p className="text-lg font-semibold">
            {revision.pedidos.length === 1 ? "La planilla trae 1 pedido" : `La planilla trae ${revision.pedidos.length} pedidos`}. Revisalos y tocá “Cargar”.
          </p>
          {revision.avisos.map((a) => (
            <p key={a} className="rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
              ⚠️ {a}
            </p>
          ))}
          <ul className="grid gap-3 sm:grid-cols-2">
            {revision.pedidos.map((p) => (
              <li key={`${p.fecha}:${p.clienteId}`} className="flex flex-col gap-2 rounded-xl border border-borde p-3">
                <p className="font-semibold">
                  {p.cliente} <span className="font-normal text-texto-suave">· {fechaConDia(p.fecha)}</span>
                </p>
                <ul className="flex flex-col gap-1">
                  {p.lineas.map((l) => (
                    <li key={`${l.productoId}:${l.presentacionId ?? ""}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{l.producto}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{l.texto}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pendiente} onClick={cargar} className="min-h-14 rounded-xl bg-marca px-6 text-lg font-semibold text-marca-texto disabled:opacity-60">
              {pendiente ? "Cargando…" : `✓ Cargar ${revision.pedidos.length === 1 ? "este pedido" : `estos ${revision.pedidos.length} pedidos`}`}
            </button>
            <button type="button" disabled={pendiente} onClick={otraVez} className="min-h-14 rounded-xl border-2 border-borde px-5 font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
