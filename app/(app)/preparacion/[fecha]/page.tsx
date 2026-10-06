import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, type UnidadMedida } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { obtenerPreparacion } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_ENTREGA, fechaConDia } from "@/ui/etiquetas";
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
        descripcion={`Lo que hay que separar para cada cliente (entrega del ${fechaConDia(fecha)}): tildá lo que está, anotá lo que faltó y por qué, y marcalo como preparado. El remito se hace solo.`}
      >
        {p.entregas.length > 0 && sesion.permisos.includes("documentos.imprimir_entrega") && (
          <Link href={`/preparacion/${fecha}/imprimir${porProducto ? "?vista=producto" : ""}`} className={clasesBoton("secundario")}>
            🖨️ Imprimir para separar
          </Link>
        )}
        {p.entregas.length > 0 && (
          <Link href={`/viaje?fecha=${fecha}`} className={clasesBoton("secundario")}>
            🧭 Viaje de entrega
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
              👤 Por cliente
            </Link>
            <Link href={`/preparacion/${fecha}?vista=producto`} className={clasesBoton(porProducto ? "principal" : "secundario")}>
              🥬 Por producto
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
                  {listas} de {p.entregas.length} pedidos preparados.
                  {p.pedidosSinEntrega > 0 && <b className="text-texto"> Hay {p.pedidosSinEntrega} pedido(s) nuevo(s) que todavía no están acá: sumalos.</b>}
                </p>
              ) : (
                <p>Al empezar se arma una lista por cliente con lo que hay que separarle. Si algo de lo comprado no alcanza para todos, se reparte empezando por los pedidos urgentes, y queda anotado qué faltó.</p>
              )}
              <FormularioAccion accion={iniciarPreparacionAccion} boton={iniciada ? "Sumar los pedidos nuevos" : "Empezar a preparar"} variante={iniciada && !p.pedidosSinEntrega ? "secundario" : "principal"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            </Tarjeta>
          )}
          {iniciada && !p.hayCompras && <Aviso>Todavía no se anotó ninguna compra de este día: se propone separar lo pedido.</Aviso>}

          {!porProducto ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {p.entregas.map((e) => {
                const lista = e.estado === "PREPARADA" || e.estado === "EN_REPARTO" || e.estado === "ENTREGADA";
                return (
                  <li key={e.id} className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-4 ${lista ? "border-[var(--listo-fondo)]" : "border-borde"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xl font-semibold">{e.cliente}</p>
                        <p className="text-sm text-texto-suave">
                          {e.punto} · {e.numero}
                          {e.horario && ` · recibe ${e.horario}`}
                          {e.reparto && ` · ${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${lista ? "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" : "bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]"}`}>
                        {lista ? `✓ ${ESTADOS_ENTREGA[e.estado]}` : `${e.preparadas} de ${e.lineas} separados`}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1 rounded-xl bg-fondo p-3">
                      {e.detalle.map((x, n) => (
                        <li key={n}>
                          <span className="flex items-baseline gap-2">
                            <span aria-label={x.hecha ? "separado" : "por separar"} className={x.hecha ? "font-bold text-marca" : "text-texto-suave"}>
                              {x.hecha ? "✓" : "⬜"}
                            </span>
                            <span className="min-w-0 flex-1">
                              {x.reemplazo && "🔁 "}
                              {x.producto}
                            </span>
                            <b className="shrink-0 tabular-nums">{x.cantidad}</b>
                          </span>
                          {x.aviso && <span className="mt-0.5 ml-6 block w-fit rounded-md bg-[var(--pastel-naranja)] px-2 text-sm font-semibold text-[var(--pastel-naranja-texto)]">⚠ {x.aviso}</span>}
                        </li>
                      ))}
                    </ul>
                    {e.bultos !== null && <p className="text-sm text-texto-suave">📦 {e.bultos} bultos</p>}
                    {e.documentosPendientes && <p className="text-sm font-semibold text-error">Falta un precio para hacer el remito.</p>}
                    <Link href={`/preparacion/${fecha}/entrega/${e.id}`} className={clasesBoton(lista ? "secundario" : "principal")}>
                      {lista ? "Ver o corregir" : e.preparadas > 0 ? "📦 Seguir preparando" : "📦 Preparar este pedido"}
                    </Link>
                  </li>
                );
              })}
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
