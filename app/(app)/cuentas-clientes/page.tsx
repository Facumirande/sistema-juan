import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarCuentasClientes } from "@/modulos/cuentas-clientes/cuentas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { fechaConDia } from "@/ui/etiquetas";
import { dibujoDeCliente } from "@/ui/etiquetas-tablero";
import { Encabezado, clasesBoton } from "@/ui/formularios";

import { registrarCobroAccion } from "./acciones";

export const metadata: Metadata = { title: "A cobrar · Sistema Repartos" };

/**
 * P-65 A cobrar: lo que ya se entregó y todavía no pagó cada cliente. Es la contracara de "A pagar"
 * (lo retirado de los proveedores que todavía no se pagó). Cobrar es un toque por cliente.
 */
export default async function PaginaACobrar() {
  const sesion = await sesionParaPantalla("cobranzas.ver");
  const { cuentas, total } = await listarCuentasClientes(obtenerBaseDatos(), sesion.authUserId);
  const puedeCobrar = sesion.permisos.includes("cobranzas.registrar");
  const deben = cuentas.filter((c) => dec(c.aCobrar).gt(0));
  const aFavor = cuentas.filter((c) => !dec(c.aCobrar).gt(0));
  const mayor = deben.reduce((m, c) => Math.max(m, Number(c.aCobrar)), 0);

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Encabezado titulo="A cobrar" descripcion="Lo que ya se entregó y los clientes todavía no pagaron. Cuando un cliente paga, tocá cómo pagó: se cancela lo más viejo que debe.">
        <Link href="/cuentas-proveedores" className={clasesBoton("secundario")}>
          📤 Ver lo que hay a pagar
        </Link>
        <Link href="/balance" className={clasesBoton("secundario")}>
          📈 Balance
        </Link>
      </Encabezado>

      <div className={`flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl p-5 ${total.clientes === 0 ? "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]" : "bg-[var(--pastel-azul)] text-[var(--pastel-azul-texto)]"}`}>
        <p className="flex flex-col">
          <span className="font-semibold">🤝 Falta cobrar en total</span>
          <b className="text-4xl tabular-nums sm:text-5xl">{formatearMoneda(total.aCobrar)}</b>
        </p>
        <p className="text-lg">{total.clientes === 0 ? "Nadie debe nada: está todo cobrado." : total.clientes === 1 ? "Lo debe 1 cliente." : `Lo deben ${total.clientes} clientes.`}</p>
      </div>

      {deben.length === 0 ? (
        <p className="rounded-2xl border border-borde bg-superficie p-4 text-lg">✓ No hay nada para cobrar. Lo que se entregue va a aparecer acá hasta que se cobre.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {deben.map((c) => (
            <li key={c.clienteId} className="flex flex-col gap-3 rounded-2xl border-2 border-borde bg-superficie p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fondo text-2xl">
                  {dibujoDeCliente(c.tipo)}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/cuentas-clientes/${c.clienteId}`} className="text-2xl leading-tight font-bold underline-offset-4 hover:underline">
                    {c.cliente}
                  </Link>
                  <p className="text-texto-suave">
                    {c.entregasSinCobrar === 0 ? "Debe de antes" : c.entregasSinCobrar === 1 ? "1 entrega sin cobrar" : `${c.entregasSinCobrar} entregas sin cobrar`}
                    {c.desde && <> · desde el {fechaConDia(c.desde)}</>}
                    {c.ultimoCobro && <> · último cobro el {fechaConDia(c.ultimoCobro)}</>}
                  </p>
                </div>
                <b className="text-3xl tabular-nums">{formatearMoneda(c.aCobrar)}</b>
              </div>
              {/* Cuánto pesa cada cliente en lo que falta cobrar. */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-fondo" aria-hidden>
                <div className="h-3 rounded-r-[4px] bg-serie-1" style={{ width: `${Math.max(1, (Number(c.aCobrar) / (mayor || 1)) * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {puedeCobrar && (
                  <>
                    <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, medioPago: "EFECTIVO" }} className={clasesBoton("principal")} titulo={`Pagó todo lo que debe (${formatearMoneda(c.aCobrar)}) en efectivo`}>
                      💵 Pagó todo en efectivo
                    </BotonAccion>
                    <BotonAccion accion={registrarCobroAccion} datos={{ clienteId: c.clienteId, medioPago: "TRANSFERENCIA" }} className={clasesBoton("principal")} titulo={`Pagó todo lo que debe (${formatearMoneda(c.aCobrar)}) por transferencia`}>
                      🏦 Pagó todo por transferencia
                    </BotonAccion>
                  </>
                )}
                <Link href={`/cuentas-clientes/${c.clienteId}`} className={clasesBoton("secundario")}>
                  Pagó una parte · ver su cuenta
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {aFavor.length > 0 && (
        <div className="rounded-2xl border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold">Pagaron de más (tienen plata a favor)</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {aFavor.map((c) => (
              <li key={c.clienteId} className="flex justify-between gap-3">
                <Link href={`/cuentas-clientes/${c.clienteId}`} className="underline-offset-4 hover:underline">
                  {c.cliente}
                </Link>
                <b className="tabular-nums">{formatearMoneda(c.aFavor)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-texto-suave">
        ¿Buscás la cuenta de un cliente que no debe nada (para ver lo que pagó, o cargarle lo que ya debía de antes)? Abrila desde su ficha:{" "}
        <Link href="/clientes" className="font-semibold underline underline-offset-4">
          Clientes
        </Link>{" "}
        → “🤝 Su cuenta”.
      </p>
    </section>
  );
}
