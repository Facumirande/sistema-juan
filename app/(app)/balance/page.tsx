import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { diasEntre, formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
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
const MEDALLAS = ["🥇", "🥈", "🥉"];
const punto = (v: string) => ({ valor: Number(v), texto: formatearMoneda(v) });

type Pastel = "azul" | "violeta" | "naranja" | "amarillo" | "verde" | "rosa";

/** Cuánto cambió contra el período anterior, con flecha y en palabras (nunca solo color). */
function Cambio({ actual, anterior, subirEsBueno }: { actual: string | null; anterior: string | null; subirEsBueno: boolean }) {
  if (actual === null || anterior === null) return null;
  const a = Number(actual);
  const b = Number(anterior);
  // Sin nada en el período anterior no hay con qué comparar: no se dice nada.
  if (b === 0) return null;
  const pct = Math.round(((a - b) / Math.abs(b)) * 100);
  if (pct === 0) return <span className="text-sm text-texto-suave">= Igual que el período anterior</span>;
  const sube = pct > 0;
  const bueno = sube === subirEsBueno;
  return (
    <span className={`text-sm font-semibold ${bueno ? "text-marca" : "text-error"}`}>
      {sube ? "▲" : "▼"} {Math.abs(pct)} % {sube ? "más" : "menos"} que el período anterior
    </span>
  );
}

function Dato({ titulo, icono, color, valor, detalle, enlace, cambio }: { titulo: string; icono: string; color: Pastel; valor: string; detalle?: ReactNode; enlace?: string; cambio?: ReactNode }) {
  const cuerpo = (
    <>
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: `var(--pastel-${color})` }} aria-hidden />
      <span className="flex items-center gap-2">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl" style={{ background: `var(--pastel-${color})` }}>
          {icono}
        </span>
        <span className="font-medium text-texto-suave">{titulo}</span>
      </span>
      <span className="text-2xl font-bold tabular-nums sm:text-3xl">{valor}</span>
      {cambio}
      {detalle && <span className="text-sm text-texto-suave">{detalle}</span>}
    </>
  );
  const clases = "relative flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-borde bg-superficie p-4 pt-5 shadow-sm";
  return enlace ? (
    <Link href={enlace} className={`${clases} hover:border-marca`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clases}>{cuerpo}</div>
  );
}

/**
 * De cada $100 vendidos, cuánto fue mercadería y cuánto ganancia: una barra apilada de dos partes
 * (lo que mejor muestra una parte de un todo), con cada parte escrita.
 */
function RepartoDeLoVendido({ vendido, costo, ganancia }: { vendido: string; costo: string; ganancia: string }) {
  const v = Number(vendido);
  const g = Number(ganancia);
  if (v <= 0) return null;
  if (g < 0) {
    return (
      <p className="rounded-xl bg-[var(--pastel-rosa)] p-3 font-semibold text-[var(--pastel-rosa-texto)]">
        ⚠ Se perdió {formatearMoneda(String(-g))}: la mercadería costó {formatearMoneda(costo)} y se vendió {formatearMoneda(vendido)}.
      </p>
    );
  }
  const pctGanancia = Math.round((g / v) * 100);
  const pctCosto = 100 - pctGanancia;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">
        De cada <b>$100</b> que se vendieron, <b>${pctCosto}</b> pagaron la mercadería y <b className="text-marca">${pctGanancia} quedaron de ganancia</b>.
      </p>
      <div className="flex h-10 w-full gap-0.5 overflow-hidden rounded-xl" role="img" aria-label={`Mercadería ${pctCosto} %, ganancia ${pctGanancia} %`}>
        <div className="flex items-center justify-start bg-[var(--base-grafico)] px-3 text-sm font-semibold text-texto" style={{ width: `${pctCosto}%` }}>
          {pctCosto >= 15 && `${pctCosto} %`}
        </div>
        <div className="flex items-center justify-end rounded-r-[4px] bg-serie-1 px-3 text-sm font-semibold text-white" style={{ width: `${pctGanancia}%` }}>
          {pctGanancia >= 10 && `${pctGanancia} %`}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3 rounded-sm bg-[var(--base-grafico)]" /> Mercadería {formatearMoneda(costo)}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3 rounded-sm bg-serie-1" /> Ganancia {formatearMoneda(ganancia)}
        </span>
      </div>
    </div>
  );
}

function Grafico({ titulo, icono, descripcion, children, tabla }: { titulo: string; icono: string; descripcion?: string; children: ReactNode; tabla: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold">
          <span aria-hidden>{icono}</span> {titulo}
        </h2>
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
  const largo = diasEntre(desde, hasta) + 1;
  const anteriorHasta = sumarDias(desde, -1);
  const anteriorDesde = sumarDias(anteriorHasta, -(largo - 1));
  const db = obtenerBaseDatos();
  const [b, anterior] = await Promise.all([
    balance(db, sesion.authUserId, { desde, hasta, agrupacion }),
    balance(db, sesion.authUserId, { desde: anteriorDesde, hasta: anteriorHasta, agrupacion: "MES" }),
  ]);
  const t = b.totales;
  const ta = anterior.totales;
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

      {!sinMovimientos && t.vendido !== null && (
        <p className="rounded-2xl bg-[var(--pastel-verde)] p-4 text-lg text-[var(--pastel-verde-texto)]">
          Del {formatearFecha(desde)} al {formatearFecha(hasta)} se vendieron <b>{plata(t.vendido)}</b> en {t.entregas} {t.entregas === 1 ? "entrega" : "entregas"}
          {t.ganancia !== null && (
            <>
              {" "}
              y se ganaron <b>{plata(t.ganancia)}</b>
              {t.gananciaPct !== null && ` (${formatearNumero(t.gananciaPct, { decimales: 1 })} % de lo vendido)`}
            </>
          )}
          .{t.deuda !== null && Number(t.deuda) > 0 && <> Hoy se les debe <b>{plata(t.deuda)}</b> a los proveedores.</>}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {b.ver.venta && (
          <Dato
            titulo="Vendido"
            icono="💰"
            color="azul"
            valor={plata(t.vendido)}
            cambio={<Cambio actual={t.vendido} anterior={ta.vendido} subirEsBueno />}
            detalle={`${t.entregas} ${t.entregas === 1 ? "entrega" : "entregas"}`}
          />
        )}
        {b.ver.costo && (
          <Dato
            titulo="Ganancia"
            icono="📈"
            color="verde"
            valor={plata(t.ganancia)}
            cambio={<Cambio actual={t.ganancia} anterior={ta.ganancia} subirEsBueno />}
            detalle={t.gananciaPct !== null ? `${formatearNumero(t.gananciaPct, { decimales: 1 })} % de lo vendido` : "Sin ventas"}
          />
        )}
        {t.comprado !== null && (
          <Dato titulo="Comprado" icono="🧺" color="naranja" valor={plata(t.comprado)} cambio={<Cambio actual={t.comprado} anterior={ta.comprado} subirEsBueno={false} />} detalle="Mercadería comprada para esos días" />
        )}
        {t.pagado !== null && <Dato titulo="Pagado a proveedores" icono="💵" color="violeta" valor={plata(t.pagado)} detalle="Pagos en el período" />}
        {t.deuda !== null && <Dato titulo="Deuda con proveedores hoy" icono="🏪" color="rosa" valor={plata(t.deuda)} enlace="/cuentas-proveedores" detalle="Ver las cuentas →" />}
        {t.sinFacturar !== null && <Dato titulo="Entregado sin facturar" icono="🧾" color="amarillo" valor={plata(t.sinFacturar)} enlace="/facturacion" detalle="Ver facturación →" />}
      </div>

      {b.ver.costo && t.vendido !== null && t.costoVendido !== null && t.ganancia !== null && Number(t.vendido) > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
          <h2 className="text-lg font-semibold">
            <span aria-hidden>🥧</span> ¿Cuánto queda de lo que se vende?
          </h2>
          <RepartoDeLoVendido vendido={t.vendido} costo={t.costoVendido} ganancia={t.ganancia} />
        </section>
      )}

      {sinMovimientos && <p className="text-texto-suave">No hubo ventas ni compras en estas fechas. Probá con un período más largo.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(b.ver.venta || t.comprado !== null) && (
          <Grafico
            titulo={`Ventas y compras ${AGRUPACIONES[agrupacion].porPeriodo}`}
            icono="📊"
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
                // Lo vendido se dibuja último, para que quede encima.
                ...(t.comprado !== null ? [{ nombre: "Comprado", color: "serie-2" as const, puntos: b.series.map((s) => punto(s.valores.comprado)) }] : []),
                ...(b.ver.venta ? [{ nombre: "Vendido", color: "serie-1" as const, puntos: b.series.map((s) => punto(s.valores.vendido)) }] : []),
              ]}
            />
          </Grafico>
        )}

        {b.ver.costo && (
          <Grafico
            titulo={`Ganancia ${AGRUPACIONES[agrupacion].porPeriodo}`}
            icono="📈"
            descripcion="Lo vendido menos lo que costó esa mercadería. En rojo, los períodos en que se perdió."
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
            icono="🏪"
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
            icono="🏆"
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
            <BarrasHorizontales filas={b.clientes.slice(0, 8).map((c, i) => ({ etiqueta: `${MEDALLAS[i] ?? `${i + 1}.`} ${c.cliente}`, valor: Number(c.vendido), texto: formatearMoneda(c.vendido), detalle: c.ganancia !== null ? `ganó ${formatearMoneda(c.ganancia)}` : null }))} />
          </Grafico>
        )}

        {b.ver.venta && b.productos.length > 0 && (
          <Grafico
            titulo="Productos más vendidos"
            icono="🥬"
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
            <BarrasHorizontales filas={b.productos.slice(0, 8).map((p) => ({ etiqueta: `${dibujoDeProducto(p.producto)} ${p.producto}`, valor: Number(p.vendido), texto: formatearMoneda(p.vendido), detalle: p.ganancia !== null ? `ganó ${formatearMoneda(p.ganancia)}` : null }))} />
          </Grafico>
        )}
      </div>
    </section>
  );
}
