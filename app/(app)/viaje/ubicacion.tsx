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
// escribiendo la dirección o pegando un enlace de Google Maps (de WhatsApp, por ejemplo). Qué se
// ve lo decide el tipo de puntero (mouse o dedo) con CSS, así la pantalla no cambia al cargar.

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
  const [lugares, setLugares] = useState<{ etiqueta: string; coordenada: Coordenada }[]>([]);
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
    setLugares([]);
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
  const buscar = () =>
    empezar(async () => {
      const r = await buscarEnMapaAccion(texto);
      setLugares(r.lugares);
      setAviso(r.mensaje);
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
        <MapaParaMarcar actual={actual} direccion={texto} centro={centro} guardando={guardando} alGuardar={enviar} alCancelar={() => setConMapa(false)} />
      ) : (
        <>
          <div>
            <button type="button" onClick={() => setConMapa(true)} disabled={guardando} className={`${boton} pointer-fine:border-marca pointer-fine:bg-marca pointer-fine:text-marca-texto`}>
              🗺️ {actual ? "Cambiarla en el mapa" : "Marcar en el mapa"}
            </button>
          </div>

          {/* En el celular, además: el GPS, la dirección escrita o un enlace pegado. */}
          <div className="flex flex-col gap-3 pointer-fine:hidden">
            <p className="text-sm text-texto-suave">O de la forma que te quede más cómoda:</p>
            <div>
              <button type="button" onClick={estoyAca} disabled={ocupado} className={boton}>
                📱 Estoy en el lugar: usar el GPS del celular
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-medium" htmlFor={`dir-${id}`}>
                Escribiendo la dirección
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id={`dir-${id}`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (texto.trim()) buscar();
                  }}
                  placeholder="Calle, número y localidad. Ej. Av. San Martín 1250, Morón"
                  className={entrada}
                />
                <button type="button" onClick={buscar} disabled={ocupado || !texto.trim()} className={boton}>
                  {buscando ? "Buscando…" : "🔎 Buscar"}
                </button>
              </div>
              {lugares.length > 0 && (
                <ul className="flex flex-col gap-1">
                  <li className="text-sm text-texto-suave">Tocá el que corresponde:</li>
                  {lugares.map((l) => (
                    <li key={`${l.coordenada.lat},${l.coordenada.lng}`}>
                      <button type="button" onClick={() => enviar(l.coordenada, texto)} disabled={guardando} className="min-h-12 w-full rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-left hover:border-marca">
                        <b>Es acá:</b> {l.etiqueta}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-medium" htmlFor={`link-${id}`}>
                Pegando un enlace de Google Maps (o las coordenadas)
              </label>
              <div className="flex flex-wrap gap-2">
                <input id={`link-${id}`} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="Ej. el enlace que te mandaron por WhatsApp" className={entrada} />
                <button type="button" onClick={usarPegado} disabled={ocupado || !pegado.trim()} className={boton}>
                  Usar
                </button>
              </div>
            </div>
          </div>
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
