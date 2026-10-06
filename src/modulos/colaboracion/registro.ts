import { actividad, type tipoEntidad } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";

// Registro de lo que hace cada persona (uso interno, 28/09/2026). Cada caso de uso lo escribe en
// su misma transacción: si el cambio se revierte, el registro también.

export type TipoEntidad = (typeof tipoEntidad.enumValues)[number];

export type AccionActividad =
  | "CREAR"
  | "CONFIRMAR"
  | "CANCELAR"
  | "DUPLICAR"
  | "PRIORIDAD"
  | "ASIGNAR"
  | "PLAZO"
  | "ARMAR_LISTA"
  | "SACAR_DE_LISTA"
  | "NO_CONSEGUIDO"
  | "COMPRAR"
  | "ANULAR"
  | "PAGAR"
  | "PREPARAR"
  | "PREPARADA"
  | "SALIR"
  | "VOLVER"
  | "ENTREGAR"
  | "CORREGIR"
  | "ORDENAR"
  | "CERRAR"
  | "REABRIR"
  | "FACTURAR"
  | "HABILITAR"
  | "UBICAR"
  | "CAMBIAR_PRODUCTOS"
  | "MODIFICAR"
  | "TILDAR"
  | "IMPORTAR"
  | "PRECIO";

export interface DatosActividad {
  accion: AccionActividad;
  entidadTipo: TipoEntidad;
  entidadId?: string | null;
  jornadaId?: string | null;
  /** Lo que hizo, sin el nombre de quien lo hizo y sin importes: "confirmó el pedido PED-000012 de Hospital San Martín". */
  resumen: string;
  /** A quién le toca enterarse en particular (le pasaron algo): le llega como aviso "para vos". */
  paraUsuarioId?: string | null;
}

export async function registrarActividad(tx: Transaccion, c: ContextoUsuario, datos: DatosActividad): Promise<void> {
  await tx.insert(actividad).values({
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: datos.accion,
    entidadTipo: datos.entidadTipo,
    entidadId: datos.entidadId ?? null,
    jornadaId: datos.jornadaId ?? null,
    resumen: datos.resumen,
    paraUsuarioId: datos.paraUsuarioId && datos.paraUsuarioId !== c.usuarioId ? datos.paraUsuarioId : null,
  });
}
