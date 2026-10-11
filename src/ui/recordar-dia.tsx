"use client";

import { useEffect } from "react";

import { elegirDia } from "./dia-en-curso";

// Recuerda el día que se está mirando (por 12 horas) para que el menú y las demás pantallas del día
// vayan a ese mismo día. El menú se entera en el momento y pide solo sus etapas (`EtapasVivas`): la
// pantalla no se vuelve a pedir entera.

export function RecordarDia({ fecha }: { fecha: string }) {
  useEffect(() => {
    elegirDia(fecha);
  }, [fecha]);
  return null;
}
