"use server";

import { cambiarRecargo, cerrarRegla, crearRegla, type AmbitoRecargo, type TipoRegla } from "@/modulos/precios-venta/reglas";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de precios de venta (P-32 simplificada y P-33). Los permisos los verifica cada caso de uso.

export async function recargoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarRecargo(db, authUserId, {
      ambito: campo(datos, "ambito") as AmbitoRecargo,
      id: campo(datos, "id") || null,
      valor: campo(datos, "valor"),
      confirmar: tildada(datos, "confirmarVariacion"),
    });
    return { ok: true, mensaje: "Guardado. Los pedidos pendientes se recalcularon." };
  });
}

export async function nuevaReglaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    // El selector trae "producto:<id>" o "categoria:<id>".
    const [clase, objetivoId] = campo(datos, "objetivo").split(":");
    await crearRegla(db, authUserId, {
      clienteId: campo(datos, "clienteId"),
      tipo: campo(datos, "tipo") as TipoRegla,
      productoId: clase === "producto" ? objetivoId : null,
      categoriaId: clase === "categoria" ? objetivoId : null,
      valor: campo(datos, "valor"),
      vigenteDesde: campo(datos, "vigenteDesde"),
      vigenteHasta: campo(datos, "vigenteHasta"),
      referencia: campo(datos, "referencia"),
      confirmar: tildada(datos, "confirmarVariacion"),
    });
    return { ok: true, mensaje: "Regla guardada. Los pedidos pendientes de este cliente se recalcularon." };
  });
}

export async function cerrarReglaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cerrarRegla(db, authUserId, campo(datos, "reglaId"));
    return { ok: true, mensaje: "Regla quitada." };
  });
}
