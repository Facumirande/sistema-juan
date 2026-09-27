import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, formatearFechaHora, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { cuentaCorriente } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "DOC-05 Estado de cuenta · Sistema Juan" };

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TIPOS: Readonly<Record<string, string>> = {
  SALDO_INICIAL: "Deuda anterior",
  CARGO_COMPRA: "Compra",
  PAGO: "Pago",
  ANULACION_COMPRA: "Anulación compra",
  ANULACION_PAGO: "Anulación pago",
  AJUSTE_DEBITO: "Ajuste (+)",
  AJUSTE_CREDITO: "Ajuste (−)",
};

const SEMAFOROS: Readonly<Record<string, string>> = { VERDE: "VERDE", AMARILLO: "AMARILLO", ROJO: "ROJO", EXCEDIDO: "EXCEDIDO", SIN_LIMITE: "sin límite" };

const saldoTexto = (v: string) => (dec(v).lt(0) ? `${formatearMoneda(dec(v).neg())} (a favor)` : formatearMoneda(v));

/**
 * DOC-05 Estado de cuenta de proveedor (06 §11, 09): se reconstruye desde el libro, así que
 * imprimirlo dos veces para el mismo período da lo mismo. Por defecto, el mes en curso.
 */
export default async function EstadoDeCuenta({ params, searchParams }: PageProps<"/cuentas-proveedores/[id]/estado-de-cuenta">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_cuenta");
  const id = idDeRuta((await params).id);
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const d = parametro(f.desde);
  const h = parametro(f.hasta);
  const hasta = h && PATRON_FECHA.test(h) ? h : hoy;
  const desde = d && PATRON_FECHA.test(d) ? d : `${hasta.slice(0, 7)}-01`;
  const c = await cargarFicha(cuentaCorriente(obtenerBaseDatos(), sesion.authUserId, id, { desde, hasta }));
  const i = c.indicadores;
  const totalDebe = c.movimientos.reduce((s, m) => s.plus(m.debe), dec(0));
  const totalHaber = c.movimientos.reduce((s, m) => s.plus(m.haber), dec(0));
  const tabla = "w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1 [&_th]:border-b [&_th]:border-texto [&_th]:px-1";

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/cuentas-proveedores/${id}`} className="text-texto-suave hover:underline">
          ← Cuenta del proveedor
        </Link>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="date" name="desde" defaultValue={desde} aria-label="Desde" className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          <input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          <button type="submit" className="h-11 rounded-lg border border-borde px-3">
            Ver
          </button>
        </form>
        <BotonImprimir />
      </div>

      <header className="flex flex-col gap-1 border-b-2 border-texto pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">ESTADO DE CUENTA — {c.proveedor.nombre.toUpperCase()}</h1>
          <p>
            Período {formatearFecha(desde)} al {formatearFecha(hasta)}
          </p>
        </div>
        {(c.proveedor.razonSocial || c.proveedor.identificacionFiscal) && (
          <p className="text-sm">{[c.proveedor.razonSocial, c.proveedor.identificacionFiscal && `CUIT ${c.proveedor.identificacionFiscal}`].filter(Boolean).join(" · ")}</p>
        )}
        <p className="text-sm">
          Emitido {formatearFechaHora(new Date(), sesion.zonaHoraria)} por {sesion.nombre}
        </p>
      </header>

      <section>
        <h2 className="font-bold">RESUMEN</h2>
        <p>
          Saldo al {formatearFecha(sumarDias(desde, -1))} {saldoTexto(c.saldoAlInicio)} · Comprado {formatearMoneda(c.comprado)} · Pagado {formatearMoneda(c.pagado)} · Ajustes{" "}
          {formatearMoneda(c.ajustes)}
        </p>
        <p className="font-semibold">
          Saldo al {formatearFecha(hasta)} {saldoTexto(c.saldoAlCierre)}
          {c.proveedor.limiteCredito && ` · Límite ${formatearMoneda(c.proveedor.limiteCredito)} · Disponible ${formatearMoneda(i.disponible ?? "0")}`} · {SEMAFOROS[i.semaforo]}
          {i.usoPct && ` ${i.usoPct.toFixed(1).replace(".", ",")} %`} · Vencido {formatearMoneda(c.vencimientos.vencida)}
        </p>
        {hasta !== hoy && <p className="text-sm">(Límite, disponible y vencido son los de hoy.)</p>}
      </section>

      <section>
        <h2 className="font-bold">MOVIMIENTOS</h2>
        {c.movimientos.length === 0 ? (
          <p>Sin movimientos en el período.</p>
        ) : (
          <table className={tabla}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Comprobante</th>
                <th>Detalle</th>
                <th className="text-right">Debe</th>
                <th className="text-right">Haber</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {c.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatearFecha(m.fecha).slice(0, 5)}</td>
                  <td>{TIPOS[m.tipo]}</td>
                  <td className="whitespace-nowrap">{m.comprobante ?? ""}</td>
                  <td>{m.motivo ?? m.descripcion}</td>
                  <td className="text-right whitespace-nowrap">{dec(m.debe).gt(0) ? formatearMoneda(m.debe) : ""}</td>
                  <td className="text-right whitespace-nowrap">{dec(m.haber).gt(0) ? formatearMoneda(m.haber) : ""}</td>
                  <td className="text-right whitespace-nowrap">{saldoTexto(m.saldo)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={4} className="text-right">
                  Totales
                </td>
                <td className="text-right whitespace-nowrap">{formatearMoneda(totalDebe)}</td>
                <td className="text-right whitespace-nowrap">{formatearMoneda(totalHaber)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="break-inside-avoid">
        <h2 className="font-bold">COMPRAS CON SALDO PENDIENTE AL {formatearFecha(hoy)}</h2>
        {c.pendientes.length === 0 ? (
          <p>No hay compras pendientes.</p>
        ) : (
          <table className={tabla}>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Fecha</th>
                <th className="text-right">Total</th>
                <th className="text-right">Pagado</th>
                <th className="text-right">Pendiente</th>
                <th>Vence</th>
                <th>Atraso</th>
              </tr>
            </thead>
            <tbody>
              {c.pendientes.map((p) => (
                <tr key={p.clave}>
                  <td>{p.descripcion}</td>
                  <td className="whitespace-nowrap">{formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria)).slice(0, 5)}</td>
                  <td className="text-right whitespace-nowrap">{formatearMoneda(p.total)}</td>
                  <td className="text-right whitespace-nowrap">{formatearMoneda(p.pagado)}</td>
                  <td className="text-right whitespace-nowrap">{formatearMoneda(p.pendiente)}</td>
                  <td className="whitespace-nowrap">{p.vence ? formatearFecha(p.vence).slice(0, 5) : "—"}</td>
                  <td>{p.diasAtraso ? `${p.diasAtraso} días` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {c.pagos.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="font-bold">PAGOS DEL PERÍODO E IMPUTACIÓN</h2>
          <table className={tabla}>
            <tbody>
              {c.pagos.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.numero}</td>
                  <td className="whitespace-nowrap">{formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria)).slice(0, 5)}</td>
                  <td className="text-right whitespace-nowrap">{p.anulado ? "ANULADO" : formatearMoneda(p.monto)}</td>
                  <td>
                    {!p.anulado &&
                      `→ ${[...p.imputaciones.map((x) => `${x.deuda} ${formatearMoneda(x.monto)}`), ...(dec(p.aFavor).gt(0) ? [`a favor ${formatearMoneda(p.aFavor)}`] : [])].join(" · ")}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="border-t border-texto pt-2 text-sm">
        Saldo según nuestros registros al {formatearFecha(hasta)}. Por favor, informe cualquier diferencia.
      </footer>
    </article>
  );
}
