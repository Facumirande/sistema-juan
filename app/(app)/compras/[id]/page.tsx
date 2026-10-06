import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { diasEntre, formatearFecha, formatearFechaHora, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { obtenerCompra } from "@/modulos/compras/compras";
import { cuentaDeProveedor } from "@/modulos/compras/cuenta";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { CONDICIONES_COMPRA, ESTADOS_PAGO, MEDIOS_PAGO } from "@/ui/etiquetas";
import { BotonAccion } from "@/ui/boton-accion";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Casilla, Encabezado, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

import { pagarDeudaAccion } from "../../cuentas-proveedores/acciones";
import { anularCompraAccion } from "../acciones";

export const metadata: Metadata = { title: "Compra · Sistema Repartos" };

/** P-57 Detalle de compra. */
export default async function PaginaCompra({ params, searchParams }: PageProps<"/compras/[id]">) {
  const sesion = await sesionParaPantalla("compras.ver");
  const id = idDeRuta((await params).id);
  const recienRegistrada = parametro((await searchParams).registrada) === "1";
  const db = obtenerBaseDatos();
  const c = await cargarFicha(obtenerCompra(db, sesion.authUserId, id));
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const cuenta = sesion.permisos.includes("proveedores.ver_credito") ? await cuentaDeProveedor(db, sesion.authUserId, c.proveedorId, 1) : null;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado
        titulo={`${c.numero} · ${c.proveedor}`}
        volver={c.fechaJornada ? { ruta: `/compras?fecha=${c.fechaJornada}`, texto: "Compras del día" } : { ruta: `/proveedores/${c.proveedorId}`, texto: c.proveedor }}
        descripcion={`${formatearFechaHora(c.fecha, sesion.zonaHoraria)} · ${CONDICIONES_COMPRA[c.condicion]}${c.fechaVencimiento && c.estadoPago !== "PAGADA" ? ` · hay que pagarla antes del ${formatearFecha(c.fechaVencimiento)}` : ""}`}
      >
        {c.estado === "ANULADA" ? (
          <span className="rounded-full border border-error px-3 py-1 font-semibold text-error">Anulada</span>
        ) : (
          c.estadoPago && <span className="rounded-full border border-marca px-3 py-1 font-semibold">{ESTADOS_PAGO[c.estadoPago]}</span>
        )}
      </Encabezado>

      {recienRegistrada && c.estado === "REGISTRADA" && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-marca bg-superficie p-3">
          <p className="font-semibold">Compra registrada.</p>
          {cuenta && (
            <p className="flex flex-wrap items-center gap-2">
              Ahora se le debe a {c.proveedor} {formatearMoneda(cuenta.indicadores.saldoPendiente)}
              <SemaforoCredito semaforo={cuenta.indicadores.semaforo} usoPct={cuenta.indicadores.usoPct?.toString()} />
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {c.fechaJornada && (
              <Link href={`/lista-compra?fecha=${c.fechaJornada}`} className={clasesBoton("principal")}>
                Volver a la lista
              </Link>
            )}
            <Link href={`/compras/nueva?fecha=${c.fechaJornada ?? ""}`} className={clasesBoton("secundario")}>
              Otra compra
            </Link>
          </div>
        </div>
      )}
      {c.excedeLimite && <Aviso>Superó el límite de crédito del proveedor: {c.motivoExceso}</Aviso>}
      {c.estado === "ANULADA" && <Aviso>Anulada: {c.motivoAnulacion}</Aviso>}

      <Tarjeta titulo="Qué se compró">
        <Tabla>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              {c.total !== null && <th className="text-right">Precio c/u</th>}
              {c.total !== null && <th className="text-right">Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.producto}
                  {i.sinPedido && <span className="block text-sm text-texto-suave">sin pedido</span>}
                </td>
                <td>
                  {formatearNumero(i.cantidad, { decimales: 3, recortarCeros: true })} × {i.presentacion}
                  <span className="block text-sm text-texto-suave">{formatearCantidad(i.cantidadBase, i.unidadBase as UnidadMedida)}</span>
                </td>
                {i.precio !== null && <td className="text-right">{formatearMoneda(i.precio)}</td>}
                {i.subtotal !== null && <td className="text-right">{formatearMoneda(i.subtotal)}</td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
        {c.total !== null && (
          <p className="text-right text-lg">
            Total <b>{formatearMoneda(c.total)}</b>
            {c.pagado !== null && c.estado === "REGISTRADA" && (
              <span className="block text-sm text-texto-suave">
                Pagado {formatearMoneda(c.pagado)}
                {c.medioPago && c.montoPagadoEnElActo && dec(c.montoPagadoEnElActo).gt(0) && ` (${MEDIOS_PAGO[c.medioPago]?.toLowerCase()} en el momento)`}
                {dec(c.total).gt(c.pagado) && <b className="block text-base text-texto">Falta pagar {formatearMoneda(dec(c.total).minus(c.pagado))}</b>}
              </span>
            )}
          </p>
        )}
        {c.imputaciones.length > 0 && (
          <ul className="text-sm text-texto-suave">
            {c.imputaciones.map((i, n) => (
              <li key={n}>
                {i.pagoId ? (
                  <Link href={`/cuentas-proveedores/pagos/${i.pagoId}`} className="underline-offset-4 hover:underline">
                    {i.descripcion}
                  </Link>
                ) : (
                  i.descripcion
                )}
                : {formatearMoneda(i.monto)}
              </li>
            ))}
          </ul>
        )}
        {c.estado === "REGISTRADA" && c.total !== null && c.pagado !== null && dec(c.total).gt(c.pagado) && sesion.permisos.includes("pagos.registrar") && (
          <div className="flex flex-wrap gap-2">
            {(["EFECTIVO", "TRANSFERENCIA"] as const).map((medio) => (
              <BotonAccion
                key={medio}
                accion={pagarDeudaAccion}
                datos={{ proveedorId: c.proveedorId, clave: `C:${c.id}`, medio, claveIdempotencia: randomUUID() }}
                confirmar={`¿Le pagaste ${formatearMoneda(dec(c.total!).minus(c.pagado!))} de ${c.numero} ${medio === "EFECTIVO" ? "en efectivo" : "por transferencia"}?`}
                className={`min-h-11 rounded-lg px-4 font-semibold ${medio === "EFECTIVO" ? "bg-marca text-marca-texto" : "border-2 border-marca"}`}
              >
                {medio === "EFECTIVO" ? "💵 Pagué en efectivo" : "🏦 Pagué por transferencia"}
              </BotonAccion>
            ))}
            <Link href={`/cuentas-proveedores/${c.proveedorId}`} className={clasesBoton("secundario")}>
              Ver la cuenta y cómo transferirle
            </Link>
          </div>
        )}
        {c.fechaVencimiento && c.estadoPago && c.estadoPago !== "PAGADA" && c.fechaVencimiento < hoy && (
          <p className="font-semibold text-error">⏰ Vencida hace {diasEntre(c.fechaVencimiento, hoy)} días.</p>
        )}
        {c.numeroComprobante && <p className="text-texto-suave">Boleta del puesto: {c.numeroComprobante}</p>}
        {c.observaciones && <p>{c.observaciones}</p>}
      </Tarjeta>

      {c.estado === "REGISTRADA" && sesion.permisos.includes("compras.anular") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold text-error">Anular la compra</summary>
          <p className="py-2 text-sm text-texto-suave">
            Una compra no se edita: si hubo un error se anula (la cuenta del proveedor se corrige sola) y se carga de nuevo.
          </p>
          <FormularioAccion accion={anularCompraAccion} boton="Anular" variante="peligro" confirmar="¿Anular esta compra?">
            <input type="hidden" name="compraId" value={c.id} />
            <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. se cargó un precio mal" />
            {c.condicion !== "CREDITO" && (
              <Casilla
                etiqueta="El proveedor devolvió la plata"
                name="devolvioDinero"
                ayuda="Si no la devolvió, lo que se pagó queda a favor y se usa en las próximas compras."
              />
            )}
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
