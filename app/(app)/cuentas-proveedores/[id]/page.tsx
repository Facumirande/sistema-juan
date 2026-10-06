import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { cuentaCorriente } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonAccion } from "@/ui/boton-accion";
import { DatosTransferencia } from "@/ui/datos-transferencia";
import { ESTADOS_PAGO, MEDIOS_PAGO } from "@/ui/etiquetas";
import { Encabezado, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

import { pagarDeudaAccion } from "../acciones";

export const metadata: Metadata = { title: "Cuenta del proveedor · Sistema Repartos" };

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function Cifra({ titulo, valor, detalle, clase }: { titulo: string; valor: string; detalle?: string; clase?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-borde bg-superficie p-3">
      <span className="text-sm text-texto-suave">{titulo}</span>
      <span className={`text-xl font-semibold ${clase ?? ""}`}>{valor}</span>
      {detalle && <span className="text-sm text-texto-suave">{detalle}</span>}
    </div>
  );
}

/** P-61 Cuenta corriente del proveedor: lo que se le debe, qué compras faltan pagar y el libro. */
export default async function CuentaDelProveedor({ params, searchParams }: PageProps<"/cuentas-proveedores/[id]">) {
  const sesion = await sesionParaPantalla("pagos.ver");
  const id = idDeRuta((await params).id);
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const desdePedido = parametro(f.desde);
  const hastaPedido = parametro(f.hasta);
  const hasta = hastaPedido && PATRON_FECHA.test(hastaPedido) ? hastaPedido : hoy;
  const desde = desdePedido && PATRON_FECHA.test(desdePedido) ? desdePedido : sumarDias(hasta, -30);
  const c = await cargarFicha(cuentaCorriente(obtenerBaseDatos(), sesion.authUserId, id, { desde, hasta }));
  const i = c.indicadores;
  const puede = (p: Permiso) => sesion.permisos.includes(p);

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo={c.proveedor.nombre}
        volver={{ ruta: "/cuentas-proveedores", texto: "Deudas con proveedores" }}
        descripcion={[
          c.proveedor.ubicacion,
          c.proveedor.limiteCredito ? `límite ${formatearMoneda(c.proveedor.limiteCredito)}` : "sin límite de crédito",
          c.proveedor.plazoPagoDias !== null ? `paga a ${c.proveedor.plazoPagoDias} días` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {puede("pagos.registrar") && (
          <Link href={`/cuentas-proveedores/${id}/pago`} className={clasesBoton("secundario")}>
            Otro pago (una parte o varias compras)
          </Link>
        )}
        {puede("pagos.ajustar") && (
          <Link href={`/cuentas-proveedores/${id}/ajuste`} className={clasesBoton("secundario")}>
            Ajuste o deuda anterior
          </Link>
        )}
        {puede("documentos.imprimir_cuenta") && (
          <Link href={`/cuentas-proveedores/${id}/estado-de-cuenta?desde=${desde}&hasta=${hasta}`} className={clasesBoton("secundario")}>
            Estado de cuenta
          </Link>
        )}
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {i.saldoAFavor.gt(0) ? (
          <Cifra titulo="A favor nuestro" valor={formatearMoneda(i.saldoAFavor)} clase="text-marca" />
        ) : (
          <Cifra titulo="Se le debe" valor={formatearMoneda(i.saldoPendiente)} />
        )}
        <Cifra titulo="Crédito disponible" valor={i.disponible ? formatearMoneda(i.disponible) : "sin límite"} />
        <Cifra
          titulo="Vencido"
          valor={dec(c.vencimientos.vencida).gt(0) ? formatearMoneda(c.vencimientos.vencida) : "—"}
          detalle={c.vencimientos.maxDiasAtraso ? `⏰ hasta ${c.vencimientos.maxDiasAtraso} días de atraso` : undefined}
          clase={dec(c.vencimientos.vencida).gt(0) ? "text-error" : undefined}
        />
        <Cifra
          titulo="Próximo vencimiento"
          valor={c.vencimientos.proximo ? formatearMoneda(c.vencimientos.proximo.monto) : "—"}
          detalle={c.vencimientos.proximo ? `el ${formatearFecha(c.vencimientos.proximo.fecha)}` : undefined}
        />
      </div>
      <div>
        <SemaforoCredito semaforo={i.semaforo} usoPct={i.usoPct?.toString()} />
      </div>

      {puede("pagos.registrar") && <DatosTransferencia alias={c.proveedor.aliasTransferencia} cbu={c.proveedor.cbu} titular={c.proveedor.titularCuenta} cargar={puede("proveedores.editar") ? `/proveedores/${id}?editar#editar` : undefined} />}

      <Tarjeta titulo="Compras sin pagar">
        {c.pendientes.length > 0 && puede("pagos.registrar") && <p className="text-texto-suave">Cuando le pagues una compra entera, tocá cómo la pagaste: se anota el pago por lo que falta de esa compra.</p>}
        {c.pendientes.length === 0 ? (
          <p className="text-texto-suave">No hay nada pendiente.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Fecha</th>
                <th className="text-right">Total</th>
                <th className="text-right">Pagado</th>
                <th className="text-right">Falta</th>
                <th>Vence</th>
                {puede("pagos.registrar") && <th>Pagar</th>}
              </tr>
            </thead>
            <tbody>
              {c.pendientes.map((p) => (
                <tr key={p.clave}>
                  <td>
                    {p.compraId ? (
                      <Link href={`/compras/${p.compraId}`} className="font-medium whitespace-nowrap underline-offset-4 hover:underline">
                        {p.descripcion}
                      </Link>
                    ) : (
                      p.descripcion
                    )}
                    <span className="block text-sm text-texto-suave">{ESTADOS_PAGO[p.estado]}</span>
                  </td>
                  <td className="whitespace-nowrap">{formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria))}</td>
                  <td className="text-right whitespace-nowrap">{formatearMoneda(p.total)}</td>
                  <td className="text-right whitespace-nowrap">{formatearMoneda(p.pagado)}</td>
                  <td className="text-right font-semibold whitespace-nowrap">{formatearMoneda(p.pendiente)}</td>
                  <td className={`whitespace-nowrap ${p.diasAtraso ? "text-error" : ""}`}>
                    {p.vence ? formatearFecha(p.vence) : "—"}
                    {p.diasAtraso && <span className="block text-sm">⏰ {p.diasAtraso} días de atraso</span>}
                  </td>
                  {puede("pagos.registrar") && (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {(["EFECTIVO", "TRANSFERENCIA"] as const).map((medio) => (
                          <BotonAccion
                            key={medio}
                            accion={pagarDeudaAccion}
                            datos={{ proveedorId: id, clave: p.clave, medio, claveIdempotencia: randomUUID() }}
                            confirmar={`¿Le pagaste ${formatearMoneda(p.pendiente)} de ${p.descripcion} ${medio === "EFECTIVO" ? "en efectivo" : "por transferencia"}?`}
                            className={`min-h-11 rounded-lg px-3 text-sm font-semibold whitespace-nowrap ${medio === "EFECTIVO" ? "bg-marca text-marca-texto" : "border-2 border-marca"}`}
                          >
                            {medio === "EFECTIVO" ? "💵 Pagué en efectivo" : "🏦 Pagué por transferencia"}
                          </BotonAccion>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
        </label>
        <button type="submit" className={clasesBoton("secundario")}>
          Ver
        </button>
      </form>

      <Tarjeta titulo="Movimientos">
        <p className="text-texto-suave">
          Saldo al {formatearFecha(sumarDias(desde, -1))}: {formatearMoneda(c.saldoAlInicio)} · comprado {formatearMoneda(c.comprado)} · pagado {formatearMoneda(c.pagado)}
          {!dec(c.ajustes).isZero() && ` · ajustes ${formatearMoneda(c.ajustes)}`} · saldo al {formatearFecha(hasta)}: {formatearMoneda(c.saldoAlCierre)}
        </p>
        {c.movimientos.length === 0 ? (
          <p className="text-texto-suave">No hubo movimientos en estas fechas.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Detalle</th>
                <th className="text-right">Debe</th>
                <th className="text-right">Haber</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {c.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatearFecha(m.fecha)}</td>
                  <td>
                    {m.pagoId ? (
                      <Link href={`/cuentas-proveedores/pagos/${m.pagoId}`} className="underline-offset-4 hover:underline">
                        {m.descripcion}
                      </Link>
                    ) : m.compraId ? (
                      <Link href={`/compras/${m.compraId}`} className="underline-offset-4 hover:underline">
                        {m.descripcion}
                      </Link>
                    ) : (
                      m.descripcion
                    )}
                    {m.motivo && <span className="block text-sm text-texto-suave">{m.motivo}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">{dec(m.debe).gt(0) ? formatearMoneda(m.debe) : ""}</td>
                  <td className="text-right whitespace-nowrap">{dec(m.haber).gt(0) ? formatearMoneda(m.haber) : ""}</td>
                  <td className="text-right whitespace-nowrap">
                    {dec(m.saldo).lt(0) ? <span className="text-marca">{formatearMoneda(dec(m.saldo).neg())} a favor</span> : formatearMoneda(m.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      {c.pagos.length > 0 && (
        <Tarjeta titulo="Pagos de estas fechas">
          <ul className="flex flex-col">
            {c.pagos.map((p) => (
              <li key={p.id} className={`flex flex-col gap-1 border-t border-borde py-2 first:border-t-0 ${p.anulado ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/cuentas-proveedores/pagos/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                    {p.numero}
                  </Link>
                  <span className="text-texto-suave">
                    {formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria))} · {MEDIOS_PAGO[p.medio] ?? p.medio}
                    {p.referencia && ` · ${p.referencia}`}
                  </span>
                  <span className="font-semibold">{p.anulado ? "Anulado" : formatearMoneda(p.monto)}</span>
                </div>
                {!p.anulado && (
                  <p className="text-sm text-texto-suave">
                    {p.imputaciones.map((x) => `${x.deuda} ${formatearMoneda(x.monto)}`).join(" · ")}
                    {dec(p.aFavor).gt(0) && `${p.imputaciones.length ? " · " : ""}a favor ${formatearMoneda(p.aFavor)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </section>
  );
}
