import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { ABREVIATURA_UNIDAD, formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { presentacionesNecesarias } from "@/dominio/unidades/unidades";
import { listarPresentacionesDeCompra } from "@/modulos/catalogo/productos";
import { obtenerListaCompra, ofertasParaLinea } from "@/modulos/compras/lista-compra";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

import { CompraGuiada } from "./compra-guiada";

export const metadata: Metadata = { title: "Comprando · Sistema Repartos" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/**
 * P-51 La compra, producto por producto (para el celular, en el mercado): lo pedido, lo ya
 * comprado y lo que falta, y abajo el puesto, cómo se paga, el envase, la cantidad y el precio.
 * "Guardar y seguir" pasa al próximo producto pendiente, en el orden de la lista.
 */
export default async function PaginaComprar({ searchParams }: PageProps<"/lista-compra/comprar">) {
  const sesion = await sesionParaPantalla("compras.registrar");
  const db = obtenerBaseDatos();
  const sp = await searchParams;
  const fecha = parametro(sp.fecha) ?? "";
  if (!PATRON.test(fecha)) redirect("/lista-compra");
  const volver = `/lista-compra?fecha=${fecha}`;
  const lista = await obtenerListaCompra(db, sesion.authUserId, fecha);
  if (!lista) redirect(volver);

  // En el orden de la lista (el puesto a mano primero), lo que falta comprar.
  const lineas = lista.plan.flatMap((p) => p.lineas).sort((a, b) => (a.ordenManual ?? 1e9) - (b.ordenManual ?? 1e9));
  const pendientes = lineas.filter((l) => l.estado === "PENDIENTE" || l.estado === "PARCIAL");
  const pedido = parametro(sp.item);
  const l = lineas.find((x) => x.id === pedido) ?? pendientes[0];
  if (!l) redirect(volver);

  const lugar = pendientes.findIndex((x) => x.id === l.id);
  const siguiente = pendientes.find((x, i) => i > lugar && x.id !== l.id) ?? pendientes.find((x) => x.id !== l.id) ?? null;
  const [ofertas, proveedores, envases] = await Promise.all([ofertasParaLinea(db, sesion.authUserId, [l.productoId]), listarProveedores(db, sesion.authUserId), listarPresentacionesDeCompra(db, sesion.authUserId)]);
  const susEnvases = envases.filter((e) => e.productoId === l.productoId);
  const unidad = ABREVIATURA_UNIDAD[l.unidadBase as UnidadMedida] ?? l.unidadBase.toLowerCase();
  const cant = (v: string) => formatearCantidad(v, l.unidadBase as UnidadMedida);
  // Cuántos envases faltan: lo que propone la lista o, si ya se compró una parte, lo que resta.
  const bultos =
    l.estado === "PARCIAL" && l.presentacion ? presentacionesNecesarias(l.pendienteBase, l.factor).cantidad.toString() : l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero() ? dec(l.cantidadPresentaciones).toString() : dec(l.pendienteBase).toString();
  const loVenden = new Set(ofertas.map((o) => o.proveedorId));
  const dato = "flex flex-col rounded-xl px-3 py-2";

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={volver} className="flex min-h-11 items-center gap-1 text-lg font-bold">
          <span aria-hidden>‹</span> Lista
        </Link>
        <span className="rounded-full bg-marca/15 px-3 py-1 text-sm font-bold text-marca">
          {pendientes.length === 0 ? "No queda nada pendiente" : lugar >= 0 ? `${lugar + 1} de ${pendientes.length} pendientes` : `Quedan ${pendientes.length} pendientes`}
        </span>
      </div>

      <header>
        <p className="text-sm font-bold tracking-wide text-[var(--pastel-naranja-texto)] uppercase">Estás comprando para el</p>
        <p className="text-2xl leading-tight font-extrabold first-letter:uppercase">{fechaConDia(fecha)}</p>
        <h1 className="text-4xl leading-tight font-extrabold">{l.producto}</h1>
        {l.paraQuien.length > 0 && <p className="text-texto-suave">Para {l.paraQuien.map((q) => q.cliente).join(", ")}</p>}
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-borde bg-superficie p-2">
        <p className={dato}>
          <span className="text-sm text-texto-suave">Pedido</span>
          <b className="text-xl tabular-nums">{cant(l.necesidadBase)}</b>
        </p>
        <p className={dato}>
          <span className="text-sm text-texto-suave">Ya comprado</span>
          <b className="text-xl tabular-nums">{cant(l.compradoBase)}</b>
        </p>
        <p className={`${dato} bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]`}>
          <span className="text-sm">Falta</span>
          <b className="text-xl tabular-nums">{cant(l.pendienteBase)}</b>
        </p>
      </div>

      {susEnvases.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-amber-500 bg-superficie p-4">
          <p className="text-lg font-bold">⚠ A {l.producto} le falta el envase de compra</p>
          <p>Para anotar la compra hay que decir en qué envase viene (cajón, bolsa o suelto) y cuánto trae. Se carga una sola vez, en la ficha del producto.</p>
          <Link href={`/productos/${l.productoId}`} className="flex min-h-12 items-center justify-center rounded-xl bg-marca px-4 font-bold text-marca-texto">
            Cargar el envase de {l.producto} →
          </Link>
        </div>
      ) : (
        <CompraGuiada
          key={l.id}
          fecha={fecha}
          itemId={l.id}
          unidad={unidad}
          proveedores={[...proveedores]
            .sort((a, b) => Number(loVenden.has(b.id)) - Number(loVenden.has(a.id)))
            .map((p) => ({ id: p.id, nombre: p.nombre, aCuenta: p.condicionPagoHabitual !== "CONTADO", loVende: loVenden.has(p.id) }))}
          envases={susEnvases.map((e) => ({ id: e.presentacionId, nombre: e.presentacion, factor: ofertas.find((o) => o.presentacionId === e.presentacionId)?.factor ?? (e.presentacionId === l.presentacionId ? l.factor : null) }))}
          ofertas={ofertas.map((o) => ({ ofertaId: o.ofertaId, proveedorId: o.proveedorId, presentacionId: o.presentacionId, precio: o.precio, factor: o.factor }))}
          sugerido={{ proveedorId: l.proveedorId ?? ofertas[0]?.proveedorId ?? null, envaseId: l.presentacionId ?? ofertas[0]?.presentacionId ?? null, cantidad: formatearNumero(bultos, { decimales: 3, recortarCeros: true }) }}
          volver={volver}
          siguiente={siguiente ? `/lista-compra/comprar?fecha=${fecha}&item=${siguiente.id}` : volver}
          haySiguiente={siguiente !== null}
          puedeExceder={sesion.permisos.includes("compras.exceder_limite")}
        />
      )}
    </section>
  );
}
