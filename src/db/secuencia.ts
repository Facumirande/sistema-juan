import { eq, sql } from "drizzle-orm";

import { ErrorDeNegocio } from "@/dominio/errores";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";

import { secuencia, type tipoSecuencia } from "./esquema";
import type { Transaccion } from "./tipos";

export type TipoSecuencia = (typeof tipoSecuencia.enumValues)[number];

/** Prefijos de 03 §4.5. */
export const PREFIJOS_SECUENCIA: Readonly<Record<TipoSecuencia, string>> = {
  PEDIDO: "PED-",
  LISTA_COMPRA: "LC-",
  COMPRA: "COM-",
  PAGO_PROVEEDOR: "PAG-",
  REPARTO: "REP-",
  ENTREGA: "ENT-",
  FACTURA: "FAC-",
  COBRO_CLIENTE: "COB-",
  AJUSTE_STOCK: "AJS-",
};

/**
 * Toma el próximo número del tipo de documento dentro de la transacción que crea el
 * documento. El bloqueo de la fila evita duplicados y, si la transacción se revierte,
 * el número no se consume (03 §4.5, RN-149).
 */
export async function siguienteNumero(tx: Transaccion, tipo: TipoSecuencia): Promise<{ numero: number; visible: string }> {
  const [fila] = await tx
    .update(secuencia)
    .set({ ultimoNumero: sql`${secuencia.ultimoNumero} + 1` })
    .where(eq(secuencia.tipo, tipo))
    .returning({ numero: secuencia.ultimoNumero, prefijo: secuencia.prefijo, relleno: secuencia.relleno });
  if (!fila) {
    throw new ErrorDeNegocio("NO_ENCONTRADO", `La empresa no tiene configurada la numeración de ${tipo}.`);
  }
  return { numero: fila.numero, visible: formatearNumeroDocumento(fila.prefijo, fila.numero, fila.relleno) };
}
