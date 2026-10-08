import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { cuentaDeCliente } from "@/modulos/cuentas-clientes/cuentas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonAccion } from "@/ui/boton-accion";
import { MEDIOS_PAGO, fechaConDia, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero, Encabezado, Selector, Tarjeta, clasesBoton } from "@/ui/formularios";

import { anularCobroAccion, registrarCobroAccion, saldoInicialAccion } from "../acciones";

export const metadata: Metadata = { title: "Cuenta del cliente · Sistema Repartos" };

const ESTADO: Readonly<Record<string, { texto: string; clases: string }>> = {
  COBRADA: { texto: "✓ Cobrada", clases: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" },
  PARCIAL: { texto: "Cobrada en parte", clases: "bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]" },
  PENDIENTE: { texto: "Sin cobrar", clases: "bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]" },
};

/** P-65b La cuenta de un cliente: lo que se le entregó, lo que pagó y lo que falta cobrarle. */
export default async function PaginaCuentaDeCliente({ params }: PageProps<"/cuentas-clientes/[id]">) {
  const sesion = await sesionParaPantalla("cobranzas.ver");
  const id = idDeRuta((await params).id);
  const c = await cargarFicha(cuentaDeCliente(obtenerBaseDatos(), sesion.authUserId, id));
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const puedeCobrar = sesion.permisos.includes("cobranzas.registrar");
  const puedeAnular = sesion.permisos.includes("cobranzas.anular");
  const debe = dec(c.aCobrar).gt(0);
  const dato = "flex flex-col rounded-2xl border border-borde bg-superficie p-4";

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Encabezado titulo={c.cliente} descripcion="Su cuenta: lo que se le entregó, lo que pagó y lo que falta cobrarle. Lo que paga cancela siempre lo más viejo." volver={{ ruta: "/cuentas-clientes", texto: "A cobrar" }}>
        <Link href={`/clientes/${c.clienteId}`} className={clasesBoton("secundario")}>
          Ver su ficha
        </Link>
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-3">
        <p className={dato}>
          <span className="text-texto-suave">🚚 Se le entregó</span>
          <b className="text-3xl tabular-nums">{formatearMoneda(dec(c.entregado).plus(c.saldoInicial).toString())}</b>
          {dec(c.saldoInicial).gt(0) && <span className="text-sm text-texto-suave">incluye {formatearMoneda(c.saldoInicial)} que debía de antes</span>}
        </p>
        <p className={dato}>
          <span className="text-texto-suave">💵 Pagó</span>
          <b className="text-3xl tabular-nums">{formatearMoneda(c.cobrado)}</b>
        </p>
        <p className={`flex flex-col rounded-2xl p-4 ${debe ? "bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]" : "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]"}`}>
          <span className="font-semibold">{debe ? "🤝 Falta cobrarle" : "✓ No debe nada"}</span>
          <b className="text-4xl tabular-nums">{formatearMoneda(c.aCobrar)}</b>
          {dec(c.aFavor).gt(0) && <span className="text-sm font-semibold">Tiene {formatearMoneda(c.aFavor)} a favor.</span>}
        </p>
      </div>

      {puedeCobrar && (
        <Tarjeta titulo="💵 Anotar un cobro">
          {debe && (
            <div className="flex flex-wrap gap-2">
              <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, medioPago: "EFECTIVO" }} className={clasesBoton("principal")}>
                💵 Pagó todo en efectivo ({formatearMoneda(c.aCobrar)})
              </BotonAccion>
              <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, medioPago: "TRANSFERENCIA" }} className={clasesBoton("principal")}>
                🏦 Pagó todo por transferencia
              </BotonAccion>
            </div>
          )}
          <details open={!debe}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Pagó otro importe (una parte, o un adelanto)</summary>
            <FormularioAccion accion={registrarCobroAccion} boton="Anotar el cobro">
              <input type="hidden" name="clienteId" value={c.clienteId} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CampoNumero etiqueta="¿Cuánto pagó?" name="monto" placeholder="Ej. 120.000" required />
                <Selector etiqueta="¿Cómo pagó?" name="medioPago" opciones={opciones(MEDIOS_PAGO)} defaultValue="EFECTIVO" />
                <Campo etiqueta="¿Qué día?" name="fecha" type="date" defaultValue={hoy} max={hoy} />
                <Campo etiqueta="Nota (opcional)" name="observaciones" placeholder="Ej. pagó la mitad" />
              </div>
            </FormularioAccion>
          </details>
        </Tarjeta>
      )}

      <Tarjeta titulo="🚚 Lo que se le entregó">
        {c.entregas.length === 0 && !dec(c.saldoInicial).gt(0) ? (
          <p className="text-texto-suave">Todavía no se le entregó nada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {c.entregas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-xl font-bold first-letter:uppercase">{fechaConDia(e.fecha)}</p>
                  <p className="text-sm text-texto-suave">
                    <Link href={`/entregas/${e.id}`} className="underline underline-offset-4">
                      {e.numero}
                    </Link>{" "}
                    · {e.punto}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${ESTADO[e.estado]!.clases}`}>{ESTADO[e.estado]!.texto}</span>
                <p className="flex flex-col text-right">
                  <b className="text-xl tabular-nums">{formatearMoneda(e.importe)}</b>
                  {e.estado === "PARCIAL" && <span className="text-sm text-texto-suave">falta {formatearMoneda(e.pendiente)}</span>}
                </p>
                {puedeCobrar && e.estado !== "COBRADA" && (
                  <span className="flex flex-wrap gap-2">
                    <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, entregaId: e.id, medioPago: "EFECTIVO" }} className={clasesBoton("secundario")} titulo={`Cobrar lo que falta de esta entrega (${formatearMoneda(e.pendiente)}) en efectivo`}>
                      💵 La cobré en efectivo
                    </BotonAccion>
                    <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, entregaId: e.id, medioPago: "TRANSFERENCIA" }} className={clasesBoton("secundario")} titulo={`Cobrar lo que falta de esta entrega (${formatearMoneda(e.pendiente)}) por transferencia`}>
                      🏦 Por transferencia
                    </BotonAccion>
                  </span>
                )}
              </li>
            ))}
            {dec(c.saldoInicial).gt(0) && (
              <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <p className="min-w-0 flex-1 basis-48 text-xl font-bold">Lo que debía de antes</p>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${ESTADO[dec(c.saldoInicialPendiente).isZero() ? "COBRADA" : dec(c.saldoInicialPendiente).eq(c.saldoInicial) ? "PENDIENTE" : "PARCIAL"]!.clases}`}>
                  {dec(c.saldoInicialPendiente).isZero() ? "✓ Cobrado" : `Falta ${formatearMoneda(c.saldoInicialPendiente)}`}
                </span>
                <b className="text-xl tabular-nums">{formatearMoneda(c.saldoInicial)}</b>
              </li>
            )}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="💵 Lo que pagó">
        {c.cobros.length === 0 ? (
          <p className="text-texto-suave">Todavía no hay cobros anotados.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {c.cobros.map((k) => (
              <li key={k.id} className={`flex flex-col gap-2 py-3 ${k.anulado ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className={`text-xl font-bold first-letter:uppercase ${k.anulado ? "line-through" : ""}`}>{fechaConDia(k.fecha)}</p>
                    <p className="text-sm text-texto-suave">
                      {k.numero} · {MEDIOS_PAGO[k.medioPago] ?? k.medioPago}
                      {k.entrega && ` · por la entrega ${k.entrega}`}
                      {k.quien && ` · lo anotó ${k.quien.split(" ")[0]}`}
                      {k.observaciones && ` · “${k.observaciones}”`}
                    </p>
                    {k.anulado && <p className="text-sm font-semibold">Anulado: {k.motivoAnulacion}</p>}
                  </div>
                  <b className={`text-xl tabular-nums ${k.anulado ? "line-through" : ""}`}>{formatearMoneda(k.monto)}</b>
                </div>
                {puedeAnular && !k.anulado && (
                  <details>
                    <summary className="cursor-pointer text-sm text-texto-suave">Anular este cobro</summary>
                    <FormularioAccion accion={anularCobroAccion} boton="Anular el cobro" variante="peligro" enLinea>
                      <input type="hidden" name="cobroId" value={k.id} />
                      <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. se anotó dos veces" required />
                    </FormularioAccion>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {puedeCobrar && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">¿Ya debía plata antes de empezar a usar el sistema?</summary>
          <p className="mt-2 text-texto-suave">Anotá cuánto debía: queda como lo más viejo de su cuenta y es lo primero que se cancela cuando paga.</p>
          <div className="mt-3">
            <FormularioAccion accion={saldoInicialAccion} boton="Guardar" enLinea>
              <input type="hidden" name="clienteId" value={c.clienteId} />
              <CampoNumero etiqueta="Debía de antes" name="monto" defaultValue={dec(c.saldoInicial).isZero() ? "" : dec(c.saldoInicial).toFixed(0)} placeholder="Ej. 80.000" />
            </FormularioAccion>
          </div>
        </details>
      )}
    </section>
  );
}
