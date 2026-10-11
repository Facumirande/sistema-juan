"use client";

import "leaflet/dist/leaflet.css";

import type { Map as MapaLeaflet, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";

import type { Coordenada } from "@/dominio/entregas/recorrido";
import { enLaZona, mostrarCoordenadas, ZONA_DEL_NEGOCIO } from "@/dominio/entregas/ubicacion";

import { sugerirLugaresAccion } from "./acciones";
import { BuscadorDeLugar } from "./buscador-de-lugar";

// Mapa incrustado para marcar un lugar con un clic (pedido del usuario, 06/10/2026: desde la
// computadora la ubicación se marca solo en el mapa). Usa Leaflet con los mapas de OpenStreetMap;
// se carga recién cuando se abre. El punto se puede arrastrar para afinarlo. La dirección escrita
// solo sirve para llevar el mapa a la zona (no marca nada sola).

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

export function MapaParaMarcar({
  actual,
  direccion,
  centro,
  guardando,
  alGuardar,
  alCancelar,
}: {
  actual: Coordenada | null;
  direccion: string;
  /** Un lugar conocido para empezar cerca (ej. de dónde salen los repartos). */
  centro: Coordenada | null;
  guardando: boolean;
  /** Recibe el lugar marcado y la dirección que se escribió para llevar el mapa (si se escribió). */
  alGuardar: (c: Coordenada, direccion: string) => void;
  alCancelar: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const marca = useRef<Marker | null>(null);
  const [elegido, setElegido] = useState<Coordenada | null>(actual);
  const [texto, setTexto] = useState(direccion);
  const [aviso, setAviso] = useState<string | null>(null);
  // Para poner el punto desde el buscador (lo arma el mapa al abrirse).
  const ponerDesdeAfuera = useRef<((c: Coordenada) => void) | null>(null);

  // El mapa se arma una vez, al abrirse; se desarma al cerrarse.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedor.current || mapa.current) return;
      // Sin un punto marcado, arranca en el lugar de referencia si está en Tucumán (la zona del negocio) o en San Miguel de Tucumán.
      const cerca = centro && enLaZona(centro) ? centro : null;
      const inicio = actual ?? cerca ?? ZONA_DEL_NEGOCIO.centro;
      const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true }).setView([inicio.lat, inicio.lng], actual ? 17 : cerca ? 14 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      const icono = L.divIcon({ className: "", html: '<div class="marca-del-mapa" aria-hidden="true"></div>', iconSize: [28, 28], iconAnchor: [14, 28] });
      const poner = (c: Coordenada) => {
        const punto = { lat: redondear(c.lat), lng: redondear(c.lng) };
        setElegido(punto);
        if (marca.current) marca.current.setLatLng([punto.lat, punto.lng]);
        else {
          marca.current = L.marker([punto.lat, punto.lng], { icon: icono, draggable: true, keyboard: true, title: "Lugar marcado (se puede arrastrar)" }).addTo(m);
          marca.current.on("dragend", () => {
            const p = marca.current!.getLatLng();
            poner({ lat: p.lat, lng: p.lng });
          });
        }
      };
      if (actual) poner(actual);
      ponerDesdeAfuera.current = poner;
      m.on("click", (e) => poner({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapa.current = m;
      // Sin punto marcado, el mapa arranca en la dirección escrita (si se encuentra).
      if (!actual && direccion.trim()) {
        const primero = (await sugerirLugaresAccion(direccion))[0];
        if (!cancelado && primero) m.setView([primero.coordenada.lat, primero.coordenada.lng], 16);
      }
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      marca.current = null;
    };
    // Se arma una sola vez: los cambios posteriores los maneja el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boton = "min-h-10 rounded-lg border border-borde bg-superficie px-3 text-sm font-medium hover:border-marca disabled:opacity-60";
  return (
    <div className="flex flex-col gap-2">
      {/* Sin <form>: este mapa puede quedar dentro de otro formulario. Lo que se elige lleva el mapa ahí y deja el punto puesto. */}
      <BuscadorDeLugar
        valor={texto}
        alCambiar={setTexto}
        alElegir={(l) => {
          mapa.current?.setView([l.coordenada.lat, l.coordenada.lng], 17);
          ponerDesdeAfuera.current?.(l.coordenada);
          setAviso("Listo: si hace falta, arrastrá el punto al lugar exacto y guardalo.");
        }}
        placeholder="Buscá la calle y el número (o el lugar)"
      />
      <div ref={contenedor} className="relative z-0 h-80 w-full overflow-hidden rounded-xl border border-borde" role="application" aria-label="Mapa: hacé clic en el lugar para marcarlo" />
      <p className="text-sm text-texto-suave" role="status">
        {aviso ?? (elegido ? `Marcado en ${mostrarCoordenadas(elegido)}. Podés arrastrar el punto para afinarlo.` : "Hacé clic (o tocá) en el lugar exacto para marcarlo.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!elegido || guardando} onClick={() => elegido && alGuardar(elegido, texto)} className="min-h-11 rounded-lg bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60">
          {guardando ? "Guardando…" : "✓ Guardar este lugar"}
        </button>
        <button type="button" onClick={alCancelar} className={boton}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
