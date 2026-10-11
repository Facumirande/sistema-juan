"use client";

import { useState } from "react";

import { esAOjo } from "@/dominio/entregas/ubicacion";

import { BuscadorDeLugar } from "../viaje/buscador-de-lugar";

// La dirección de un lugar de entrega al agregarlo o editarlo en la ficha del cliente (pedido del
// usuario, 11/10/2026: al editar no dejaba volver a buscar la ubicación). Es el mismo buscador del
// alta: mientras se escribe aparecen los lugares, y al elegir uno la dirección queda escrita y su
// ubicación marcada con el mismo "Guardar". Si solo se corrige el texto, la ubicación que tenía no se
// toca; y si el lugar no figura en el mapa, queda lo escrito y se lo marca a mano en "Ubicación en el
// mapa", ahí arriba.

export function DireccionDeEntrega({ prefijo = "", direccion = "" }: { prefijo?: string; direccion?: string }) {
  const [texto, setTexto] = useState(direccion);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [noFigura, setNoFigura] = useState(false);
  /** Cómo se calculó el punto cuando no salió tal cual del mapa ("entre el 480 y el 520"). */
  const [aOjo, setAOjo] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">Dirección</span>
      <input type="hidden" name={`${prefijo}direccion`} value={texto} />
      {ubicacion && (
        <>
          <input type="hidden" name={`${prefijo}lat`} value={ubicacion.lat} />
          <input type="hidden" name={`${prefijo}lng`} value={ubicacion.lng} />
        </>
      )}
      <BuscadorDeLugar
        valor={texto}
        alCambiar={(t) => {
          setTexto(t);
          setUbicacion(null);
          setNoFigura(false);
          setAOjo(null);
        }}
        alElegir={(l) => {
          if (l.aproximado) return setNoFigura(true);
          setTexto(l.etiqueta);
          setUbicacion(l.coordenada);
          setAOjo(esAOjo(l) ? (l.nota ?? null) : null);
        }}
        etiqueta="Dirección de entrega"
        placeholder="Calle y número, la esquina o el nombre del lugar"
      />
      <span className={`text-sm ${ubicacion ? "font-semibold text-marca" : "text-texto-suave"}`}>
        {ubicacion
          ? aOjo
            ? `✓ Ubicación nueva, calculada (${aOjo}): se guarda con la dirección. Revisala después en “Ubicación en el mapa”.`
            : "✓ Ubicación nueva: se guarda junto con la dirección."
          : noFigura
            ? "Ese lugar no figura en el mapa: guardá la dirección y marcá el punto en “Ubicación en el mapa”."
            : "Elegí la dirección de la lista para marcar también su ubicación."}
      </span>
    </div>
  );
}
