import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { diasEntre, formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { MESES_QUE_SE_GUARDAN } from "@/dominio/reportes/meses";
import { agrupacionSugerida, type Agrupacion } from "@/dominio/reportes/periodos";
import { balance } from "@/modulos/reportes/balance";
import { balancesPorMes } from "@/modulos/reportes/balance-mensual";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { BarrasHorizontales, GraficoBarras } from "@/ui/graficos";
import { parametro } from "@/ui/parametros";

import { BalanceDelDinero, ComprasYVentas, GastosPorRubro, PendientesPorNombre } from "./dinero";

export const metadata: Metadata = { title: "Balance · Sistema Repartos" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;
const AGRUPACIONES: Record<Agrupacion, { nombre: string }> = {
  DIA: { nombre: "Por día" },
  SEMANA: { nombre: "Por semana" },
  MES: { nombre: "Por mes" },
};
const plata = (v: string | null) => (v === null ? "—" : formatearMoneda(v));
const MEDALLAS = ["🥇", "🥈", "🥉"];
const punto = (v: string) => ({ valor: Number(v), texto: formatearMoneda(v) });

type Pastel = "azul" | "violeta" | "naranja" | "amarillo" | "verde" | "rosa";

/** Cuánto cambió contra los días anteriores, con flecha y en palabras (nunca solo color). */
function Cambio({ actual, anterior, subirEsBueno, contra }: { actual: string | null; anterior: string | null; subirEsBueno: boolean; contra: string }) {
  if (actual === null || anterior === null) return null;
  const a = Number(actual);
  const b = Number(anterior);
  // Sin nada en el período anterior no hay con qué comparar: no se dice nada.
  if (b === 0) return null;
  const pct = Math.round(((a - b) / Math.abs(b)) * 100);
  if (pct === 0) return <span className="text-sm text-texto-suave">= Igual que {contra}</span>;
  const sube = pct > 0;
  const bueno = sube === subirEsBueno;
  return (
    <span className={`text-sm font-semibold ${bueno ? "text-marca" : "text-error"}`}>
      {sube ? "▲" : "▼"} {Math.abs(pct)} % {sube ? "más" : "menos"} que {contra}
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
        {descripcion && <p className="text-texto-suave">{descripcion}</p>}
      </header>
      {children}
      <details className="print:hidden">
        <summary className="cursor-pointer text-sm text-texto-suave">Ver los números en una tabla</summary>
        <div className="mt-2">{tabla}</div>
      </details>
    </section>
  );
}

/** "de hoy, martes 06/10", "de ayer, lunes 05/10" o "del domingo 04/10". */
function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return `de hoy, ${fechaConDia(fecha)}`;
  if (fecha === sumarDias(hoy, -1)) return `de ayer, ${fechaConDia(fecha)}`;
  return `del ${fechaConDia(fecha)}`;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Balance: lo vendido, las compras, lo ganado, lo que falta cobrar y lo que falta pagar, de un día o
 * de un período, con gráficos de barras; y el dinero real, el pendiente y el total (`dinero.tsx`). Con un solo día elegido es el "balance del día": los
 * números de ese día y, para comparar, las barras de ese día junto a los seis anteriores.
 */
export default async function PaginaBalance({ searchParams }: PageProps<"/balance">) {
  const sesion = await sesionParaPantalla("reportes.ver");
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const dia = parametro(f.dia);
  const unSoloDia = dia && PATRON.test(dia) ? dia : null;
  const h = unSoloDia ?? parametro(f.hasta);
  const d = unSoloDia ?? parametro(f.desde);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : sumarDias(hasta, -29);
  const unDia = desde === hasta;
  const a = parametro(f.por);
  const agrupacion: Agrupacion = a && a in AGRUPACIONES && !unDia ? (a as Agrupacion) : agrupacionSugerida(desde, hasta);
  const largo = diasEntre(desde, hasta) + 1;
  const anteriorHasta = sumarDias(desde, -1);
  const anteriorDesde = sumarDias(anteriorHasta, -(largo - 1));
  const db = obtenerBaseDatos();
  const [b, anterior, semana, meses] = await Promise.all([
    balance(db, sesion.authUserId, { desde, hasta, agrupacion }),
    balance(db, sesion.authUserId, { desde: anteriorDesde, hasta: anteriorHasta, agrupacion: "MES" }),
    // Con un solo día, las barras muestran ese día junto a los seis anteriores.
    unDia ? balance(db, sesion.authUserId, { desde: sumarDias(hasta, -6), hasta, agrupacion: "DIA" }) : Promise.resolve(null),
    balancesPorMes(db, sesion.authUserId, hoy),
  ]);
  const g = semana ?? b;
  const t = b.totales;
  const ta = anterior.totales;
  const etiquetas = g.series.map((s) => s.etiqueta);
  const cadaCuanto = unDia || agrupacion === "DIA" ? "día" : agrupacion === "SEMANA" ? "semana" : "mes";
  const contra = unDia ? "el día anterior" : `los ${largo} días anteriores`;
  const rangos = [
    { nombre: "Hoy", desde: hoy, hasta: hoy },
    { nombre: "Ayer", desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) },
    { nombre: "Últimos 7 días", desde: sumarDias(hoy, -6), hasta: hoy },
    { nombre: "Este mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { nombre: "Últimos 30 días", desde: sumarDias(hoy, -29), hasta: hoy },
    { nombre: "Este año", desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
  ];
  const elegido = rangos.find((r) => r.desde === desde && r.hasta === hasta);
  const sinMovimientos = t.entregas === 0 && (t.comprado === null || t.comprado === "0.00");
  const fechas = unDia ? `El ${fechaConDia(desde)}` : `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`;

  return (
    <section className="flex w-full flex-col gap-6">
      <Encabezado
        titulo={unDia ? `Balance ${nombreDelDia(desde, hoy)}` : "Balance"}
        descripcion={`${unDia ? "Lo que se vendió, lo que se compró y lo que quedó ese día." : `${fechas}: lo que se vendió, lo que se compró y lo que quedó.`} Cuenta como vendido lo que ya se entregó.`}
      >
        <Link href={`/balance/movimientos?desde=${desde}&hasta=${hasta}`} className={clasesBoton("secundario")}>
          {unDia ? "Movimientos del día" : "Movimientos"}
        </Link>
        <Link href="/reportes" className={clasesBoton("secundario")}>
          Reportes
        </Link>
      </Encabezado>

      <div className="flex flex-col gap-3 print:hidden">
        <nav aria-label="Qué fechas ver" className="flex flex-wrap gap-2">
          {rangos.map((r) => (
            <Link key={r.nombre} href={`/balance?desde=${r.desde}&hasta=${r.hasta}`} aria-current={r === elegido ? "true" : undefined} className={clasesBoton(r === elegido ? "principal" : "secundario")}>
              {r.nombre}
            </Link>
          ))}
        </nav>
        {unDia && (
          <nav aria-label="Otro día" className="flex flex-wrap items-center gap-2">
            <Link href={`/balance?dia=${sumarDias(desde, -1)}`} className={clasesBoton("secundario")}>
              ← Día anterior
            </Link>
            {desde < hoy && (
              <Link href={`/balance?dia=${sumarDias(desde, 1)}`} className={clasesBoton("secundario")}>
                Día siguiente →
              </Link>
            )}
            <form method="get" className="flex items-center gap-2">
              <label className="flex items-center gap-2 font-medium">
                Ver otro día
                <input type="date" name="dia" defaultValue={desde} max={hoy} required className="h-11 rounded-lg border border-borde bg-superficie px-3" />
              </label>
              <button type="submit" className={clasesBoton("secundario")}>
                Ver
              </button>
            </form>
          </nav>
        )}
        <details open={!unDia && !elegido}>
          <summary className="min-h-10 cursor-pointer py-2 font-medium text-texto-suave">📅 Elegir otras fechas</summary>
          <form method="get" className="flex flex-wrap items-end gap-2 pt-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Desde</span>
              <input type="date" name="desde" defaultValue={desde} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Hasta</span>
              <input type="date" name="hasta" defaultValue={hasta} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Una barra</span>
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
        </details>
      </div>

      {sinMovimientos ? (
        <p className="rounded-2xl border border-borde bg-superficie p-4 text-lg">
          {unDia
            ? desde === hoy
              ? "Todavía no se entregó ni se compró nada hoy. Cuando se confirmen las entregas, acá van a aparecer las ventas del día."
              : "Ese día no hubo ventas ni compras."
            : "No hubo ventas ni compras en estas fechas. Probá con más días."}
        </p>
      ) : (
        t.vendido !== null && (
          <p className="rounded-2xl bg-[var(--pastel-verde)] p-4 text-lg text-[var(--pastel-verde-texto)]">
            {t.entregas === 0 ? (
              <>{fechas} todavía no hay ventas entregadas</>
            ) : (
              <>
                {fechas} se vendieron <b>{plata(t.vendido)}</b> en {t.entregas} {t.entregas === 1 ? "entrega" : "entregas"}
              </>
            )}
            {t.comprado !== null && (
              <>
                {t.entregas === 0 ? ";" : ","} las compras fueron de <b>{plata(t.comprado)}</b>
              </>
            )}
            {t.entregas > 0 && t.ganancia !== null && (
              <>
                {" "}
                y {Number(t.ganancia) < 0 ? "se perdieron" : "quedaron de ganancia"} <b>{plata(String(Math.abs(Number(t.ganancia))))}</b>
              </>
            )}
            .
          </p>
        )
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {b.ver.venta && (
          <Dato
            titulo="Se vendió"
            icono="💰"
            color="azul"
            valor={plata(t.vendido)}
            cambio={<Cambio actual={t.vendido} anterior={ta.vendido} subirEsBueno contra={contra} />}
            detalle={`${t.entregas} ${t.entregas === 1 ? "entrega" : "entregas"} a clientes`}
          />
        )}
        {t.comprado !== null && (
          <Dato titulo="Compras" icono="🧺" color="naranja" valor={plata(t.comprado)} cambio={<Cambio actual={t.comprado} anterior={ta.comprado} subirEsBueno={false} contra={contra} />} detalle={b.compras ? `Pagado ${plata(b.compras.pagado)} · quedó a pagar ${plata(b.compras.aPagar)}` : "Mercadería retirada del mercado"} />
        )}
        {b.ver.costo && (
          <Dato
            titulo="Quedó de ganancia"
            icono="📈"
            color="verde"
            valor={plata(t.ganancia)}
            cambio={<Cambio actual={t.ganancia} anterior={ta.ganancia} subirEsBueno contra={contra} />}
            detalle={t.gananciaPct !== null ? `${formatearNumero(t.gananciaPct, { decimales: 0 })} de cada 100 pesos vendidos` : "Lo vendido menos lo que costó"}
          />
        )}
        {b.dinero && <Dato titulo="A cobrar" icono="🤝" color="azul" valor={plata(b.dinero.aCobrar)} enlace="/cuentas-clientes" detalle="Entregado y sin cobrar, hoy · ver →" />}
        {t.deuda !== null && <Dato titulo="A pagar" icono="📤" color="rosa" valor={plata(t.deuda)} enlace="/cuentas-proveedores" detalle="Retirado y sin pagar, hoy · ver →" />}
      </div>

      {(t.pagado !== null || t.sinFacturar !== null) && (
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-texto-suave">
          {t.pagado !== null && (
            <span>
              💵 Pagado a proveedores {unDia ? "ese día" : "en estas fechas"}: <b className="text-texto">{plata(t.pagado)}</b>
            </span>
          )}
          {t.sinFacturar !== null && (
            <Link href="/facturacion" className="underline-offset-4 hover:underline">
              🧾 Entregado que todavía no se facturó: <b className="text-texto">{plata(t.sinFacturar)}</b> →
            </Link>
          )}
        </p>
      )}

      {b.ver.costo && t.vendido !== null && t.costoVendido !== null && t.ganancia !== null && Number(t.vendido) > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
          <h2 className="text-lg font-semibold">
            <span aria-hidden>🥧</span> ¿Cuánto queda de lo que se vende?
          </h2>
          <RepartoDeLoVendido vendido={t.vendido} costo={t.costoVendido} ganancia={t.ganancia} />
        </section>
      )}

      {b.dinero && <BalanceDelDinero d={b.dinero} unDia={unDia} />}
      <ComprasYVentas compras={b.compras} ventas={b.ventas} unDia={unDia} />
      {b.dinero && <PendientesPorNombre aCobrar={b.aCobrarPorCliente} aPagar={b.aPagarPorProveedor} total={{ aCobrar: b.dinero.aCobrar, aPagar: b.dinero.aPagar }} />}
      {b.ver.dinero && <GastosPorRubro rubros={b.gastosPorRubro} unDia={unDia} />}

      {unDia && <h2 className="text-xl font-semibold">Ese día comparado con los 6 anteriores</h2>}

      {/* Un gráfico por renglón: cada uno ocupa todo el ancho de la pantalla. */}
      <div className="flex flex-col gap-4">
        {(g.ver.venta || g.totales.comprado !== null) && (
          <Grafico
            titulo="Lo que se vendió y las compras"
            icono="📊"
            descripcion={`Cada ${cadaCuanto}, una barra por lo vendido (lo que se entregó) y otra por las compras (lo que se retiró del mercado).`}
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>{conMayuscula(cadaCuanto)}</th>
                    {g.ver.venta && <th className="text-right">Vendido</th>}
                    {g.totales.comprado !== null && <th className="text-right">Compras</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.series.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      {g.ver.venta && <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.vendido)}</td>}
                      {g.totales.comprado !== null && <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.comprado)}</td>}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoBarras
              descripcion={`Lo vendido y lo comprado por ${cadaCuanto}`}
              etiquetas={etiquetas}
              series={[
                ...(g.ver.venta ? [{ nombre: "Vendido", color: "serie-1" as const, puntos: g.series.map((s) => punto(s.valores.vendido)) }] : []),
                ...(g.totales.comprado !== null ? [{ nombre: "Compras", color: "serie-2" as const, puntos: g.series.map((s) => punto(s.valores.comprado)) }] : []),
              ]}
            />
          </Grafico>
        )}

        {g.ver.costo && (
          <Grafico
            titulo="Lo que quedó de ganancia"
            icono="📈"
            descripcion={`Lo vendido menos lo que costó esa mercadería, por ${cadaCuanto}. Si la barra va para abajo, se perdió.`}
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>{conMayuscula(cadaCuanto)}</th>
                    <th className="text-right">Vendido</th>
                    <th className="text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {g.series.map((s) => (
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
            <GraficoBarras descripcion={`Ganancia por ${cadaCuanto}`} etiquetas={etiquetas} series={[{ nombre: "Ganancia", color: "serie-1", puntos: g.series.map((s) => punto(s.valores.ganancia)) }]} perdidaEnRojo />
          </Grafico>
        )}

        {g.ver.dinero && (
          <Grafico
            titulo="La plata que entró y la que salió"
            icono="💵"
            descripcion={`El dinero real de cada ${cadaCuanto}: lo que pagaron los clientes y otros ingresos, y lo que se les pagó a los proveedores y los gastos.`}
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>{conMayuscula(cadaCuanto)}</th>
                    <th className="text-right">Entró</th>
                    <th className="text-right">Salió</th>
                  </tr>
                </thead>
                <tbody>
                  {g.series.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.entro)}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.salio)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoBarras
              descripcion={`Lo que entró y lo que salió por ${cadaCuanto}`}
              etiquetas={etiquetas}
              series={[
                { nombre: "Entró", color: "serie-1", puntos: g.series.map((s) => punto(s.valores.entro)) },
                { nombre: "Salió", color: "serie-2", puntos: g.series.map((s) => punto(s.valores.salio)) },
              ]}
            />
          </Grafico>
        )}

        {g.ver.deuda && (
          <Grafico
            titulo="Lo que queda a pagar a los proveedores"
            icono="🏪"
            descripcion={`Lo retirado y todavía sin pagar al terminar cada ${cadaCuanto}. Si las barras suben, se debe más.`}
            tabla={
              <Tabla>
                <thead>
                  <tr>
                    <th>{conMayuscula(cadaCuanto)}</th>
                    <th className="text-right">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {g.deuda.map((s) => (
                    <tr key={s.periodo}>
                      <td>{s.etiqueta}</td>
                      <td className="text-right whitespace-nowrap">{formatearMoneda(s.valores.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            }
          >
            <GraficoBarras descripcion={`A pagar a los proveedores al terminar cada ${cadaCuanto}`} etiquetas={g.deuda.map((s) => s.etiqueta)} series={[{ nombre: "A pagar", color: "serie-2", puntos: g.deuda.map((s) => punto(s.valores.saldo)) }]} />
          </Grafico>
        )}
      </div>

      {b.ver.venta && (b.clientes.length > 0 || b.productos.length > 0) && <h2 className="text-xl font-semibold">{unDia ? "Las ventas del día" : "Lo más vendido en estas fechas"}</h2>}

      <div className="flex flex-col gap-4">
        {b.ver.venta && b.clientes.length > 0 && (
          <Grafico
            titulo={unDia ? "A quién se le vendió" : "A quién se le vendió más"}
            icono="🏆"
            descripcion="Cuánto compró cada cliente, del que más al que menos."
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
            <BarrasHorizontales filas={b.clientes.slice(0, 8).map((c, i) => ({ etiqueta: `${MEDALLAS[i] ?? `${i + 1}.`} ${c.cliente}`, valor: Number(c.vendido), texto: formatearMoneda(c.vendido), detalle: c.ganancia !== null ? `ganancia ${formatearMoneda(c.ganancia)}` : null }))} />
          </Grafico>
        )}

        {b.ver.venta && b.productos.length > 0 && (
          <Grafico
            titulo={unDia ? "Qué se vendió" : "Qué se vendió más"}
            icono="🥬"
            descripcion="Cuánta plata entró por cada producto."
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
            <BarrasHorizontales filas={b.productos.slice(0, 8).map((p) => ({ etiqueta: `${dibujoDeProducto(p.producto)} ${p.producto}`, valor: Number(p.vendido), texto: formatearMoneda(p.vendido), detalle: p.ganancia !== null ? `ganancia ${formatearMoneda(p.ganancia)}` : null }))} />
          </Grafico>
        )}
      </div>

      <section id="meses" className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm print:hidden">
        <header>
          <h2 className="text-lg font-semibold">
            <span aria-hidden>📁</span> El balance de cada mes, en Excel
          </h2>
          <p className="text-texto-suave">
            Un archivo por mes para guardar, imprimir o mandarle al contador: el resumen, los gráficos, el detalle día por día y lo vendido por cliente y por producto. Cada mes nuevo se agrega solo. Quedan en la lista los últimos {MESES_QUE_SE_GUARDAN} meses: los más viejos salen solos.
          </p>
        </header>
        {meses.length === 0 ? (
          <p className="rounded-xl bg-fondo p-3">Todavía no hay ningún mes con ventas o compras. Cuando se entregue o se compre algo, acá aparece el mes con su archivo.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {meses.map((m) => (
              <li key={m.mes} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    <span className="first-letter:uppercase">{m.nombre}</span>
                    {m.enCurso && <span className="rounded-full bg-marca/15 px-2.5 py-0.5 text-sm text-marca">Mes en curso</span>}
                  </p>
                  <p className="text-sm text-texto-suave">
                    Del {formatearFecha(m.desde)} al {formatearFecha(m.hasta)}
                    {m.enCurso && " (hasta hoy: el archivo se completa a medida que pasan los días)"}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {m.vendido !== null && (
                    <div>
                      <dt className="text-texto-suave">Se vendió</dt>
                      <dd className="font-semibold tabular-nums">{formatearMoneda(m.vendido)}</dd>
                    </div>
                  )}
                  {m.comprado !== null && (
                    <div>
                      <dt className="text-texto-suave">Se compró</dt>
                      <dd className="font-semibold tabular-nums">{formatearMoneda(m.comprado)}</dd>
                    </div>
                  )}
                  {m.ganancia !== null && (
                    <div>
                      <dt className="text-texto-suave">Ganancia</dt>
                      <dd className={`font-semibold tabular-nums ${Number(m.ganancia) < 0 ? "text-error" : ""}`}>{formatearMoneda(m.ganancia)}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/balance?desde=${m.desde}&hasta=${m.hasta}`} className={clasesBoton("secundario")}>
                    Ver en pantalla
                  </Link>
                  <a href={`/balance/planilla?mes=${m.mes}`} className={clasesBoton("principal")}>
                    ⬇ Bajar el Excel
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
