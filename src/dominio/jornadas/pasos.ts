// El día de trabajo paso a paso (pantalla "Hoy"): en qué quedó cada etapa de la jornada y cuál
// toca ahora. Un paso que nunca se empezó cuando ya arrancó uno posterior figura como salteado;
// uno que quedó a medias sigue en curso, pero deja de ser "el que toca" si ya se terminó uno
// posterior (por ejemplo, un producto que no se compró cuando ya se preparó todo).

export type ClavePaso = "pedidos" | "lista" | "compras" | "preparacion" | "remitos" | "entregas" | "cierre";
export type EstadoPaso = "hecho" | "en_curso" | "pendiente" | "salteado";

export const ORDEN_PASOS: readonly ClavePaso[] = ["pedidos", "lista", "compras", "preparacion", "remitos", "entregas", "cierre"];

export interface DatosDelDia {
  /** Estado de la jornada; nulo si todavía no hay pedidos. */
  jornada: string | null;
  pedidos: { confirmados: number; borradores: number };
  lista: { armada: boolean; desactualizada: boolean; lineas: number; resueltas: number };
  compras: number;
  /** Entregas vigentes: total, preparadas (o más), con documentos al día, en camino (o entregadas) y entregadas. */
  entregas: { total: number; preparadas: number; conDocumentos: number; enCamino: number; entregadas: number };
  repartos: number;
}

export interface PasosDelDia {
  pasos: { clave: ClavePaso; estado: EstadoPaso }[];
  /** El paso que toca; nulo si el día está terminado. */
  actual: ClavePaso | null;
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
      return segun(d.lista.armada && !d.lista.desactualizada, d.lista.armada);
    case "compras":
      return segun(d.lista.lineas > 0 && d.lista.resueltas === d.lista.lineas, d.compras > 0 || d.lista.resueltas > 0);
    case "preparacion":
      return segun(hay && e.preparadas === e.total, hay);
    case "remitos":
      return segun(hay && e.conDocumentos === e.total, e.conDocumentos > 0);
    case "entregas":
      return segun(hay && e.entregadas === e.total, d.repartos > 0 || e.enCamino > 0);
    case "cierre":
      return segun(d.jornada === "CERRADA", false);
  }
}

export function pasosDelDia(d: DatosDelDia): PasosDelDia {
  const cerrada = d.jornada === "CERRADA";
  const propios = ORDEN_PASOS.map((clave) => ({ clave, estado: cerrada ? ("hecho" as const) : estadoPropio(clave, d) }));
  const despues = (i: number) => propios.slice(i + 1);
  const pasos = propios.map((p, i) => ({
    clave: p.clave,
    estado: p.estado === "pendiente" && despues(i).some((q) => q.estado !== "pendiente") ? ("salteado" as const) : p.estado,
  }));
  const actual = pasos.find((p, i) => (p.estado === "en_curso" || p.estado === "pendiente") && !despues(i).some((q) => q.estado === "hecho"))?.clave ?? null;
  return { pasos, actual, hechos: pasos.filter((p) => p.estado === "hecho").length };
}
