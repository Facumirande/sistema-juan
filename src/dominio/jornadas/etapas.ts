import type { ClavePaso, DatosDelDia, EstadoPaso, PasosDelDia } from "./pasos";

// Las etapas del día en el menú de la izquierda (pedido del usuario, 06/10/2026): con un día en
// curso, cada etapa se abre directo desde el menú, sin pasar por el tablero, con su avance en
// pocas palabras. Las compras van con la lista de compras (se anotan desde ella) y los remitos
// tienen su propia etapa para tenerlos a mano.

export type ClaveEtapa = "pedidos" | "lista" | "preparacion" | "remitos" | "viaje" | "cierre";
export type EstadoEtapa = "hecho" | "actual" | "en_curso" | "pendiente";

export interface EtapaDelMenu {
  clave: ClaveEtapa;
  estado: EstadoEtapa;
  /** El avance dicho corto ("2 de 3 listos"); nulo si no hay nada que contar. */
  detalle: string | null;
}

const ETAPA_DEL_PASO: Readonly<Record<ClavePaso, ClaveEtapa>> = {
  pedidos: "pedidos",
  lista: "lista",
  compras: "lista",
  preparacion: "preparacion",
  entregas: "viaje",
  cierre: "cierre",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function estadoDe(pasos: PasosDelDia, propios: readonly ClavePaso[], clave: ClaveEtapa): EstadoEtapa {
  if (pasos.actual && ETAPA_DEL_PASO[pasos.actual] === clave) return "actual";
  const estados = pasos.pasos.filter((p) => propios.includes(p.clave)).map((p) => p.estado);
  const hecho = (e: EstadoPaso) => e === "hecho" || e === "salteado";
  if (estados.every(hecho)) return "hecho";
  return estados.some((e) => e === "en_curso" || e === "hecho") ? "en_curso" : "pendiente";
}

export function etapasDelMenu(d: DatosDelDia, pasos: PasosDelDia): EtapaDelMenu[] {
  const e = d.entregas;
  const enCamino = e.enCamino - e.entregadas;
  return [
    {
      clave: "pedidos",
      estado: estadoDe(pasos, ["pedidos"], "pedidos"),
      detalle: d.pedidos.confirmados || d.pedidos.borradores ? plural(d.pedidos.confirmados + d.pedidos.borradores, "pedido", "pedidos") : null,
    },
    {
      clave: "lista",
      estado: estadoDe(pasos, ["lista", "compras"], "lista"),
      detalle: d.lista.armada ? `${d.lista.resueltas} de ${d.lista.lineas} comprados` : "sin armar",
    },
    {
      clave: "preparacion",
      estado: estadoDe(pasos, ["preparacion"], "preparacion"),
      detalle: e.total ? `${e.preparadas} de ${e.total} listos${d.sinPreparar ? ` · ${plural(d.sinPreparar, "pedido", "pedidos")} sin empezar` : ""}` : null,
    },
    {
      clave: "remitos",
      estado: e.total > 0 && e.conDocumentos === e.total ? "hecho" : e.conDocumentos > 0 ? "en_curso" : "pendiente",
      detalle: e.conDocumentos ? plural(e.conDocumentos, "hecho", "hechos") : null,
    },
    {
      clave: "viaje",
      estado: estadoDe(pasos, ["entregas"], "viaje"),
      detalle: e.enCamino ? [enCamino ? `${enCamino} en camino` : null, e.entregadas ? plural(e.entregadas, "entregado", "entregados") : null].filter(Boolean).join(" · ") : null,
    },
    { clave: "cierre", estado: estadoDe(pasos, ["cierre"], "cierre"), detalle: null },
  ];
}
