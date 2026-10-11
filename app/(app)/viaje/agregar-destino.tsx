"use client";

import { useState, useTransition } from "react";

import type { Coordenada } from "@/dominio/entregas/recorrido";
import { leerCoordenadas, mostrarCoordenadas } from "@/dominio/entregas/ubicacion";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { agregarDestinoAccion, leerEnlaceAccion, quitarFavoritoAccion, renombrarFavoritoAccion } from "./acciones";
import { BuscadorDeLugar } from "./buscador-de-lugar";
import { MapaParaMarcar } from "./mapa-para-marcar";

// Sumar un destino al recorrido del día (pedido del usuario, 07/10/2026): un favorito con un toque,
// o un lugar nuevo con su nombre, que además se puede guardar como favorito. Los favoritos se
// renombran y se quitan desde acá mismo.

export interface Favorito {
  id: string;
  nombre: string;
  direccion: string | null;
  coordenada: Coordenada | null;
}

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

const boton = "min-h-11 rounded-xl border-2 border-borde bg-superficie px-3 font-semibold hover:border-marca disabled:opacity-60";
const entrada = "h-12 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3";

export function AgregarDestino({ fecha, favoritos, centro, alCerrar }: { fecha: string; favoritos: Favorito[]; centro: Coordenada | null; alCerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [coordenada, setCoordenada] = useState<Coordenada | null>(null);
  const [comoFavorito, setComoFavorito] = useState(false);
  const [conMapa, setConMapa] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ texto: string; grave: boolean } | null>(null);
  const [ocupado, empezar] = useTransition();

  const ejecutar = (accion: Accion, datos: Record<string, string>, alTerminar?: () => void) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) fd.append(clave, valor);
    empezar(async () => {
      const r = await accion(ESTADO_INICIAL, fd);
      // Solo se avisa cuando algo no se pudo hacer.
      setAviso(r.ok ? null : { texto: r.mensaje ?? "No se pudo guardar: revisá la conexión y probá de nuevo.", grave: true });
      if (r.ok) alTerminar?.();
    });
  };
  const marcar = (c: Coordenada) => {
    setCoordenada(c);
    setConMapa(false);
    setAviso(null);
  };
  // Lo escrito también puede ser un enlace de Google Maps o unas coordenadas pegadas.
  const escribir = (texto: string) => {
    setDireccion(texto);
    const pegada = leerCoordenadas(texto);
    if (pegada) return marcar(pegada);
    if (/^https?:/i.test(texto.trim()))
      empezar(async () => {
        const enlace = await leerEnlaceAccion(texto);
        if (enlace) marcar(enlace);
      });
  };
  const estoyAca = () => {
    if (!navigator.geolocation) return setAviso({ texto: "Este aparato no tiene GPS disponible en el navegador. Escribí la dirección y tocá Buscar.", grave: false });
    setAviso({ texto: "Buscando dónde estás…", grave: false });
    navigator.geolocation.getCurrentPosition(
      (p) => marcar({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => setAviso({ texto: "No se pudo saber dónde estás: permití la ubicación en el navegador y probá de nuevo, o escribí la dirección.", grave: false }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const agregarNuevo = () => {
    if (!nombre.trim()) return setAviso({ texto: "Ponele un nombre al destino (por ejemplo: Banco, Taller).", grave: true });
    if (!direccion.trim() && !coordenada) return setAviso({ texto: "Escribí la dirección o marcá dónde queda, así el GPS sabe a dónde ir.", grave: true });
    ejecutar(
      agregarDestinoAccion,
      { fecha, nombre, direccion, ...(coordenada ? { lat: String(coordenada.lat), lng: String(coordenada.lng) } : {}), favorito: comoFavorito ? "si" : "no" },
      alCerrar,
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-marca bg-superficie p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold">＋ Agregar destino</p>
        <button type="button" onClick={alCerrar} className="min-h-10 rounded-lg px-3 font-semibold hover:bg-fondo">
          Cerrar ✕
        </button>
      </div>

      {favoritos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">⭐ Favoritos {!editando && <span className="font-normal text-texto-suave">· tocá uno y se suma</span>}</p>
            <button type="button" onClick={() => setEditando((v) => !v)} className="min-h-10 rounded-lg px-2 text-sm font-semibold underline underline-offset-4">
              {editando ? "Listo" : "✏️ Cambiar nombres o quitar"}
            </button>
          </div>
          {editando ? (
            <ul className="flex flex-col gap-2">
              {favoritos.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <input value={nombres[f.id] ?? f.nombre} onChange={(e) => setNombres((n) => ({ ...n, [f.id]: e.target.value }))} aria-label={`Nombre de ${f.nombre}`} maxLength={60} className={entrada} />
                  <button
                    type="button"
                    disabled={ocupado || (nombres[f.id] ?? f.nombre).trim() === f.nombre || !(nombres[f.id] ?? f.nombre).trim()}
                    onClick={() => ejecutar(renombrarFavoritoAccion, { id: f.id, nombre: nombres[f.id] ?? f.nombre })}
                    className={boton}
                  >
                    Guardar
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => ejecutar(quitarFavoritoAccion, { id: f.id })} className={`${boton} text-error`}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2">
              {favoritos.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={ocupado}
                  onClick={() => ejecutar(agregarDestinoAccion, { fecha, favoritoId: f.id }, alCerrar)}
                  className="flex min-h-12 flex-col items-start justify-center rounded-xl border-2 border-amber-500 bg-amber-400/20 px-4 text-left leading-tight hover:bg-amber-400/40 disabled:opacity-60"
                >
                  <b>⭐ {f.nombre}</b>
                  {f.direccion && <span className="text-sm text-texto-suave">{f.direccion}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="font-semibold">{favoritos.length > 0 ? "📌 Otro lugar" : "📌 ¿A dónde hay que ir?"}</p>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Banco, Taller, Mercado" maxLength={60} autoComplete="off" className="h-12 w-full rounded-xl border-2 border-borde bg-superficie px-3" />
        </label>
        {conMapa ? (
          <MapaParaMarcar
            actual={coordenada}
            direccion={direccion}
            centro={centro}
            guardando={false}
            alGuardar={(c, escrita) => {
              marcar(c);
              if (!direccion.trim() && escrita.trim()) setDireccion(escrita.trim());
            }}
            alCancelar={() => setConMapa(false)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                Dirección <span className="font-normal text-texto-suave">(o un enlace de Google Maps)</span>
              </p>
              <BuscadorDeLugar valor={direccion} alCambiar={escribir} alElegir={(l) => marcar(l.coordenada)} etiqueta="Dirección del destino" placeholder="Calle y número, o el nombre del lugar" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setConMapa(true)} className={boton}>
                🗺️ {coordenada ? "Cambiarlo en el mapa" : "Marcar en el mapa"}
              </button>
              <button type="button" onClick={estoyAca} disabled={ocupado} className={boton}>
                📱 Estoy acá
              </button>
              <span className={`font-medium ${coordenada ? "text-marca" : "text-texto-suave"}`}>{coordenada ? `✓ Ubicación marcada (${mostrarCoordenadas(coordenada)})` : "Sin la ubicación marcada no entra en el cálculo del mejor recorrido."}</span>
            </div>
          </>
        )}
        <label className="flex min-h-11 items-center gap-3 font-medium">
          <input type="checkbox" checked={comoFavorito} onChange={(e) => setComoFavorito(e.target.checked)} className="size-6" />
          ⭐ Guardarlo como favorito
        </label>
        {aviso && (
          <p role={aviso.grave ? "alert" : "status"} className={`font-medium ${aviso.grave ? "text-error" : "text-texto-suave"}`}>
            {aviso.texto}
          </p>
        )}
        {!conMapa && (
          <button type="button" onClick={agregarNuevo} disabled={ocupado} className="min-h-14 rounded-xl bg-marca px-4 text-lg font-bold text-marca-texto disabled:opacity-60">
            {ocupado ? "Un momento…" : "＋ Agregar al recorrido"}
          </button>
        )}
      </div>
    </div>
  );
}
