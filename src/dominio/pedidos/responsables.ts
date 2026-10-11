import { RETIRO_A_LA_VISTA } from "./tablero";

// Quién se encarga de cada parte del proceso, de manera fija (pedido del usuario, 10/10/2026: "dar la
// posibilidad de asignar a distintos usuarios cada parte del proceso"). Una persona por columna del
// tablero (salvo Entregados): se ve en la columna y le llega un aviso "para vos" cuando le toca.

export const ETAPAS_CON_RESPONSABLE = [
  { clave: "pedidos", titulo: "Pedidos", ayuda: "Carga los pedidos de los clientes." },
  { clave: "en_lista", titulo: "Lista de compras", ayuda: "Compra en el mercado." },
  { clave: "comprados", titulo: "Retiro", ayuda: "Retira lo comprado." },
  { clave: "preparando", titulo: "Preparación", ayuda: "Separa lo de cada cliente." },
  { clave: "en_camino", titulo: "Reparto", ayuda: "Sale a entregar." },
] as const;

export type EtapaConResponsable = (typeof ETAPAS_CON_RESPONSABLE)[number]["clave"];

/** Las etapas que se ofrecen para elegirles a alguien: todas, menos "Retiro" mientras esa columna está guardada (lo elegido antes no se pierde). */
export const ETAPAS_PARA_ELEGIR = ETAPAS_CON_RESPONSABLE.filter((e) => RETIRO_A_LA_VISTA || e.clave !== "comprados");

/** Persona (id de usuario) a cargo de cada etapa; la que no figura no tiene a nadie fijo. */
export type Responsables = Partial<Record<EtapaConResponsable, string>>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee lo guardado en la base (`empresa.responsables_etapa`), quedándose solo con lo que es válido. */
export function leerResponsables(guardado: unknown): Responsables {
  if (!guardado || typeof guardado !== "object" || Array.isArray(guardado)) return {};
  const resultado: Responsables = {};
  for (const { clave } of ETAPAS_CON_RESPONSABLE) {
    const valor = (guardado as Record<string, unknown>)[clave];
    if (typeof valor === "string" && ID.test(valor)) resultado[clave] = valor;
  }
  return resultado;
}
