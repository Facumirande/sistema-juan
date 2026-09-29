import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { datosParaCargarPedido } from "@/modulos/pedidos/carga";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { parametro } from "@/ui/parametros";

import { CargadorDePedido } from "../cargador";

export const metadata: Metadata = { title: "Nuevo pedido · Sistema Juan" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** P-41 Nuevo pedido (28/09/2026): cliente, día y productos en recuadros; se guarda completo de una vez. */
export default async function NuevoPedido({ searchParams }: PageProps<"/pedidos/nuevo">) {
  const sesion = await sesionParaPantalla("pedidos.crear");
  const sp = await searchParams;
  const datos = await datosParaCargarPedido(obtenerBaseDatos(), sesion.authUserId);
  const pedida = parametro(sp.fecha);
  const fecha = pedida && FECHA.test(pedida) && pedida >= datos.hoy && !datos.cerrados.includes(pedida) ? pedida : datos.sugerida;
  return <CargadorDePedido datos={datos} fechaInicial={fecha} clienteInicial={parametro(sp.cliente) ?? null} puedeConfirmar={sesion.permisos.includes("pedidos.confirmar")} />;
}
