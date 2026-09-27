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
import { CONDICIONES_COMPRA, MEDIOS_PAGO, fechaConDia, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Campo, CampoNumero, Casilla, Encabezado, Selector } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

import { registrarCompraAccion } from "../acciones";

export const metadata: Metadata = { title: "Registrar compra · Sistema Juan" };

const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });
const RENGLONES_LIBRES = 3;

interface Renglon {
  productoId: string;
  presentacionId: string;
  producto: string;
  presentacion: string;
  cantidad: string;
  precio: string;
  delPlan: boolean;
}

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
    return (
      <section className="flex max-w-md flex-col gap-4">
        <Encabezado titulo="Registrar compra" volver={{ ruta: `/compras?fecha=${fecha}`, texto: "Compras del día" }} descripcion={`Para la entrega del ${fechaConDia(fecha)}. ¿En qué puesto compraste?`} />
        <ul className="flex flex-col gap-2">
          {proveedores.map((p) => (
            <li key={p.id}>
              <Link href={`/compras/nueva?fecha=${fecha}&proveedor=${p.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-lg border border-borde bg-superficie px-4 py-2">
                <span>
                  <span className="font-semibold">{p.nombre}</span>
                  {p.ubicacionMercado && <span className="block text-sm text-texto-suave">{p.ubicacionMercado}</span>}
                </span>
                {(pendientes.get(p.id) ?? 0) > 0 && <span className="text-sm text-texto-suave">{pendientes.get(p.id)} de la lista</span>}
              </Link>
            </li>
          ))}
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

  // Renglones: primero lo que la lista dice comprarle a este puesto, después el resto de sus productos.
  const delPlan = (lista?.plan.find((p) => p.proveedorId === id)?.lineas ?? []).filter((l) => l.estado !== "COMPRADO" && l.presentacionId);
  const renglones: Renglon[] = delPlan.map((l) => {
    // Si ya se compró una parte, se propone solo lo que falta (en bultos completos).
    const cantidad = l.estado === "PARCIAL" ? presentacionesNecesarias(l.pendienteBase, l.factor).cantidad : dec(l.cantidadPresentaciones ?? "0");
    return {
      productoId: l.productoId,
      presentacionId: l.presentacionId!,
      producto: l.producto,
      presentacion: l.presentacion ?? "",
      cantidad: cantidad.gt(0) ? num(cantidad.toString()) : "",
      precio: l.precioSugerido ? num(dec(l.precioSugerido).toString()) : "",
      delPlan: true,
    };
  });
  for (const o of ofertas) {
    if (renglones.some((r) => r.productoId === o.productoId && r.presentacionId === o.presentacionId)) continue;
    renglones.push({ productoId: o.productoId, presentacionId: o.presentacionId, producto: o.producto, presentacion: o.presentacion, cantidad: "", precio: num(dec(o.precioVigente).toString()), delPlan: false });
  }
  const opcionesLibres = presentaciones.map((p) => ({ valor: `${p.productoId}:${p.presentacionId}`, etiqueta: `${p.producto} · ${p.presentacion}` }));

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Encabezado
        titulo={prov.nombre}
        volver={{ ruta: `/compras/nueva?fecha=${fecha}`, texto: "Otro puesto" }}
        descripcion={`Compra para la entrega del ${fechaConDia(fecha)}.${prov.ubicacionMercado ? ` ${prov.ubicacionMercado}.` : ""}`}
      />
      {cuenta && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-superficie p-3">
          <SemaforoCredito semaforo={cuenta.indicadores.semaforo} usoPct={cuenta.indicadores.usoPct?.toString()} />
          <span>
            Se le debe <b>{formatearMoneda(cuenta.indicadores.saldoPendiente)}</b>
            {cuenta.indicadores.disponible !== null && ` · disponible ${formatearMoneda(cuenta.indicadores.disponible)}`}
            {cuenta.indicadores.saldoAFavor.gt(0) && ` · a favor ${formatearMoneda(cuenta.indicadores.saldoAFavor)}`}
          </span>
        </div>
      )}

      <FormularioAccion accion={registrarCompraAccion} boton="Registrar compra">
        <input type="hidden" name="fecha" value={fecha} />
        <input type="hidden" name="proveedorId" value={id} />
        <input type="hidden" name="claveIdempotencia" value={randomUUID()} />
        <p className="text-texto-suave">Escribí cuántos bultos compraste y a cuánto cada uno. Los renglones vacíos no se cargan.</p>
        <ul className="flex flex-col gap-3">
          {renglones.map((r, n) => (
            <li key={`${r.productoId}:${r.presentacionId}`} className={`flex flex-col gap-2 rounded-lg border p-3 ${r.delPlan ? "border-marca" : "border-borde"}`}>
              <input type="hidden" name={`item_${n}_producto`} value={r.productoId} />
              <input type="hidden" name={`item_${n}_presentacion`} value={r.presentacionId} />
              <p className="font-semibold">
                {r.producto} · <span className="font-normal">{r.presentacion}</span>
                {r.delPlan && <span className="text-sm font-normal text-texto-suave"> (de la lista)</span>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <CampoNumero etiqueta="Cantidad" name={`item_${n}_cantidad`} defaultValue={r.cantidad} placeholder="0" />
                <CampoNumero etiqueta="Precio c/u" name={`item_${n}_precio`} defaultValue={r.precio} />
              </div>
            </li>
          ))}
          {Array.from({ length: RENGLONES_LIBRES }, (_, k) => renglones.length + k).map((n) => (
            <li key={n} className="flex flex-col gap-2 rounded-lg border border-dashed border-borde p-3">
              <Selector etiqueta="Otro producto" name={`item_${n}_pp`} opciones={opcionesLibres} vacia="—" />
              <div className="grid grid-cols-2 gap-2">
                <CampoNumero etiqueta="Cantidad" name={`item_${n}_cantidad`} placeholder="0" />
                <CampoNumero etiqueta="Precio c/u" name={`item_${n}_precio`} />
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Cómo se paga" name="condicion" opciones={opciones(CONDICIONES_COMPRA)} defaultValue={prov.condicionPagoHabitual} />
          <Selector etiqueta="Medio de pago" name="medioPago" opciones={opciones(MEDIOS_PAGO)} defaultValue="EFECTIVO" />
          <CampoNumero etiqueta="Si es parte y parte: cuánto se paga ahora" name="pagadoEnElActo" />
          <Campo etiqueta="N.º de boleta (opcional)" name="numeroComprobante" />
        </div>
        <AreaTexto etiqueta="Notas (opcional)" name="observaciones" />
        {sesion.permisos.includes("compras.exceder_limite") && (
          <details className="rounded-lg border border-borde p-3">
            <summary className="cursor-pointer font-medium">Si supera el límite de crédito</summary>
            <div className="flex flex-col gap-2 pt-2">
              <Casilla etiqueta="Registrarla igual" name="exceder" />
              <Campo etiqueta="Por qué" name="motivoExceso" placeholder="Ej. hay que abastecer al hospital" />
            </div>
          </details>
        )}
      </FormularioAccion>
    </section>
  );
}
