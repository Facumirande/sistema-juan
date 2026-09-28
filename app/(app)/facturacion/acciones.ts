"use server";

import { anularComprobante, facturarPeriodo } from "@/modulos/facturacion/facturacion";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-85, P-86 y P-87. Los permisos los verifica cada caso de uso.

export async function facturarAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await facturarPeriodo(db, authUserId, {
      entregaIds: datos.getAll("entrega").map(String),
      desde: campo(datos, "desde") || null,
      hasta: campo(datos, "hasta") || null,
    });
    return { ok: true, mensaje: `Emitidos: ${r.map((x) => `${x.numero} (${formatearMoneda(x.total)})`).join(", ")}.` };
  });
}

export async function anularComprobanteAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularComprobante(db, authUserId, { facturaId: campo(datos, "facturaId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Comprobante anulado: sus entregas quedaron sin facturar." };
  });
}
