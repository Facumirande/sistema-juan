import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { agrupacionSugerida, type Agrupacion } from "@/dominio/reportes/periodos";
import { balance } from "@/modulos/reportes/balance";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { BarrasHorizontales, GraficoColumnas, GraficoLineas } from "@/ui/graficos";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Balance · Sistema Juan" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;
const AGRUPACIONES: Record<Agrupacion, { nombre: string; porPeriodo: string }> = {
  DIA: { nombre: "Por día", porPeriodo: "por día" },
  SEMANA: { nombre: "Por semana", porPeriodo: "por semana" },
  MES: { nombre: "Por mes", porPeriodo: "por mes" },
};
const plata = (v: string | null) => (v === null ? "—" : formatearMoneda(v));
const punto = (v: string) => ({ valor: Number(v), texto: formatearMoneda(v) });

function Dato({ titulo, valor, detalle, enlace }: { titulo: string; valor: string; detalle?: ReactNode; enlace?: string }) {
  const cuerpo = (
    <>
      <span className="text-sm text-texto-suave">{titulo}</span>
      <span className="text-xl font-semibold tabular-nums sm:text-2xl">{valor}</span>
      {detalle && <span className="text-sm text-texto-suave">{detalle}</span>}
    </>
  );
  const clases = "flex flex-col gap-0.5 rounded-lg border border-borde bg-superficie p-4";
  return enlace ? (
    <Link href={enlace} className={`${clases} hover:border-marca`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clases}>{cuerpo}</div>
  );
}

function Grafico({ titulo, descripcion, children, tabla }: { titulo: string; descripcion?: string; children: ReactNode; tabla: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <header>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {descripcion && <p className="text-sm text-texto-suave">{descripcion}</p>}
      </header>
      {children}
      <details className="print:hidden">
        <summary className="cursor-pointer text-sm text-texto-suave">Ver tabla</summary>
        <div className="mt-2">{tabla}</div>
      </details>
    </section>
  );
}

/** Balance: lo vendido, lo comprado, la ganancia y la deuda con proveedores a lo largo del tiempo. */
export default async function PaginaBalance({ searchParams }: PageProps<"/balance">) {
  const sesion = await sesionParaPantalla("reportes.ver");
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const h = parametro(f.hasta);
  const d = parametro(f.desde);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : sumarDias(hasta, -29);
  const a = parametro(f.por);
  const agrupacion: Agrupacion = a && a in AGRUPACIONES ? (a as Agrupacion) : agrupacionSugerida(desde, hasta);
  const b = await balance(obtenerBaseDatos(), sesion.authUserId, { desde, hasta, agrupacion });
  const t = b.totales;
  const etiquetas = b.series.map((s) => s.etiqueta);
  const rangos = [
    { nombre: "Últimos 30 días", desde: sumarDias(hoy, -29), hasta: hoy },
    { nombre: "Este mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { nombre: "Últimos 3 meses", desde: sumarDias(hoy, -90), hasta: hoy },
    { nombre: "Este año", desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
  ];
  const enlace = (x: { desde: string; hasta: string; por?: Agrupacion }) => `/balance?desde=${x.desde}&hasta=${x.hasta}${x.por ? `&por=${x.por}` : ""}`;
  const sinMovimientos = t.entregas === 0 && (t.comprado === null || t.comprado === "0.00");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Balance" descripcion={`Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}: cuánto se vendió, se compró y se ganó. Lo vendido son las entregas confirmadas, contadas en su día de entrega. Pasá el dedo o el mouse por los gráficos para ver cada valor.`}>
        <Link href={`/balance/movimientos?desde=${desde}&hasta=${hasta}`} className={clasesBoton("secundario")}>
          Movimientos
        </Link>
        <Link href="/reportes" className={clasesBoton("secundario")}>
          Reportes
        </Link>
      </Encabezado>

      <div className="flex flex-col gap-3 print:hidden">
        <nav aria-label="Período" className="flex flex-wrap gap-2">
          {rangos.map((r) => (
            <Link key={r.nombre} href={enlace(r)} className={clasesBoton(r.desde === desde && r.hasta === hasta ? "principal" : "secundario")}>
              {r.nombre}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Desde</span>
            <input type="date" name="desde" defaultValue={desde} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Hasta</span>
            <input type="date" name="hasta" defaultValue={hasta} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Agrupar</span>
            <select name="por" defaultValue={agrupacion} className="h-11 rounded-lg border border-borde bg-superficie px-3">
              {Object.entries(AGRUPACIONES).map(([clave, x]) => (
                <option key={clave} value={clave}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={clasesBoton("secundario")}>
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {b.ver.venta && <Dato titulo="Vendido" valor={plata(t.vendido)} detalle={`${t.entregas} ${t.entregas === 1 ? "entrega" : "entregas"}`} />}
        {b.ver.costo && (
          <Dato
            titulo="Ganancia"
            valor={plata(t.ganancia)}
            detalle={t.gananciaPct !== null ? `${formatearNumero(t.gananciaPct, { decimales: 1 })} % de lo vendido` : "Sin ventas"}
          />
        )}
        {t.comprado !== null && <Dato titulo="Comprado" valor={plata(t.comprado)} detalle="Mercadería de las jornadas" />}
        {t.pagado !== null && <Dato titulo="Pagado a proveedores" valor={plata(t.pagado)} detalle="Pagos en el período" />}
        {t.deuda !== null && <Dato titulo="Deuda con proveedores hoy" valor={plata(t.deuda)} enlace="/cuentas-proveedores" detalle="Ver las cuentas →" />}
        {t.sinFacturar !== null && <Dato titulo="Entregado sin facturar" valor={plata(t.sinFacturar)} enlace="/facturacion" detalle="Ver facturación →" />}
      </div>

      {sinMovimientos && <p className="text-texto-suave">No hubo ventas ni compras en estas fechas. Probá con un período más largo.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(b.ver.venta || t.comprado !== null) && (
          <Grafico
            titulo={`Ventas y compras ${AGRUPACIONES[agrupacion].porPeriodo}`}
            descripcion="Lo que se vendió (entregado) y lo que se compró en el mercado."
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>Período</th>
                    {b.ver.venta && <th className="text-right">Vendido</th>}
                    {t.comprado !== null && <th className="text-right">Comprado</th>}
                  </tr>
                </thead>
                <tbody>
                  {b.series.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      {b.ver.venta && <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.vendido)}</td>}
                      {t.comprado !== null && <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.comprado)}</td>}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoLineas
              descripcion="Ventas y compras en el tiempo"
              etiquetas={etiquetas}
              series={[
                ...(b.ver.venta ? [{ nombre: "Vendido", color: "serie-1" as const, puntos: b.series.map((s) => punto(s.valores.vendido)) }] : []),
                ...(t.comprado !== null ? [{ nombre: "Comprado", color: "serie-2" as const, puntos: b.series.map((s) => punto(s.valores.comprado)) }] : []),
              ]}
            />
          </Grafico>
        )}

        {b.ver.costo && (
          <Grafico
            titulo={`Ganancia ${AGRUPACIONES[agrupacion].porPeriodo}`}
            descripcion="Lo vendido menos lo que costó esa mercadería."
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th className="text-right">Vendido</th>
                    <th className="text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {b.series.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.vendido)}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.ganancia)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoColumnas descripcion="Ganancia en el tiempo" nombre="Ganancia" etiquetas={etiquetas} puntos={b.series.map((s) => punto(s.valores.ganancia))} />
          </Grafico>
        )}

        {b.ver.deuda && (
          <Grafico
            titulo="Deuda con proveedores"
            descripcion={`Lo que se les debía al final de cada ${agrupacion === "DIA" ? "día" : agrupacion === "SEMANA" ? "semana" : "mes"}.`}
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th className="text-right">Deuda</th>
                  </tr>
                </thead>
                <tbody>
                  {b.deuda.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoLineas descripcion="Deuda con proveedores en el tiempo" etiquetas={b.deuda.map((s) => s.etiqueta)} series={[{ nombre: "Deuda", color: "serie-2", puntos: b.deuda.map((s) => punto(s.valores.saldo)) }]} area />
          </Grafico>
        )}

        {b.ver.venta && b.clientes.length > 0 && (
          <Grafico
            titulo="Clientes que más compraron"
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="text-right">Vendido</th>
                    {b.ver.costo && <th className="text-right">Ganancia</th>}
                  </tr>
                </thead>
                <tbody>
                  {b.clientes.map((c) => (
                    <tr key={c.cliente}>
                      <td>{c.cliente}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(c.vendido)}</td>
                      {b.ver.costo && <td className="text-right whitespace-nowrap">{plata(c.ganancia)}</td>}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <BarrasHorizontales filas={b.clientes.slice(0, 8).map((c) => ({ etiqueta: c.cliente, valor: Number(c.vendido), texto: formatearMoneda(c.vendido), detalle: c.ganancia !== null ? `ganó ${formatearMoneda(c.ganancia)}` : null }))} />
          </Grafico>
        )}

        {b.ver.venta && b.productos.length > 0 && (
          <Grafico
            titulo="Productos más vendidos"
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Vendido</th>
                    {b.ver.costo && <th className="text-right">Ganancia</th>}
                  </tr>
                </thead>
                <tbody>
                  {b.productos.map((p) => (
                    <tr key={p.producto}>
                      <td>{p.producto}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(p.vendido)}</td>
                      {b.ver.costo && <td className="text-right whitespace-nowrap">{plata(p.ganancia)}</td>}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <BarrasHorizontales filas={b.productos.slice(0, 8).map((p) => ({ etiqueta: p.producto, valor: Number(p.vendido), texto: formatearMoneda(p.vendido), detalle: p.ganancia !== null ? `ganó ${formatearMoneda(p.ganancia)}` : null }))} />
          </Grafico>
        )}
      </div>
    </section>
  );
}
