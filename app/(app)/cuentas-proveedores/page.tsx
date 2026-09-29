import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

export const metadata: Metadata = { title: "Deudas con proveedores · Sistema Juan" };

const FILTROS = { deuda: "Con deuda", vencidos: "Vencidos", rojo: "Rojo y excedido", todos: "Todos" } as const;

/** P-60 Deudas con proveedores: cuánto se le debe a cada uno, qué está vencido y cuánto crédito queda. */
export default async function PaginaCuentasProveedores({ searchParams }: PageProps<"/cuentas-proveedores">) {
  const sesion = await sesionParaPantalla("pagos.ver");
  const pedido = parametro((await searchParams).ver);
  const filtro = pedido && pedido in FILTROS ? (pedido as keyof typeof FILTROS) : "deuda";
  const { cuentas } = await listarCuentasProveedores(obtenerBaseDatos(), sesion.authUserId);
  const visibles = cuentas.filter((c) =>
    filtro === "todos"
      ? true
      : filtro === "vencidos"
        ? dec(c.vencimientos.vencida).gt(0)
        : filtro === "rojo"
          ? c.indicadores.semaforo === "ROJO" || c.indicadores.semaforo === "EXCEDIDO"
          : !c.indicadores.saldoNeto.isZero(),
  );
  const deudaTotal = sumar(cuentas.map((c) => c.indicadores.saldoPendiente));
  const vencida = sumar(cuentas.map((c) => c.vencimientos.vencida));
  const porVencer = sumar(cuentas.map((c) => c.vencimientos.porVencer));
  const puedePagar = sesion.permisos.includes("pagos.registrar");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo="Deudas con proveedores"
        descripcion={
          <>
            Se les debe {formatearMoneda(deudaTotal)}
            {vencida.gt(0) && <span className="text-error"> · vencido {formatearMoneda(vencida)}</span>}
            {porVencer.gt(0) && ` · vence en los próximos días ${formatearMoneda(porVencer)}`}. El color muestra cuánto del límite de crédito se usa con cada uno (verde tranquilo, amarillo cerca, rojo al límite). Tocá “Pagar” para anotar un pago.
          </>
        }
      />
      <nav aria-label="Filtro" className="flex flex-wrap gap-2">
        {Object.entries(FILTROS).map(([clave, texto]) => (
          <Link key={clave} href={`/cuentas-proveedores?ver=${clave}`} className={clasesBoton(clave === filtro ? "principal" : "secundario")}>
            {texto}
          </Link>
        ))}
      </nav>
      {visibles.length === 0 ? (
        <p className="text-texto-suave">No hay proveedores para mostrar.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th className="text-right">Se le debe</th>
              <th className="text-right">Disponible</th>
              <th>Estado</th>
              <th>Vencido / próximo</th>
              <th>Último pago</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.proveedorId}>
                <td>
                  <Link href={`/cuentas-proveedores/${c.proveedorId}`} className="font-medium underline-offset-4 hover:underline">
                    {c.proveedor}
                  </Link>
                  {c.ubicacion && <span className="block text-sm text-texto-suave">{c.ubicacion}</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  {c.indicadores.saldoAFavor.gt(0) ? (
                    <span className="text-marca">{formatearMoneda(c.indicadores.saldoAFavor)} a favor</span>
                  ) : (
                    formatearMoneda(c.indicadores.saldoPendiente)
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  {c.indicadores.disponible ? formatearMoneda(c.indicadores.disponible) : "—"}
                  {c.limiteCredito && <span className="block text-sm text-texto-suave">de {formatearMoneda(c.limiteCredito)}</span>}
                </td>
                <td>
                  <SemaforoCredito semaforo={c.indicadores.semaforo} usoPct={c.indicadores.usoPct?.toString()} />
                </td>
                <td className="whitespace-nowrap">
                  {dec(c.vencimientos.vencida).gt(0) && (
                    <span className="block text-error">
                      ⏰ {formatearMoneda(c.vencimientos.vencida)} ({c.vencimientos.maxDiasAtraso} d)
                    </span>
                  )}
                  {c.vencimientos.proximo && (
                    <span className="block text-sm text-texto-suave">
                      {formatearFecha(c.vencimientos.proximo.fecha).slice(0, 5)}: {formatearMoneda(c.vencimientos.proximo.monto)}
                    </span>
                  )}
                  {!dec(c.vencimientos.vencida).gt(0) && !c.vencimientos.proximo && "—"}
                </td>
                <td className="whitespace-nowrap">
                  {c.ultimoPago ? (
                    <>
                      {formatearFecha(hoyEnEmpresa(c.ultimoPago.fecha, sesion.zonaHoraria)).slice(0, 5)}
                      <span className="block text-sm text-texto-suave">{formatearMoneda(c.ultimoPago.monto)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {puedePagar && c.indicadores.saldoPendiente.gt(0) && (
                    <Link href={`/cuentas-proveedores/${c.proveedorId}/pago`} className={clasesBoton("secundario")}>
                      Pagar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
