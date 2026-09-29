"use client";

import { useEffect } from "react";

import type { TipoEntidad } from "@/modulos/colaboracion/registro";

import { marcarLeidasAccion } from "./acciones";

/** Al ver notas sin leer, las marca como leídas (una vez, al abrir la tarjeta o la ficha). */
export function MarcarLeidas({ entidadTipo, entidadId, hay }: { entidadTipo: TipoEntidad; entidadId: string; hay: boolean }) {
  useEffect(() => {
    if (hay) void marcarLeidasAccion(entidadTipo, entidadId);
  }, [entidadTipo, entidadId, hay]);
  return null;
}
