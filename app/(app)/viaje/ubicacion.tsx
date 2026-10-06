"use client";

import { startTransition, useActionState, useState, useTransition } from "react";

import { enlaceVerEnMapa } from "@/dominio/entregas/navegacion";
import type { Coordenada } from "@/dominio/entregas/recorrido";
import { leerCoordenadas, mostrarCoordenadas } from "@/dominio/entregas/ubicacion";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { buscarEnMapaAccion, leerEnlaceAccion } from "./acciones";
import { MapaParaMarcar } from "./mapa-para-marcar";

// Marcar dónde queda un lugar. En la computadora hay una sola forma: marcarlo en el mapa
// incrustado (pedido del usuario, 06/10/2026). En el celular, además, estando ahí (el GPS),
// buscando la dirección o pegando un enlace de Google Maps (de WhatsApp, por ejemplo). Qué se ve
// lo decide el tipo de puntero (mouse o dedo) con CSS, así la pantalla no cambia al cargar.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

export function MarcarUbicacion({
  accion,
  campos,
  actual,
  direccion,
  centro = null,
  titulo = "Ubicación en el mapa",
}: {
  accion: Accion;
  /** Campos fijos que necesita la acción (ej. el id del lugar). */
  campos: Record<string, string>;
  actual: Coordenada | null;
  /** Dirección escrita, para llevar el mapa a la zona (y buscarla desde el celular). */
  direccion: string;
  /** Un lugar conocido para empezar el mapa cerca (ej. de dónde salen los repartos). */
  centro?: Coordenada | null;
  titulo?: string;
}) {
  const [estado, guardar, guardando] = useActionState(accion, ESTADO_INICIAL);
  const [buscando, empezar] = useTransition();
  const [lugares, setLugares] = useState<{ etiqueta: string; coordenada: Coordenada }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pegado, setPegado] = useState("");
  const [conMapa, setConMapa] = useState(false);

  const enviar = (c: Coordenada | null) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    if (c) {
      fd.append("lat", String(c.lat));
      fd.append("lng", String(c.lng));
    }
    setLugares([]);
    setAviso(null);
    setConMapa(false);
    startTransition(() => guardar(fd));
  };
  const estoyAca = () => {
    if (!navigator.geolocation) {
      setAviso("Este aparato no tiene GPS disponible en el navegador.");
      return;
    }
    setAviso("Buscando dónde estás…");
    navigator.geolocation.getCurrentPosition(
      (p) => enviar({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => setAviso("No se pudo saber dónde estás: permití la ubicación en el navegador y probá de nuevo."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const usarPegado = () =>
    empezar(async () => {
      const c = leerCoordenadas(pegado) ?? (await leerEnlaceAccion(pegado));
      if (c) enviar(c);
      else setAviso("No encontré una ubicación en eso. Pegá el enlace de Google Maps (\"Compartir\") o las coordenadas, ej. -34.6037, -58.3816.");
    });
  const buscar = () =>
    empezar(async () => {
      const r = await buscarEnMapaAccion(direccion);
      setLugares(r.lugares);
      setAviso(r.mensaje);
    });
  const boton = "min-h-10 rounded-lg border border-borde bg-superficie px-3 text-sm font-medium hover:border-marca disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3">
      <p className="text-sm font-semibold">
        📍 {titulo}:{" "}
        {actual ? (
          <>
            <span className="font-normal">{mostrarCoordenadas(actual)}</span>{" "}
            <a href={enlaceVerEnMapa({ coordenada: actual, direccion })} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              Ver en el mapa
            </a>
          </>
        ) : (
          <span className="font-normal text-texto-suave">sin marcar (el GPS va a buscar la dirección escrita)</span>
        )}
      </p>
      {conMapa ? (
        <MapaParaMarcar actual={actual} direccion={direccion} centro={centro} guardando={guardando} alGuardar={(c) => enviar(c)} alCancelar={() => setConMapa(false)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConMapa(true)} disabled={guardando} className={`${boton} pointer-fine:bg-marca pointer-fine:text-marca-texto`}>
              🗺️ {actual ? "Cambiarla en el mapa" : "Marcar en el mapa"}
            </button>
            {/* En el celular, además: el GPS, buscar la dirección o pegar un enlace. */}
            <button type="button" onClick={estoyAca} disabled={guardando} className={`${boton} pointer-fine:hidden`}>
              📱 Estoy en el lugar
            </button>
            <button type="button" onClick={buscar} disabled={buscando || guardando || !direccion.trim()} className={`${boton} pointer-fine:hidden`}>
              🔎 Buscar la dirección
            </button>
            {actual && (
              <button type="button" onClick={() => enviar(null)} disabled={guardando} className={`${boton} text-error`}>
                Borrar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pointer-fine:hidden">
            <input
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
              placeholder="…o pegá un enlace de Google Maps o las coordenadas"
              aria-label="Enlace de Google Maps o coordenadas"
              className="h-10 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 text-sm"
            />
            <button type="button" onClick={usarPegado} disabled={buscando || guardando || !pegado.trim()} className={boton}>
              Usar
            </button>
          </div>
          {lugares.length > 0 && (
            <ul className="flex flex-col gap-1 pointer-fine:hidden">
              {lugares.map((l) => (
                <li key={`${l.coordenada.lat},${l.coordenada.lng}`}>
                  <button type="button" onClick={() => enviar(l.coordenada)} className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-left text-sm hover:border-marca">
                    <b>Es acá:</b> {l.etiqueta}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {(aviso || estado.mensaje) && (
        <p role={estado.ok || !estado.mensaje ? "status" : "alert"} className={`text-sm ${!estado.ok && estado.mensaje ? "text-error" : "text-texto-suave"}`}>
          {estado.mensaje ?? aviso}
        </p>
      )}
    </div>
  );
}
