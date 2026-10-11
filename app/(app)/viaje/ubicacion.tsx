"use client";

import { startTransition, useActionState, useState, useTransition } from "react";

import { enlaceVerEnMapa } from "@/dominio/entregas/navegacion";
import type { Coordenada } from "@/dominio/entregas/recorrido";
import { leerCoordenadas, mostrarCoordenadas } from "@/dominio/entregas/ubicacion";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { leerEnlaceAccion } from "./acciones";
import { BuscadorDeLugar } from "./buscador-de-lugar";
import { MapaParaMarcar } from "./mapa-para-marcar";

// Marcar dónde queda un lugar, igual en la computadora y en el celular (10/10/2026: un solo método
// en toda la aplicación). Se escribe la dirección y se elige entre los lugares de Tucumán que van
// apareciendo; eso abre el mapa con el punto puesto, para afinarlo y guardarlo. También se puede
// marcar directo en el mapa, estando ahí (el GPS) o pegando un enlace de Google Maps.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

export function MarcarUbicacion({
  accion,
  campos,
  actual,
  direccion,
  centro = null,
  titulo = "Ubicación en el mapa",
  guardaDireccion = false,
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
  /** La dirección que se buscó se guarda junto con la ubicación (el depósito). */
  guardaDireccion?: boolean;
}) {
  const [estado, guardar, guardando] = useActionState(accion, ESTADO_INICIAL);
  const [buscando, empezar] = useTransition();
  /** El lugar elegido en el buscador, para abrir el mapa con el punto puesto. */
  const [propuesta, setPropuesta] = useState<Coordenada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState(direccion);
  const [pegado, setPegado] = useState("");
  const [conMapa, setConMapa] = useState(false);

  const enviar = (c: Coordenada | null, conDireccion?: string) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    if (c) {
      fd.append("lat", String(c.lat));
      fd.append("lng", String(c.lng));
    }
    if (guardaDireccion && conDireccion?.trim()) fd.append("direccion", conDireccion.trim());
    setPropuesta(null);
    setAviso(null);
    setConMapa(false);
    startTransition(() => guardar(fd));
  };
  const estoyAca = () => {
    if (!navigator.geolocation) {
      setAviso("Este aparato no tiene GPS disponible en el navegador. Probá marcándolo en el mapa.");
      return;
    }
    setAviso("Buscando dónde estás…");
    navigator.geolocation.getCurrentPosition(
      (p) => enviar({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => setAviso("No se pudo saber dónde estás: permití la ubicación en el navegador y probá de nuevo, o marcalo en el mapa."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const usarPegado = () =>
    empezar(async () => {
      const c = leerCoordenadas(pegado) ?? (await leerEnlaceAccion(pegado));
      if (c) enviar(c);
      else setAviso("No encontré una ubicación en eso. En Google Maps tocá “Compartir”, copiá el enlace y pegalo acá (o las coordenadas, ej. -34.6037, -58.3816).");
    });
  const boton = "min-h-12 rounded-xl border-2 border-borde bg-superficie px-4 font-semibold hover:border-marca disabled:opacity-60";
  const entrada = "h-12 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3";
  const ocupado = buscando || guardando;
  const id = campos.puntoId ?? "salida";

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-fondo p-4">
      <p className="font-semibold">
        📍 {titulo}:{" "}
        {actual ? (
          <>
            <span className="text-marca">✓ marcada</span> <span className="text-sm font-normal text-texto-suave">({mostrarCoordenadas(actual)})</span>{" "}
            <a href={enlaceVerEnMapa({ coordenada: actual, direccion })} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              Ver en el mapa
            </a>
          </>
        ) : (
          <span className="font-normal text-error">todavía sin marcar</span>
        )}
      </p>
      {conMapa ? (
        <MapaParaMarcar actual={propuesta ?? actual} direccion={texto} centro={centro} guardando={guardando} alGuardar={enviar} alCancelar={() => setConMapa(false)} />
      ) : (
        <>
          <BuscadorDeLugar
            valor={texto}
            alCambiar={setTexto}
            alElegir={(l) => {
              setPropuesta(l.coordenada);
              setConMapa(true);
            }}
            etiqueta={`Buscar la dirección (${titulo.toLowerCase()})`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConMapa(true)} disabled={guardando} className={boton}>
              🗺️ {actual ? "Cambiarla en el mapa" : "Marcar en el mapa"}
            </button>
            <button type="button" onClick={estoyAca} disabled={ocupado} className={boton}>
              📱 Estoy en el lugar (GPS)
            </button>
          </div>
          <details>
            <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">Pegar un enlace de Google Maps (o las coordenadas)</summary>
            <div className="flex flex-wrap gap-2">
              <input id={`link-${id}`} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="Ej. el enlace que te mandaron por WhatsApp" aria-label="Enlace de Google Maps o coordenadas" className={entrada} />
              <button type="button" onClick={usarPegado} disabled={ocupado || !pegado.trim()} className={boton}>
                Usar
              </button>
            </div>
          </details>
        </>
      )}
      {(guardando || aviso || estado.mensaje) && (
        <p role={estado.ok || !estado.mensaje ? "status" : "alert"} className={`font-medium ${!guardando && !estado.ok && estado.mensaje ? "text-error" : "text-texto-suave"}`}>
          {guardando ? "Guardando…" : (aviso ?? estado.mensaje)}
        </p>
      )}
      {actual && !conMapa && (
        <div>
          <button type="button" onClick={() => enviar(null)} disabled={guardando} className="min-h-10 text-sm font-medium text-error underline underline-offset-4">
            Borrar la ubicación marcada
          </button>
        </div>
      )}
    </div>
  );
}
