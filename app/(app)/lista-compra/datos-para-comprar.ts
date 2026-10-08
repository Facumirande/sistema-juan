import { presentacionesNecesarias } from "@/dominio/unidades/unidades";
import { dec } from "@/dominio/dinero/decimal";
import { ABREVIATURA_UNIDAD, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import type { LineaDeLista } from "@/modulos/compras/lista-compra";

import type { DatosParaComprar } from "./precio-y-puesto";

// Lo que necesita el panel "Precio y puesto" para anotar la compra de un producto de la lista: se
// usa en el renglón de la lista de compras y en la tarjeta abierta del tablero.

/** Cuántos envases faltan comprar: lo que propone la lista o, si ya se compró una parte, lo que resta. */
export function envasesQueFaltan(l: LineaDeLista): string {
  const n =
    l.estado === "PARCIAL" && l.presentacion
      ? presentacionesNecesarias(l.pendienteBase, l.factor).cantidad
      : l.estado !== "COMPRADO" && l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero()
        ? dec(l.cantidadPresentaciones)
        : dec(l.pendienteBase);
  return formatearNumero(n.isZero() ? "1" : n.toString(), { decimales: 3, recortarCeros: true });
}

/** Los puestos que lo venden, sus envases y lo que se propone comprar (dónde, en qué y cuánto). */
export function datosParaComprar(l: LineaDeLista): DatosParaComprar {
  return {
    unidad: ABREVIATURA_UNIDAD[l.unidadBase as UnidadMedida] ?? l.unidadBase.toLowerCase(),
    envases: l.envases,
    ofertas: l.ofertas,
    sugerido: {
      proveedorId: l.proveedorId ?? l.ofertas[0]?.proveedorId ?? null,
      envaseId: l.presentacionId ?? l.ofertas[0]?.presentacionId ?? l.envases[0]?.id ?? null,
      cantidad: envasesQueFaltan(l),
    },
  };
}
