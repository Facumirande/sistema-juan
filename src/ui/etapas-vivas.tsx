"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { ClaveEtapa, EstadoEtapa } from "@/dominio/jornadas/etapas";

import { DiaDelMenu } from "./dia-del-menu";
import { useDiaEnCurso } from "./dia-en-curso";
import { EnlaceDeEtapa } from "./enlace-menu";
import { fechaConDia } from "./etiquetas";
import { ICONO_NAVEGACION } from "./navegacion";

// Las etapas del día en el menú de la izquierda, del lado del navegador (pedido del usuario,
// 10/10/2026: que el menú no demore al cambiar de día). El día se cambia en el momento: el menú ya
// muestra la fecha nueva y los enlaces a ese día, y pide por su cuenta cómo va cada etapa (`/etapas`,
// una consulta chica) mientras la pantalla llega, en vez de esperar a que la pantalla cargue y se
// vuelva a pedir entera. Lo que ya se vio de un día se muestra enseguida al volver a él, y se pone
// al día con lo que manda el servidor cada vez que la pantalla se redibuja.

export type EtapaVisible = Exclude<ClaveEtapa, "pedidos">;

/** Lo que el menú necesita saber de un día (lo que devuelve `procesoEnCurso`, en JSON). */
export interface EtapasDeUnDia {
  fecha: string;
  etapas: readonly { clave: ClaveEtapa; estado: EstadoEtapa; detalle: string | null }[];
}

const ETAPAS: Readonly<Record<EtapaVisible, { etiqueta: string; icono: string; ruta: (fecha: string) => string }>> = {
  lista: { etiqueta: "Lista de compras", icono: "🛒", ruta: (f) => `/lista-compra?fecha=${f}` },
  preparacion: { etiqueta: "Preparación", icono: "📦", ruta: (f) => `/preparacion/${f}` },
  remitos: { etiqueta: "Remitos", icono: "🧾", ruta: (f) => `/entregas/remitos?fecha=${f}` },
  viaje: { etiqueta: "Logística y entregas", icono: ICONO_NAVEGACION, ruta: (f) => `/viaje?fecha=${f}` },
  cierre: { etiqueta: "Cierre del día", icono: "🔒", ruta: (f) => `/jornadas/${f}/cierre` },
};

/** Lo último que se supo de cada día en esta pestaña: al volver a un día se ve enseguida. */
const vistos = new Map<string, EtapasDeUnDia>();

export function EtapasVivas({
  inicial,
  hoy,
  permitidas,
  sueltas,
}: {
  /** Lo que mandó el servidor con la pantalla: las etapas del día elegido (o del que está en curso); nulo si no hay ninguno. */
  inicial: EtapasDeUnDia | null;
  hoy: string;
  /** Las etapas que esta persona puede abrir, en orden. */
  permitidas: readonly EtapaVisible[];
  /** Los enlaces de siempre, para cuando no hay un día en curso. */
  sueltas: ReactNode;
}) {
  const dia = useDiaEnCurso(inicial?.fecha ?? null);
  // Lo que se pidió desde acá (al cambiar de día). Lo del servidor llega por `inicial`.
  const [pedido, setPedido] = useState<EtapasDeUnDia | null>(null);
  // Lo más nuevo que se sabe del día que se mira: lo del servidor si es de ese día y llegó después.
  const [delServidor, setDelServidor] = useState(inicial);
  if (inicial !== delServidor) {
    setDelServidor(inicial);
    // Llegó una pantalla nueva con las etapas al día: lo pedido antes desde acá ya quedó viejo.
    if (inicial && pedido && inicial.fecha === pedido.fecha) setPedido(null);
  }
  const alDia = dia === null ? null : pedido?.fecha === dia ? pedido : inicial?.fecha === dia ? inicial : null;

  useEffect(() => {
    if (inicial) vistos.set(inicial.fecha, inicial);
  }, [inicial]);
  useEffect(() => {
    // Con las etapas de ese día ya a mano (vinieron con la pantalla) no hace falta pedirlas.
    if (dia === null || inicial?.fecha === dia) return;
    const corte = new AbortController();
    void (async () => {
      try {
        const respuesta = await fetch(`/etapas?dia=${dia}`, { cache: "no-store", signal: corte.signal });
        if (!respuesta.ok) return;
        const nuevo = (await respuesta.json()) as EtapasDeUnDia | null;
        if (!nuevo || corte.signal.aborted) return;
        vistos.set(nuevo.fecha, nuevo);
        setPedido(nuevo);
      } catch {
        // Sin conexión por un momento (o se cambió de día antes de que llegue): quedan los enlaces del día, sin el avance.
      }
    })();
    return () => corte.abort();
  }, [dia, inicial]);

  if (dia === null || permitidas.length === 0) return sueltas;
  // Mientras llega lo nuevo, lo último que se vio de ese día (si se vio) o los enlaces solos.
  const proceso = alDia ?? vistos.get(dia) ?? null;
  const etapa = new Map(proceso?.etapas.map((e) => [e.clave, e]));
  return (
    <div className="mt-1 mb-1 ml-3 flex flex-col gap-0.5 border-l-2 border-borde pl-2" role="group" aria-label={`Etapas del ${fechaConDia(dia)}`}>
      <DiaDelMenu fecha={dia} hoy={hoy} />
      {permitidas.map((clave) => {
        const def = ETAPAS[clave];
        const e = etapa.get(clave);
        // Hasta que llega cómo va ese día, el avance se ve apagado (lo último que se supo, o nada).
        return <EnlaceDeEtapa key={clave} href={def.ruta(dia)} icono={def.icono} etiqueta={def.etiqueta} estado={e?.estado ?? "pendiente"} detalle={e?.detalle ?? null} cargando={alDia === null} />;
      })}
    </div>
  );
}
