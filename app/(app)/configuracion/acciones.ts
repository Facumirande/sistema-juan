"use server";

import { guardarConfiguracion, type ClaveRedondeo } from "@/modulos/configuracion/empresa";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

export async function guardarConfiguracionAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await guardarConfiguracion(db, authUserId, {
      nombre: campo(datos, "nombre"),
      direccion: campo(datos, "direccion"),
      telefono: campo(datos, "telefono"),
      email: campo(datos, "email"),
      identificacionFiscal: campo(datos, "identificacionFiscal"),
      redondeo: campo(datos, "redondeo") as ClaveRedondeo,
      margenMinimoPct: campo(datos, "margenMinimoPct"),
      variacionBruscaPct: campo(datos, "variacionBruscaPct"),
      diasAlertaPrecioDesactualizado: campo(datos, "diasAlertaPrecioDesactualizado"),
      semaforoAmarilloPct: campo(datos, "semaforoAmarilloPct"),
      semaforoRojoPct: campo(datos, "semaforoRojoPct"),
      diasAvisoVencimiento: campo(datos, "diasAvisoVencimiento"),
      horaCortePedidos: campo(datos, "horaCortePedidos"),
      toleranciaPesoPct: campo(datos, "toleranciaPesoPct"),
    });
    return {
      ok: true,
      mensaje: r.pedidosRecalculados > 0 ? `Guardado. Se recalcularon los precios de ${r.pedidosRecalculados} pedido(s) pendiente(s).` : "Guardado.",
    };
  });
}
