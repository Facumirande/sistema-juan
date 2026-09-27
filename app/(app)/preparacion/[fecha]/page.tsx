import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, type UnidadMedida } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { obtenerPreparacion } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_ENTREGA, ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Encabezado, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { iniciarPreparacionAccion } from "../acciones";

export const metadata: Metadata = { title: "Preparación · Sistema Juan" };

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);

/** P-70 Preparación del día: por cliente o por producto, sin precios (RN-119). */
export default async function PaginaPreparacion({ params, searchParams }: PageProps<"/preparacion/[fecha]">) {
  const sesion = await sesionParaPantalla("preparacion.ver");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const porProducto = parametro((await searchParams).vista) === "producto";
  const p = await obtenerPreparacion(obtenerBaseDatos(), sesion.authUserId, fecha);
  const puedeRegistrar = sesion.permisos.includes("preparacion.registrar");
  const iniciada = p.jornada && (p.jornada.estado === "PREPARANDO" || p.jornada.estado === "REPARTIENDO" || p.entregas.length > 0);
  const listas = p.entregas.filter((e) => e.estado === "PREPARADA" || e.estado === "EN_REPARTO" || e.estado === "ENTREGADA").length;

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <Encabezado
        titulo="Preparación"
        descripcion={`Entrega del ${fechaConDia(fecha)}${p.jornada ? ` · jornada ${ESTADOS_JORNADA[p.jornada.estado]?.toLowerCase()}` : ""}.`}
      >
        {p.entregas.length > 0 && sesion.permisos.includes("documentos.imprimir_entrega") && (
          <Link href={`/preparacion/${fecha}/imprimir${porProducto ? "?vista=producto" : ""}`} className={clasesBoton("secundario")}>
            Imprimir hoja
          </Link>
        )}
        {p.entregas.length > 0 && (
          <Link href={`/repartos?fecha=${fecha}`} className={clasesBoton("secundario")}>
            Repartos
          </Link>
        )}
      </Encabezado>
      <nav aria-label="Día" className="flex flex-wrap gap-2">
        <Link href={`/preparacion/${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/preparacion/${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
        {iniciada && (
          <>
            <Link href={`/preparacion/${fecha}`} className={clasesBoton(porProducto ? "secundario" : "principal")}>
              Por cliente
            </Link>
            <Link href={`/preparacion/${fecha}?vista=producto`} className={clasesBoton(porProducto ? "principal" : "secundario")}>
              Por producto
            </Link>
          </>
        )}
      </nav>

      {!p.jornada ? (
        <p className="text-texto-suave">No hay pedidos para este día.</p>
      ) : (
        <>
          {puedeRegistrar && p.jornada.estado !== "CERRADA" && (
            <Tarjeta>
              {iniciada ? (
                <p className="text-texto-suave">
                  {listas} de {p.entregas.length} entregas preparadas.
                  {p.pedidosSinEntrega > 0 && <b className="text-texto"> Hay {p.pedidosSinEntrega} pedido(s) nuevo(s) sin entrega: actualizá.</b>}
                </p>
              ) : (
                <p>Arma una entrega por cliente con los pedidos confirmados y propone cuánto preparar de cada cosa según lo que se compró.</p>
              )}
              <FormularioAccion accion={iniciarPreparacionAccion} boton={iniciada ? "Actualizar con pedidos nuevos" : "Iniciar preparación"} variante={iniciada && !p.pedidosSinEntrega ? "secundario" : "principal"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            </Tarjeta>
          )}
          {iniciada && !p.hayCompras && <Aviso>No hay compras registradas para este día: se propone preparar lo pedido.</Aviso>}

          {!porProducto ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {p.entregas.map((e) => (
                <li key={e.id}>
                  <Link href={`/preparacion/${fecha}/entrega/${e.id}`} className="flex min-h-24 flex-col gap-1 rounded-lg border border-borde bg-superficie p-4 hover:border-marca">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-lg font-semibold">{e.cliente}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-sm ${e.estado === "PREPARADA" ? "border-marca text-marca" : "border-borde"}`}>{ESTADOS_ENTREGA[e.estado]}</span>
                    </span>
                    <span className="text-texto-suave">
                      {e.punto} · {e.numero}
                      {e.horario && ` · recibe ${e.horario}`}
                      {e.reparto && ` · ${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`}
                    </span>
                    <span>
                      {e.preparadas}/{e.lineas} líneas
                      {e.faltantes > 0 && <span className="text-error"> · {e.faltantes} con faltante</span>}
                      {e.sustituciones > 0 && ` · ${e.sustituciones} reemplazo(s)`}
                      {e.bultos !== null && ` · ${e.bultos} bultos`}
                    </span>
                    {e.documentosPendientes && <span className="text-sm text-error">Documentos pendientes</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Comprado</th>
                  <th className="text-right">Pedido</th>
                  <th className="text-right">Preparado</th>
                  <th className="text-right">Sobra / falta</th>
                </tr>
              </thead>
              <tbody>
                {p.productos.map((x) => {
                  const sobra = dec(x.sobrante);
                  return (
                    <tr key={x.productoId}>
                      <td>
                        <Link href={`/preparacion/${fecha}/producto/${x.productoId}`} className="font-medium underline-offset-4 hover:underline">
                          {x.producto}
                        </Link>
                        {x.sinPreparar > 0 && <span className="block text-sm text-texto-suave">faltan {x.sinPreparar} de {x.lineas}</span>}
                      </td>
                      <td className="text-right whitespace-nowrap">{cant(x.comprado, x.unidad)}</td>
                      <td className="text-right whitespace-nowrap">{cant(x.necesidad, x.unidad)}</td>
                      <td className="text-right whitespace-nowrap">{cant(x.preparado, x.unidad)}</td>
                      <td className={`text-right whitespace-nowrap ${sobra.lt(0) ? "text-error" : ""}`}>
                        {p.hayCompras ? (sobra.lt(0) ? `faltan ${cant(sobra.neg().toString(), x.unidad)}` : `sobran ${cant(x.sobrante, x.unidad)}`) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </>
      )}
    </section>
  );
}
