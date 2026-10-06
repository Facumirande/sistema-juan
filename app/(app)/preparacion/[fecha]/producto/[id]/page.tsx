import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { productoEnPreparacion } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { MOTIVOS_FALTANTE, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { CampoNumero, Encabezado, Selector } from "@/ui/formularios";

import { preparadoAccion } from "../../../acciones";

export const metadata: Metadata = { title: "Preparar por producto · Sistema Repartos" };

const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

/** P-72 Preparar por producto: pesar todo de una vez y repartirlo entre los clientes. */
export default async function PrepararProducto({ params }: PageProps<"/preparacion/[fecha]/producto/[id]">) {
  const sesion = await sesionParaPantalla("preparacion.ver");
  const { fecha, id } = await params;
  const p = await cargarFicha(productoEnPreparacion(obtenerBaseDatos(), sesion.authUserId, fecha, idDeRuta(id)));
  const u = p.unidad as UnidadMedida;
  const queda = dec(p.comprado).minus(p.preparado);
  const puedeRegistrar = sesion.permisos.includes("preparacion.registrar");

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Encabezado titulo={p.producto} volver={{ ruta: `/preparacion/${fecha}?vista=producto`, texto: "Preparación por producto" }} />
      <p className="rounded-lg border border-borde bg-superficie p-3 text-lg">
        Comprado {formatearCantidad(p.comprado, u)} · preparado {formatearCantidad(p.preparado, u)} ·{" "}
        <b className={queda.lt(0) ? "text-error" : ""}>{queda.lt(0) ? `faltan ${formatearCantidad(queda.neg(), u)}` : `quedan ${formatearCantidad(queda, u)}`}</b>
      </p>
      <ul className="flex flex-col gap-3">
        {p.lineas.map((l) => {
          const aPreparar = l.propuesta ?? l.pedida;
          const recortada = !l.esSustitucion && dec(aPreparar).lt(l.pedida);
          return (
            <li key={l.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${l.preparada !== null ? "border-marca" : "border-borde"}`}>
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/preparacion/${fecha}/entrega/${l.entregaId}`} className="text-lg font-semibold underline-offset-4 hover:underline">
                  {l.cliente}
                </Link>
                <span className="text-sm text-texto-suave">prioridad {l.prioridad}</span>
              </p>
              <p className="text-texto-suave">
                {l.esSustitucion ? "Reemplazo" : `Pedido ${formatearCantidad(l.pedida, u)}`}
                {recortada && <b className="text-error"> · alcanza para {formatearCantidad(aPreparar, u)}</b>}
                {l.preparada !== null && <b className="text-marca"> · preparado {formatearCantidad(l.preparada, u)}</b>}
              </p>
              {puedeRegistrar && l.editable && (
                <FormularioAccion accion={preparadoAccion} boton="Guardar" variante="secundario" enLinea>
                  <input type="hidden" name="itemId" value={l.id} />
                  <CampoNumero etiqueta="Preparado" name="cantidad" defaultValue={l.preparada !== null ? num(l.preparada) : num(aPreparar)} className="w-32" />
                  {!l.esSustitucion && <Selector etiqueta="Si falta" name="motivo" opciones={opciones(MOTIVOS_FALTANTE)} vacia="—" defaultValue={l.motivo ?? (recortada ? "FALTANTE" : "")} />}
                </FormularioAccion>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
