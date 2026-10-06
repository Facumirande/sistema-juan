import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { presentacionesNecesarias } from "@/dominio/unidades/unidades";
import { listarPresentacionesDeCompra } from "@/modulos/catalogo/productos";
import { cuentaDeProveedor } from "@/modulos/compras/cuenta";
import { obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { listarProveedores, obtenerProveedor } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { fechaConDia } from "@/ui/etiquetas";
import { Encabezado } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

import { FormularioCompra } from "./formulario-compra";

export const metadata: Metadata = { title: "Registrar compra · Sistema Repartos" };

const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

/** P-55 Registrar compra (04 §5.d.1): proveedor, lo que se compró, cómo se paga. */
export default async function NuevaCompra({ searchParams }: PageProps<"/compras/nueva">) {
  const sesion = await sesionParaPantalla("compras.registrar");
  const db = obtenerBaseDatos();
  const f = await searchParams;
  const pedida = parametro(f.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : (await fechasDeTrabajo(db, sesion.authUserId)).sugerida;
  const proveedorId = parametro(f.proveedor);
  const lista = sesion.permisos.includes("lista_compra.ver") ? await obtenerListaCompra(db, sesion.authUserId, fecha) : null;

  if (!proveedorId) {
    const proveedores = await listarProveedores(db, sesion.authUserId);
    const pendientes = new Map((lista?.plan ?? []).map((p) => [p.proveedorId, p.lineas.filter((l) => l.estado !== "COMPRADO").length]));
    // Primero los puestos donde la lista dice comprar algo.
    const ordenados = [...proveedores].sort((a, b) => (pendientes.get(b.id) ?? 0) - (pendientes.get(a.id) ?? 0));
    return (
      <section className="flex max-w-3xl flex-col gap-5">
        <Encabezado
          titulo="Registrar una compra"
          volver={{ ruta: `/compras?fecha=${fecha}`, texto: "Compras del día" }}
          descripcion={`Para la entrega del ${fechaConDia(fecha)}. Tocá el puesto donde compraste: vas a ver lo que la lista dice comprarle ahí, ya con cantidades y precios.`}
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {ordenados.map((p) => {
            const faltan = pendientes.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/compras/nueva?fecha=${fecha}&proveedor=${p.id}`}
                  className={`flex min-h-20 items-center gap-3 rounded-2xl border-2 bg-superficie px-4 py-3 hover:border-marca ${faltan > 0 ? "border-marca/60" : "border-borde"}`}
                >
                  <span aria-hidden className="text-3xl">
                    🏪
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{p.nombre}</span>
                    {p.ubicacionMercado && <span className="block text-texto-suave">{p.ubicacionMercado}</span>}
                  </span>
                  {faltan > 0 && <span className="rounded-full bg-marca px-3 py-1 text-sm font-semibold text-marca-texto">{faltan} de la lista</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const id = idDeRuta(proveedorId);
  const [prov, cuenta, ofertas, presentaciones] = await Promise.all([
    cargarFicha(obtenerProveedor(db, sesion.authUserId, id)),
    sesion.permisos.includes("proveedores.ver_credito") ? cuentaDeProveedor(db, sesion.authUserId, id) : Promise.resolve(null),
    sesion.permisos.includes("precios.ver_costos") ? listaGeneralPreciosCompra(db, sesion.authUserId, { proveedorId: id }).then((r) => r.ofertas) : Promise.resolve([]),
    listarPresentacionesDeCompra(db, sesion.authUserId),
  ]);

  // Lo que la lista dice comprarle a este puesto; si ya se compró una parte, solo lo que falta (en bultos completos).
  const delPlan = (lista?.plan.find((p) => p.proveedorId === id)?.lineas ?? [])
    .filter((l) => l.estado !== "COMPRADO" && l.presentacionId)
    .map((l) => {
      const cantidad = l.estado === "PARCIAL" ? presentacionesNecesarias(l.pendienteBase, l.factor).cantidad : dec(l.cantidadPresentaciones ?? "0");
      return {
        productoId: l.productoId,
        presentacionId: l.presentacionId!,
        producto: l.producto,
        presentacion: l.presentacion ?? "",
        cantidad: cantidad.gt(0) ? num(cantidad.toString()) : "",
        precio: l.precioSugerido ? num(dec(l.precioSugerido).toString()) : "",
      };
    });
  const delPuesto = ofertas.map((o) => ({ productoId: o.productoId, presentacionId: o.presentacionId, producto: o.producto, presentacion: o.presentacion, precio: num(dec(o.precioVigente).toString()) }));

  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <Encabezado
        titulo={`Compra en ${prov.nombre}`}
        volver={{ ruta: `/compras/nueva?fecha=${fecha}`, texto: "Elegir otro puesto" }}
        descripcion={`Para la entrega del ${fechaConDia(fecha)}.${prov.ubicacionMercado ? ` ${prov.ubicacionMercado}.` : ""} Si el precio cambió, corregilo: queda guardado como el nuevo precio del puesto.`}
      />
      {cuenta && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borde bg-superficie p-3">
          <SemaforoCredito semaforo={cuenta.indicadores.semaforo} usoPct={cuenta.indicadores.usoPct?.toString()} />
          <span>
            Se le debe <b>{formatearMoneda(cuenta.indicadores.saldoPendiente)}</b>
            {cuenta.indicadores.disponible !== null && ` · todavía se le puede deber ${formatearMoneda(cuenta.indicadores.disponible)}`}
            {cuenta.indicadores.saldoAFavor.gt(0) && ` · a favor ${formatearMoneda(cuenta.indicadores.saldoAFavor)}`}
          </span>
        </div>
      )}
      <FormularioCompra
        fecha={fecha}
        proveedorId={id}
        claveIdempotencia={randomUUID()}
        condicionHabitual={prov.condicionPagoHabitual === "CONTADO" ? "CONTADO" : "CREDITO"}
        delPlan={delPlan}
        delPuesto={delPuesto}
        todos={presentaciones.map((p) => ({ productoId: p.productoId, presentacionId: p.presentacionId, producto: p.producto, presentacion: p.presentacion }))}
        puedeExceder={sesion.permisos.includes("compras.exceder_limite")}
      />
    </section>
  );
}
