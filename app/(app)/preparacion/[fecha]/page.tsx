import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, type UnidadMedida } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { obtenerPreparacion, type EntregaEnPreparacion } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { FlechaNavegacion } from "@/ui/iconos";
import { Aviso, Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { salenAhoraAccion } from "../../repartos/acciones";
import { iniciarPreparacionAccion } from "../acciones";
import { PasosDePreparacion, type PasoDePreparacion } from "../pasos";

export const metadata: Metadata = { title: "Preparación · Sistema Juan" };

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const POR_SEPARAR = ["BORRADOR", "EN_PREPARACION"];
const SALIERON = ["EN_REPARTO", "ENTREGADA"];
const verde = "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]";

/** El estado de un cliente dicho en una etiqueta: cuánto lleva separado, listo para salir, en camino. */
function Etiqueta({ e }: { e: EntregaEnPreparacion }) {
  const [clases, texto] =
    e.estado === "ENTREGADA"
      ? ["bg-[var(--listo-fondo)] text-[var(--listo-texto)]", "✅ Entregado"]
      : e.estado === "EN_REPARTO"
        ? [verde, "🚚 En camino"]
        : e.estado === "PREPARADA"
          ? ["bg-[var(--listo-fondo)] text-[var(--listo-texto)]", "✓ Listo para salir"]
          : e.preparadas === e.lineas && e.lineas > 0
            ? ["bg-[var(--pastel-azul)] text-[var(--pastel-azul-texto)]", "Falta marcarlo preparado"]
            : ["bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]", `${e.preparadas} de ${e.lineas} separados`];
  return <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${clases}`}>{texto}</span>;
}

function TarjetaCliente({ e, fecha, puede }: { e: EntregaEnPreparacion; fecha: string; puede: { registrar: boolean; salir: boolean; remito: boolean } }) {
  const lista = e.estado === "PREPARADA";
  const salio = SALIERON.includes(e.estado);
  const todoSeparado = e.lineas > 0 && e.preparadas === e.lineas;
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-4 ${lista ? "border-[var(--listo-fondo)]" : salio ? "border-[var(--pastel-verde)]" : "border-borde"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-semibold">{e.cliente}</p>
          <p className="text-sm text-texto-suave">
            {e.punto}
            {e.horario && ` · recibe ${e.horario}`}
            {e.reparto && ` · ${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`}
          </p>
        </div>
        <Etiqueta e={e} />
      </div>
      {!salio && (
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
      )}
      {e.bultos !== null && <p className="text-sm text-texto-suave">📦 {e.bultos} bultos</p>}
      {e.documentosPendientes && (
        <p className="rounded-lg bg-[var(--pastel-naranja)] px-3 py-2 text-sm font-semibold text-[var(--pastel-naranja-texto)]">
          Falta un precio para hacer el remito: completalo antes de que salga.{" "}
          <Link href={`/entregas/${e.id}`} className="underline">
            Ver qué falta
          </Link>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!lista && !salio && (
          <Link href={`/preparacion/${fecha}/entrega/${e.id}`} className={`${clasesBoton("principal")} flex-1`}>
            {todoSeparado ? "🧾 Marcar como preparado" : e.preparadas > 0 ? "📦 Seguir separando" : "📦 Separar este pedido"}
          </Link>
        )}
        {lista && puede.salir && (
          <BotonAccion accion={salenAhoraAccion} datos={{ entrega: e.id }} mostrarExito className={`${clasesBoton("principal")} w-full`}>
            🚚 Sale ahora
          </BotonAccion>
        )}
        {e.remito && puede.remito && (
          <Link href={`/entregas/${e.id}/documento/lista-entrega`} className={clasesBoton("secundario")}>
            🧾 Remito
          </Link>
        )}
        {(lista || salio) && (
          <Link href={`/preparacion/${fecha}/entrega/${e.id}`} className={clasesBoton("secundario")}>
            {salio ? "Ver lo que se llevó" : puede.registrar ? "✏️ Ver o corregir" : "Ver"}
          </Link>
        )}
      </div>
    </li>
  );
}

function Grupo({ titulo, ayuda, children, accion }: { titulo: string; ayuda: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{titulo}</h2>
          <p className="text-texto-suave">{ayuda}</p>
        </div>
        {accion}
      </div>
      <ul className="grid gap-4 md:grid-cols-2">{children}</ul>
    </section>
  );
}

/** P-70 Preparación del día: por cliente o por producto, sin precios (RN-119). */
export default async function PaginaPreparacion({ params, searchParams }: PageProps<"/preparacion/[fecha]">) {
  const sesion = await sesionParaPantalla("preparacion.ver");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const porProducto = parametro((await searchParams).vista) === "producto";
  const p = await obtenerPreparacion(obtenerBaseDatos(), sesion.authUserId, fecha);
  const permiso = (x: Parameters<typeof sesion.permisos.includes>[0]) => sesion.permisos.includes(x);
  const abierta = p.jornada !== null && p.jornada.estado !== "CERRADA";
  const puede = { registrar: permiso("preparacion.registrar") && abierta, salir: permiso("repartos.gestionar") && abierta, remito: permiso("documentos.imprimir_entrega") };
  const iniciada = p.jornada && (p.jornada.estado === "PREPARANDO" || p.jornada.estado === "REPARTIENDO" || p.entregas.length > 0);
  const porSeparar = p.entregas.filter((e) => POR_SEPARAR.includes(e.estado));
  const listas = p.entregas.filter((e) => e.estado === "PREPARADA");
  const salieron = p.entregas.filter((e) => SALIERON.includes(e.estado));
  const paso: PasoDePreparacion | null = porSeparar.some((e) => e.preparadas < e.lineas)
    ? "separar"
    : porSeparar.length
      ? "preparado"
      : listas.length
        ? "sale"
        : null;
  const pct = p.entregas.length ? Math.round(((listas.length + salieron.length) / p.entregas.length) * 100) : 0;

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Encabezado titulo={`Preparación · ${fechaConDia(fecha)}`} descripcion="Lo que hay que separar para cada cliente. Seguí los tres pasos: separar, marcar preparado (el remito se hace solo) y que salga a entregar.">
        {p.entregas.length > 0 && puede.remito && (
          <Link href={`/preparacion/${fecha}/imprimir${porProducto ? "?vista=producto" : ""}`} className={clasesBoton("secundario")}>
            🖨️ Imprimir para separar
          </Link>
        )}
        {p.entregas.some((e) => e.remito) && puede.remito && (
          <Link href={`/entregas/remitos?fecha=${fecha}`} className={clasesBoton("secundario")}>
            🧾 Remitos del día
          </Link>
        )}
        {p.entregas.length > 0 && permiso("repartos.ver") && (
          <Link href={`/viaje?fecha=${fecha}`} className={`${clasesBoton("secundario")} gap-2`}>
            <FlechaNavegacion /> Viaje de entrega
          </Link>
        )}
      </Encabezado>
      <nav aria-label="Día y forma de ver" className="flex flex-wrap gap-2">
        <Link href={`/preparacion/${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/preparacion/${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
        {iniciada && (
          <>
            <Link href={`/preparacion/${fecha}`} aria-current={!porProducto ? "page" : undefined} className={clasesBoton(porProducto ? "secundario" : "principal")}>
              👤 Por cliente
            </Link>
            <Link href={`/preparacion/${fecha}?vista=producto`} aria-current={porProducto ? "page" : undefined} className={clasesBoton(porProducto ? "principal" : "secundario")}>
              🥬 Por producto
            </Link>
          </>
        )}
      </nav>

      {!p.jornada ? (
        <p className="text-texto-suave">No hay pedidos para este día.</p>
      ) : !iniciada ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-marca bg-superficie p-5">
          <p className="text-xl font-semibold">📦 Todavía no se empezó a preparar este día</p>
          <p className="text-texto-suave">
            Al empezar se arma una lista por cliente con lo que hay que separarle. Si algo de lo comprado no alcanza para todos, se reparte empezando por los pedidos urgentes y queda anotado qué faltó.
          </p>
          {puede.registrar && (
            <FormularioAccion accion={iniciarPreparacionAccion} boton="📦 Empezar a preparar">
              <input type="hidden" name="fecha" value={fecha} />
            </FormularioAccion>
          )}
        </div>
      ) : (
        <>
          <PasosDePreparacion actual={paso} />
          <div className="flex flex-col gap-2 rounded-2xl bg-superficie p-4 ring-1 ring-borde">
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <span className="rounded-full bg-[var(--pastel-amarillo)] px-3 py-1 text-[var(--pastel-amarillo-texto)]">📦 Por separar: {porSeparar.length}</span>
              <span className="rounded-full bg-[var(--listo-fondo)] px-3 py-1 text-[var(--listo-texto)]">✓ Listos para salir: {listas.length}</span>
              <span className={`rounded-full px-3 py-1 ${verde}`}>🚚 En camino o entregados: {salieron.length}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Clientes preparados">
              <div className="h-3 rounded-full bg-[var(--listo-fondo)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {p.pedidosSinEntrega > 0 && puede.registrar && (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--etiqueta-amarillo)] bg-superficie p-4">
              <p className="font-semibold">Hay {p.pedidosSinEntrega === 1 ? "1 pedido nuevo" : `${p.pedidosSinEntrega} pedidos nuevos`} que todavía no está acá.</p>
              <FormularioAccion accion={iniciarPreparacionAccion} boton="Sumar los pedidos nuevos" enLinea>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            </div>
          )}
          {!p.hayCompras && <Aviso>Todavía no se anotó ninguna compra de este día: se propone separar lo pedido.</Aviso>}

          {!porProducto ? (
            <>
              {porSeparar.length > 0 && (
                <Grupo titulo="1. Por separar" ayuda="Tocá un cliente, tildá lo que está y anotá lo que falta. Con todo tildado, marcalo como preparado.">
                  {porSeparar.map((e) => (
                    <TarjetaCliente key={e.id} e={e} fecha={fecha} puede={puede} />
                  ))}
                </Grupo>
              )}
              {listas.length > 0 && (
                <Grupo
                  titulo="2. Listos para salir"
                  ayuda="Preparados y con su remito. Cuando se van a entregar, tocá “🚚 Sale ahora” y pasan a En camino."
                  accion={
                    puede.salir && listas.length > 1 ? (
                      <BotonAccion accion={salenAhoraAccion} datos={{ entrega: listas.map((e) => e.id) }} mostrarExito className={clasesBoton("principal")}>
                        🚚 Salen todos ({listas.length})
                      </BotonAccion>
                    ) : null
                  }
                >
                  {listas.map((e) => (
                    <TarjetaCliente key={e.id} e={e} fecha={fecha} puede={puede} />
                  ))}
                </Grupo>
              )}
              {salieron.length > 0 && (
                <Grupo titulo="3. En camino y entregados" ayuda="Ya salieron. Al dejar cada pedido se confirma desde el viaje de entrega.">
                  {salieron.map((e) => (
                    <TarjetaCliente key={e.id} e={e} fecha={fecha} puede={puede} />
                  ))}
                </Grupo>
              )}
              {p.pedidosSinEntrega === 0 && puede.registrar && (
                <FormularioAccion accion={iniciarPreparacionAccion} boton="Buscar pedidos nuevos para sumar" variante="secundario" enLinea>
                  <input type="hidden" name="fecha" value={fecha} />
                </FormularioAccion>
              )}
            </>
          ) : (
            <>
              <p className="text-texto-suave">Cuánto se compró de cada producto y cuánto se separó. Tocá un producto para pesarlo para todos los clientes de una vez.</p>
              <Tabla>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Comprado</th>
                    <th className="text-right">Pedido</th>
                    <th className="text-right">Separado</th>
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
            </>
          )}
        </>
      )}
    </section>
  );
}
