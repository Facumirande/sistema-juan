"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { ABREVIATURA_UNIDAD } from "@/dominio/dinero/formato";
import { MAXIMO_BYTES_PLANILLA } from "@/dominio/planillas/comun";
import type { RevisionDeProductos } from "@/modulos/catalogo/planilla";

import { importarProductosAccion, revisarProductosAccion } from "./acciones";

// Subir productos desde Excel en dos toques: se elige el archivo y el sistema muestra qué productos
// entendió (o qué hay que corregir, fila por fila); recién al tocar "Cargar" quedan en Productos.

export function ImportadorDeProductos() {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [revision, setRevision] = useState<RevisionDeProductos | null>(null);
  const [cargados, setCargados] = useState<{ creados: number; categorias: string[] } | null>(null);
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
      setMensaje("El archivo es muy grande: dejá solo la hoja de los productos y volvé a subirlo.");
      return;
    }
    const datos = new FormData();
    datos.set("archivo", file);
    empezar(async () => {
      const r = await revisarProductosAccion(datos);
      if (r.revision) setRevision(r.revision);
      else setMensaje(r.mensaje ?? "No se pudo leer el archivo. Probá de nuevo.");
    });
  };
  const cargar = () => {
    if (!revision) return;
    empezar(async () => {
      const r = await importarProductosAccion(
        revision.nuevos.map((p) => ({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, categoriaId: p.categoriaId, unidadBase: p.unidadBase, admiteFraccion: p.admiteFraccion, envase: p.envase, ganancia: p.ganancia, notas: p.notas })),
      );
      if (r.creados !== undefined) {
        setCargados({ creados: r.creados, categorias: r.categorias ?? [] });
        setRevision(null);
      } else setMensaje(r.mensaje ?? "No se pudieron cargar los productos. Probá de nuevo.");
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
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-borde bg-superficie p-6 text-center" role="status">
        <span aria-hidden className="text-6xl leading-none">
          ✅
        </span>
        <p className="text-2xl font-semibold">{cargados.creados === 1 ? "Se cargó 1 producto" : `Se cargaron ${cargados.creados} productos`}</p>
        {cargados.categorias.length > 0 && (
          <p className="text-texto-suave">
            {cargados.categorias.length === 1 ? "Se creó la categoría" : "Se crearon las categorías"} {cargados.categorias.join(", ")}.
          </p>
        )}
        <p className="text-texto-suave">Falta cargarles los precios de cada puesto: en la ficha de cada producto, o solos al anotar la primera compra.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/productos" className="flex min-h-12 items-center rounded-xl bg-marca px-5 font-semibold text-marca-texto">
            Ver los productos
          </Link>
          <button type="button" onClick={otraVez} className="min-h-12 rounded-xl border-2 border-borde px-5 font-semibold">
            Subir otra planilla
          </button>
        </div>
      </div>
    );
  }

  const hayProblemas = revision !== null && revision.problemas.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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

      {hayProblemas && (
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

      {revision && !hayProblemas && revision.nuevos.length === 0 && (
        <p className="rounded-2xl border border-borde bg-superficie p-4 text-lg">
          No hay productos nuevos para cargar: {revision.yaEstan.length === 1 ? "el producto de la planilla ya está cargado" : `los ${revision.yaEstan.length} productos de la planilla ya están cargados`}.
        </p>
      )}

      {revision && !hayProblemas && revision.nuevos.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-marca/50 bg-superficie p-4">
          <p className="text-lg font-semibold">
            {revision.nuevos.length === 1 ? "La planilla trae 1 producto nuevo" : `La planilla trae ${revision.nuevos.length} productos nuevos`}. Revisalos y tocá “Cargar”.
          </p>
          {revision.categoriasNuevas.length > 0 && (
            <p className="rounded-xl bg-[var(--pastel-azul)] px-3 py-2 text-[var(--pastel-azul-texto)]">
              🏷 {revision.categoriasNuevas.length === 1 ? "Se va a crear la categoría" : "Se van a crear las categorías"} <b>{revision.categoriasNuevas.map((c) => c.nombre).join(", ")}</b>.
            </p>
          )}
          {revision.yaEstan.length > 0 && (
            <p className="rounded-xl bg-fondo px-3 py-2 text-texto-suave">
              {revision.yaEstan.length === 1 ? "1 producto ya estaba cargado y se saltea" : `${revision.yaEstan.length} productos ya estaban cargados y se saltean`}: {revision.yaEstan.slice(0, 8).join(", ")}
              {revision.yaEstan.length > 8 && "…"}
            </p>
          )}
          <ul className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
            {revision.nuevos.map((p) => (
              <li key={p.fila} className="flex items-center gap-3 rounded-xl border border-borde p-3">
                <span aria-hidden className="text-3xl leading-none">
                  {dibujoDeProducto(p.nombre, revision.categoriasNuevas.find((c) => c.nombre === p.categoria)?.grupo)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.nombre}</span>
                  <span className="block text-sm text-texto-suave">
                    {p.categoria} · por {ABREVIATURA_UNIDAD[p.unidadBase]} · {p.envase ? `se compra en ${p.envase.nombre}` : "se compra suelto"}
                    {p.ganancia && ` · gana ${p.ganancia.replace(".", ",")} %`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pendiente} onClick={cargar} className="min-h-14 rounded-xl bg-marca px-6 text-lg font-semibold text-marca-texto disabled:opacity-60">
              {pendiente ? "Cargando…" : `✓ Cargar ${revision.nuevos.length === 1 ? "este producto" : `estos ${revision.nuevos.length} productos`}`}
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
