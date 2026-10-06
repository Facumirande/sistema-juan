"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import type { ProductoAImportar } from "@/dominio/catalogo/importacion";
import { UNIDADES_EN_PALABRAS, type UnidadDeVenta } from "@/dominio/catalogo/productos";

import { cargarProductosDePlanillaAccion, leerPlanillaDeProductosAccion } from "../acciones";

// Subir la planilla, revisar fila por fila y cargar (RN-155). Lo propuesto por el sistema (categoría
// o forma de vender) se marca para revisarlo; lo importante que falta, en naranja.

const SIN = "__ninguna__";

interface Fila extends ProductoAImportar {
  incluida: boolean;
}

export function CargadorDePlanilla() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [resultado, setResultado] = useState<{ creados: number; salteados: string[] } | null>(null);
  const [leyendo, empezar] = useTransition();
  const [cargando, empezarCarga] = useTransition();

  const nuevas = useMemo(() => (filas ?? []).filter((f) => f.estado === "NUEVO"), [filas]);
  const elegidas = nuevas.filter((f) => f.incluida);
  const conFaltantes = elegidas.filter((f) => f.faltan.length > 0).length;
  const opcionesCategoria = useMemo(() => [...new Set([...categorias, ...(filas ?? []).map((f) => f.categoria).filter((c): c is string => c !== null)])], [categorias, filas]);

  const leer = (archivo: File | undefined) => {
    if (!archivo) return;
    setResultado(null);
    setAviso(null);
    const fd = new FormData();
    fd.append("planilla", archivo);
    empezar(async () => {
      const r = await leerPlanillaDeProductosAccion(fd);
      if (!r.ok) {
        setFilas(null);
        setAviso({ ok: false, texto: r.mensaje });
        return;
      }
      setFilas(r.productos.map((p) => ({ ...p, incluida: p.estado === "NUEVO" })));
      setCategorias(r.categorias);
      setHoja(r.hoja);
    });
  };
  const cambiar = (fila: number, cambio: Partial<Fila>) => setFilas((fs) => fs?.map((f) => (f.fila === fila ? { ...f, ...cambio } : f)) ?? null);
  const cargar = () =>
    empezarCarga(async () => {
      const r = await cargarProductosDePlanillaAccion(
        elegidas.map((f) => ({ nombre: f.nombre, codigo: f.codigo, categoria: f.categoria, unidad: f.unidad, admiteFraccion: f.admiteFraccion, envase: f.envase, ganancia: f.ganancia })),
      );
      if (!r.ok) {
        setAviso({ ok: false, texto: r.mensaje });
        return;
      }
      setResultado(r);
      setFilas(null);
    });

  if (resultado) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border-2 border-marca bg-superficie p-5">
        <p className="text-xl font-semibold">✓ Se cargaron {resultado.creados === 1 ? "1 producto" : `${resultado.creados} productos`}.</p>
        {resultado.salteados.length > 0 && <p className="text-texto-suave">No se repitieron porque ya estaban: {resultado.salteados.join(", ")}.</p>}
        <p>Ahora les falta el precio de compra: cargalo en Precios de compra (o se toma solo con la primera compra).</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/productos" className="inline-flex min-h-11 items-center rounded-lg bg-marca px-4 font-semibold text-marca-texto">
            Ver los productos
          </Link>
          <Link href="/precios/compra/rapida" className="inline-flex min-h-11 items-center rounded-lg border border-borde px-4 font-semibold">
            💲 Cargar precios de compra
          </Link>
          <button type="button" onClick={() => setResultado(null)} className="inline-flex min-h-11 items-center rounded-lg border border-borde px-4 font-semibold">
            Cargar otra planilla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-marca bg-superficie p-6 text-center hover:bg-marca/5">
        <span className="text-lg font-semibold">{leyendo ? "Leyendo la planilla…" : "📤 Elegí la planilla completa (.xlsx o .csv)"}</span>
        <span className="text-sm text-texto-suave">Se lee y se muestra cómo va a quedar: todavía no se carga nada.</span>
        <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" disabled={leyendo} onChange={(e) => leer(e.target.files?.[0])} />
      </label>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 ${aviso.ok ? "border-marca" : "border-error text-error"}`}>
          {aviso.texto}
        </p>
      )}

      {filas && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-superficie p-4 ring-1 ring-borde">
            <p>
              <b>Hoja “{hoja}”:</b> {nuevas.length === 1 ? "1 producto nuevo" : `${nuevas.length} productos nuevos`}
              {filas.length > nuevas.length && ` · ${filas.length - nuevas.length} ya estaban o se repiten (no se cargan)`}
              {conFaltantes > 0 && <b className="text-[var(--pastel-naranja-texto)]"> · revisá {conFaltantes === 1 ? "1 con algo para completar" : `${conFaltantes} con algo para completar`}</b>}
            </p>
            <button type="button" onClick={cargar} disabled={cargando || elegidas.length === 0} className="min-h-12 rounded-xl bg-marca px-5 text-lg font-semibold text-marca-texto disabled:opacity-50">
              {cargando ? "Cargando…" : `✓ Cargar ${elegidas.length === 1 ? "1 producto" : `${elegidas.length} productos`}`}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {filas.map((f) => {
              const nueva = f.estado === "NUEVO";
              return (
                <li key={f.fila} className={`flex flex-col gap-2 rounded-xl border-2 bg-superficie p-3 ${!nueva || !f.incluida ? "border-borde opacity-60" : f.faltan.length ? "border-[var(--etiqueta-naranja)]" : "border-borde"}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    {nueva && <input type="checkbox" checked={f.incluida} onChange={(e) => cambiar(f.fila, { incluida: e.target.checked })} className="size-5" aria-label={`Cargar ${f.nombre}`} />}
                    <span aria-hidden className="text-3xl leading-none">
                      {f.dibujo}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{f.nombre}</span>
                      <span className="block text-sm text-texto-suave">
                        Fila {f.fila}
                        {nueva && ` · código ${f.codigo}`}
                        {f.envase && ` · se compra en ${f.envase.nombre}`}
                        {f.ganancia && ` · ganancia ${f.ganancia} %`}
                      </span>
                    </span>
                    {!nueva && <span className="rounded-full bg-fondo px-3 py-1 text-sm font-semibold">{f.estado === "YA_EXISTE" ? "Ya existe: no se carga" : "Repetido en la planilla"}</span>}
                    {nueva && (
                      <span className="flex flex-wrap gap-2">
                        <label className="flex flex-col text-xs font-semibold text-texto-suave">
                          Categoría{f.categoriaPropuesta && " (propuesta)"}
                          <select
                            value={f.categoria ?? SIN}
                            onChange={(e) => cambiar(f.fila, { categoria: e.target.value === SIN ? null : e.target.value, categoriaPropuesta: false })}
                            className="h-10 rounded-lg border border-borde bg-superficie px-2 text-sm text-texto"
                          >
                            {opcionesCategoria.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            <option value={SIN}>Ninguna</option>
                          </select>
                        </label>
                        <label className="flex flex-col text-xs font-semibold text-texto-suave">
                          Se vende por{f.unidadPropuesta && " (propuesto)"}
                          <select
                            value={f.unidad}
                            onChange={(e) => {
                              const unidad = e.target.value as UnidadDeVenta;
                              cambiar(f.fila, { unidad, unidadPropuesta: false, admiteFraccion: unidad === "KG" || unidad === "LITRO", faltan: f.faltan.filter((x) => !x.includes("cómo se vende")) });
                            }}
                            className={`h-10 rounded-lg border bg-superficie px-2 text-sm text-texto ${f.unidadPropuesta ? "border-[var(--etiqueta-naranja)] border-2" : "border-borde"}`}
                          >
                            {Object.entries(UNIDADES_EN_PALABRAS).map(([valor, texto]) => (
                              <option key={valor} value={valor}>
                                {texto}
                              </option>
                            ))}
                          </select>
                        </label>
                      </span>
                    )}
                  </div>
                  {nueva && f.incluida && f.faltan.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {f.faltan.map((x) => (
                        <li key={x} className="w-fit rounded-md bg-[var(--pastel-naranja)] px-2 py-0.5 text-sm font-semibold text-[var(--pastel-naranja-texto)]">
                          ⚠ {x}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
