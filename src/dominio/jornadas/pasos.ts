// El día de trabajo paso a paso: en qué quedó cada etapa de la jornada y cuál toca ahora.
//
// Revisado el 29/09/2026: los remitos van dentro de la preparación (se hacen solos al marcar
// preparado cada cliente, no son un paso aparte), y "el que toca" es siempre el paso más
// avanzado que no está terminado. Lo que quedó a medias en un paso anterior (un borrador sin
// confirmar, un pedido afuera de la lista, un producto sin comprar) no lo vuelve a ser: queda
// como pendiente de atrás, para resolverlo sin frenar el día. Un paso que nunca se empezó cuando
// ya arrancó uno posterior figura como salteado.

export type ClavePaso = "pedidos" | "lista" | "compras" | "preparacion" | "entregas" | "cierre";
export type EstadoPaso = "hecho" | "en_curso" | "pendiente" | "salteado";

export const ORDEN_PASOS: readonly ClavePaso[] = ["pedidos", "lista", "compras", "preparacion", "entregas", "cierre"];

export interface DatosDelDia {
  /** Estado de la jornada; nulo si todavía no hay pedidos. */
  jornada: string | null;
  pedidos: { confirmados: number; borradores: number };
  /** `fueraDeLista`: pedidos confirmados que todavía no se agregaron a la lista armada. */
  lista: { armada: boolean; desactualizada: boolean; lineas: number; resueltas: number; fueraDeLista: number };
  compras: number;
  /** Entregas vigentes: total, preparadas (o más), con documentos al día, en camino (o entregadas) y entregadas. */
  entregas: { total: number; preparadas: number; conDocumentos: number; enCamino: number; entregadas: number };
  repartos: number;
}

export interface PasosDelDia {
  pasos: { clave: ClavePaso; estado: EstadoPaso }[];
  /** El paso que toca; nulo si el día está terminado. */
  actual: ClavePaso | null;
  /** Pasos anteriores al actual que quedaron a medias (pendientes de atrás). */
  atrasados: ClavePaso[];
  hechos: number;
}

type EstadoPropio = Exclude<EstadoPaso, "salteado">;

const segun = (hecho: boolean, empezado: boolean): EstadoPropio => (hecho ? "hecho" : empezado ? "en_curso" : "pendiente");

function estadoPropio(clave: ClavePaso, d: DatosDelDia): EstadoPropio {
  const e = d.entregas;
  const hay = e.total > 0;
  switch (clave) {
    case "pedidos":
      return segun(d.pedidos.confirmados > 0 && d.pedidos.borradores === 0, d.pedidos.borradores > 0);
    case "lista":
      return segun(d.lista.armada && !d.lista.desactualizada && d.lista.fueraDeLista === 0, d.lista.armada);
    case "compras":
      return segun(d.lista.lineas > 0 && d.lista.resueltas === d.lista.lineas, d.compras > 0 || d.lista.resueltas > 0);
    case "preparacion":
      // Terminada cuando todos los clientes están preparados y con sus remitos hechos.
      return segun(hay && e.preparadas === e.total && e.conDocumentos === e.total, hay);
    case "entregas":
      return segun(hay && e.entregadas === e.total, d.repartos > 0 || e.enCamino > 0);
    case "cierre":
      return segun(d.jornada === "CERRADA", false);
  }
}

export function pasosDelDia(d: DatosDelDia): PasosDelDia {
  const cerrada = d.jornada === "CERRADA";
  const propios = ORDEN_PASOS.map((clave) => ({ clave, estado: cerrada ? ("hecho" as const) : estadoPropio(clave, d) }));
  // Un paso queda superado cuando ya se empezó alguno posterior.
  const superado = (i: number) => propios.slice(i + 1).some((q) => q.estado !== "pendiente");
  const pasos = propios.map((p, i) => ({ clave: p.clave, estado: p.estado === "pendiente" && superado(i) ? ("salteado" as const) : p.estado }));
  const actual = propios.find((p, i) => p.estado !== "hecho" && !superado(i))?.clave ?? null;
  const atrasados = propios.filter((p, i) => p.estado === "en_curso" && superado(i)).map((p) => p.clave);
  return { pasos, actual, atrasados, hechos: pasos.filter((p) => p.estado === "hecho").length };
}
