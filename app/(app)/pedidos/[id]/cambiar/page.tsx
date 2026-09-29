import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { datosParaCargarPedido } from "@/modulos/pedidos/carga";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";

import { CargadorDePedido } from "../../cargador";

export const metadata: Metadata = { title: "Cambiar pedido · Sistema Juan" };

const ETAPA: Readonly<Record<string, string>> = {
  EN_PREPARACION: "preparándose",
  PREPARADO: "preparado",
  EN_REPARTO: "en camino",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
};

/** "Cambiar productos": la misma carga visual con lo que el pedido ya lleva. */
export default async function CambiarPedido({ params }: PageProps<"/pedidos/[id]/cambiar">) {
  const sesion = await sesionParaPantalla("pedidos.editar");
  const id = idDeRuta((await params).id);
  const datos = await cargarFicha(datosParaCargarPedido(obtenerBaseDatos(), sesion.authUserId, { pedidoId: id }));
  const pedido = datos.pedido;
  if (!pedido) notFound();

  const etapa = ETAPA[pedido.estado];
  const sinPermisoEnCurso = pedido.estado === "EN_COMPRA" && !sesion.permisos.includes("pedidos.editar_en_curso");
  if (etapa || sinPermisoEnCurso) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-2xl border border-borde bg-superficie p-6 text-center sm:p-10">
        <span aria-hidden className="text-6xl leading-none">
          🔒
        </span>
        <h1 className="text-2xl font-semibold">El pedido {pedido.numero} ya no se puede cambiar</h1>
        <p className="text-lg text-texto-suave">
          {etapa
            ? `Ya está ${etapa}. Si hace falta mandarle algo más al cliente, cargá un pedido nuevo.`
            : "Ya está en la lista de compras y tu usuario no puede cambiar pedidos con la compra en curso. Pedile a un administrador que lo cambie."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {pedido.estado !== "CANCELADO" && etapa && (
            <Link href={`/pedidos/nuevo?cliente=${pedido.clienteId}&fecha=${pedido.fecha}`} className="flex min-h-12 items-center rounded-xl bg-marca px-5 font-semibold text-marca-texto">
              ＋ Cargar un pedido nuevo
            </Link>
          )}
          <Link href={`/inicio?fecha=${pedido.fecha}&pedido=${pedido.id}`} className="flex min-h-12 items-center rounded-xl border-2 border-borde px-5 font-semibold">
            Ver en el tablero
          </Link>
        </div>
      </section>
    );
  }
  return <CargadorDePedido datos={datos} fechaInicial={pedido.fecha} clienteInicial={null} puedeConfirmar={sesion.permisos.includes("pedidos.confirmar")} />;
}
