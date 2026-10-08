import Link from "next/link";
import type { ReactNode } from "react";

import { formatearMoneda } from "@/dominio/dinero/formato";
import type { Balance } from "@/modulos/reportes/balance";
import { fechaConDia } from "@/ui/etiquetas";
import { BarrasHorizontales } from "@/ui/graficos";

// El dinero en el Balance (pedido del usuario, 07/10/2026): la plata REAL (lo que ya entró y salió),
// la PENDIENTE o "virtual" (lo que falta cobrar y lo que falta pagar) y el total; y las compras y
// las ventas partidas en lo ya saldado y lo pendiente. Lo saldado va en color lleno y lo pendiente
// rayado (no se distingue solo por el color), siempre con su importe escrito.

type Serie = "serie-1" | "serie-2";
const plata = (v: string) => formatearMoneda(v);
const negativo = (v: string) => Number(v) < 0;
const tarjeta = "flex min-w-0 flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm";
const lleno = (color: Serie) => ({ background: `var(--${color})` });
/** Lo pendiente: el mismo color, rayado. */
const rayado = (color: Serie) => ({ background: `repeating-linear-gradient(135deg, var(--${color}) 0 5px, color-mix(in srgb, var(--${color}) 30%, transparent) 5px 10px)` });

/** Un renglón con su barra: qué es, cuánto y de qué se compone. */
function Renglon({ titulo, valor, maximo, color, pendiente = false, detalle, enlace }: { titulo: string; valor: string; maximo: number; color: Serie; pendiente?: boolean; detalle?: ReactNode; enlace?: string }) {
  const ancho = maximo > 0 ? Math.max(Number(valor) > 0 ? 2 : 0, (Math.max(Number(valor), 0) / maximo) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between gap-3">
        {enlace ? (
          <Link href={enlace} className="font-semibold underline-offset-4 hover:underline">
            {titulo} →
          </Link>
        ) : (
          <span className="font-semibold">{titulo}</span>
        )}
        <b className="text-xl tabular-nums">{plata(valor)}</b>
      </p>
      <div className="h-4 w-full overflow-hidden rounded-r-[4px] bg-fondo" aria-hidden>
        <div className="h-4 rounded-r-[4px]" style={{ width: `${ancho}%`, ...(pendiente ? rayado(color) : lleno(color)) }} />
      </div>
      {detalle && <p className="text-sm text-texto-suave">{detalle}</p>}
    </div>
  );
}

function Resultado({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda: string }) {
  return (
    <p className={`mt-auto flex flex-col rounded-xl p-3 ${negativo(valor) ? "bg-error/15 text-error" : "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]"}`}>
      <span className="font-semibold">{titulo}</span>
      <b className="text-3xl tabular-nums sm:text-4xl">{plata(valor)}</b>
      <span className="text-sm">{ayuda}</span>
    </p>
  );
}

/** Los tres balances: el dinero real, el pendiente ("virtual") y el total. */
export function BalanceDelDinero({ d, unDia }: { d: NonNullable<Balance["dinero"]>; unDia: boolean }) {
  const cuando = unDia ? "ese día" : "en estas fechas";
  const maxReal = Math.max(Number(d.entro), Number(d.salio));
  const maxPendiente = Math.max(Number(d.aCobrar), Number(d.aPagar));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-dinero">
      <header>
        <h2 id="titulo-dinero" className="text-xl font-semibold">
          <span aria-hidden>💵</span> El dinero: el real, el pendiente y el total
        </h2>
        <p className="text-texto-suave">
          El <b>real</b> es la plata que ya entró o salió. El <b>pendiente</b> todavía no se movió, pero ya se debe: lo que se entregó y falta cobrar, y lo que se retiró de los proveedores y falta pagar.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={tarjeta}>
          <h3 className="text-lg font-semibold">💵 Dinero real · {cuando}</h3>
          <Renglon titulo="Entró" valor={d.entro} maximo={maxReal} color="serie-1" detalle={`Cobrado a clientes ${plata(d.cobrado)} · otros ingresos ${plata(d.ingresos)}`} />
          <Renglon titulo="Salió" valor={d.salio} maximo={maxReal} color="serie-2" detalle={`Pagado a proveedores ${plata(d.pagado)} · gastos ${plata(d.gastos)}`} />
          <Resultado titulo={negativo(d.real) ? "Salió más de lo que entró" : "Quedó en mano"} valor={d.real} ayuda="Lo que entró menos lo que salió." />
        </div>
        <div className={tarjeta}>
          <h3 className="text-lg font-semibold">⏳ Dinero pendiente · a hoy</h3>
          <Renglon titulo="A cobrar" valor={d.aCobrar} maximo={maxPendiente} color="serie-1" pendiente enlace="/cuentas-clientes" detalle="Entregado a los clientes y todavía sin cobrar." />
          <Renglon titulo="A pagar" valor={d.aPagar} maximo={maxPendiente} color="serie-2" pendiente enlace="/cuentas-proveedores" detalle="Retirado de los proveedores y todavía sin pagar (crédito)." />
          <Resultado titulo={negativo(d.pendiente) ? "Se debe más de lo que falta cobrar" : "Pendiente a favor"} valor={d.pendiente} ayuda="Lo que falta cobrar menos lo que falta pagar." />
        </div>
        <div className={tarjeta}>
          <h3 className="text-lg font-semibold">🧮 Balance total</h3>
          <p className="text-texto-suave">Lo real más lo pendiente: lo que quedaría si hoy se cobrara todo lo que falta y se pagara todo lo que se debe.</p>
          <dl className="flex flex-col gap-1 text-lg">
            <div className="flex justify-between gap-3">
              <dt>Dinero real</dt>
              <dd className="font-bold tabular-nums">{plata(d.real)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>+ Dinero pendiente</dt>
              <dd className="font-bold tabular-nums">{plata(d.pendiente)}</dd>
            </div>
          </dl>
          <Resultado titulo="Balance total" valor={d.total} ayuda="Real + pendiente." />
        </div>
      </div>
    </section>
  );
}

/** Una barra de dos partes que suman el total: lo saldado (lleno) y lo pendiente (rayado). */
function DosPartes({ color, pctHecho, hecho, falta, nombres }: { color: Serie; pctHecho: number; hecho: string; falta: string; nombres: [string, string] }) {
  const hay = Number(hecho) + Number(falta) > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 w-full gap-0.5 overflow-hidden rounded-xl bg-fondo" role="img" aria-label={`${nombres[0]} ${pctHecho} %, ${nombres[1]} ${100 - pctHecho} %`}>
        {hay && pctHecho > 0 && <div style={{ width: `${pctHecho}%`, ...lleno(color) }} />}
        {hay && pctHecho < 100 && <div style={{ width: `${100 - pctHecho}%`, ...rayado(color) }} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <p className="flex flex-col">
          <span className="flex items-center gap-2 text-sm text-texto-suave">
            <span aria-hidden className="inline-block size-3 rounded-sm" style={lleno(color)} /> {nombres[0]}
          </span>
          <b className="text-2xl tabular-nums">{plata(hecho)}</b>
          <span className="text-sm text-texto-suave">{hay ? `${pctHecho} %` : "—"}</span>
        </p>
        <p className="flex flex-col">
          <span className="flex items-center gap-2 text-sm text-texto-suave">
            <span aria-hidden className="inline-block size-3 rounded-sm" style={rayado(color)} /> {nombres[1]}
          </span>
          <b className="text-2xl tabular-nums">{plata(falta)}</b>
          <span className="text-sm text-texto-suave">{hay ? `${100 - pctHecho} %` : "—"}</span>
        </p>
      </div>
    </div>
  );
}

function DetallePorNombre({ color, filas, nombres }: { color: Serie; filas: { clave: string; nombre: string; total: string; hecho: string; falta: string; enlace: string }[]; nombres: [string, string] }) {
  if (filas.length === 0) return null;
  const maximo = Math.max(...filas.map((f) => Number(f.total)), 1);
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f) => {
        const ancho = (Number(f.total) / maximo) * 100;
        const pctHecho = Number(f.total) > 0 ? (Number(f.hecho) / Number(f.total)) * 100 : 0;
        return (
          <li key={f.clave} className="flex flex-col gap-1">
            <p className="flex items-baseline justify-between gap-3">
              <Link href={f.enlace} className="truncate underline-offset-4 hover:underline">
                {f.nombre}
              </Link>
              <b className="shrink-0 tabular-nums">{plata(f.total)}</b>
            </p>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-r-[4px]" style={{ width: `${Math.max(2, ancho)}%` }} aria-hidden>
              {pctHecho > 0 && <div style={{ width: `${pctHecho}%`, ...lleno(color) }} />}
              {pctHecho < 100 && <div style={{ width: `${100 - pctHecho}%`, ...rayado(color) }} />}
            </div>
            <p className="text-sm text-texto-suave tabular-nums">
              {nombres[0].toLowerCase()} {plata(f.hecho)} · {nombres[1].toLowerCase()} <b className="text-texto">{plata(f.falta)}</b>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Las compras y las ventas de estas fechas, partidas igual: lo retirado de los proveedores es lo
 * pagado más lo que quedó a pagar; lo entregado a los clientes es lo cobrado más lo que falta cobrar.
 */
export function ComprasYVentas({ compras, ventas, unDia }: { compras: Balance["compras"]; ventas: Balance["ventas"]; unDia: boolean }) {
  if (!compras && !ventas) return null;
  const cuando = unDia ? "ese día" : "en estas fechas";
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-compras-ventas">
      <header>
        <h2 id="titulo-compras-ventas" className="text-xl font-semibold">
          <span aria-hidden>🔁</span> Compras y ventas: lo saldado y lo pendiente
        </h2>
        <p className="text-texto-suave">
          Lo que se retira de un proveedor y no se paga queda como crédito (<b>a pagar</b>). Lo que se entrega a un cliente y no se cobra queda igual, del otro lado (<b>a cobrar</b>).
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {compras && (
          <div className={tarjeta}>
            <h3 className="text-lg font-semibold">🧺 Compras · {cuando}</h3>
            <p>
              Se retiró de los proveedores <b className="text-2xl tabular-nums">{plata(compras.total)}</b>
            </p>
            <DosPartes color="serie-2" pctHecho={compras.pctPagado} hecho={compras.pagado} falta={compras.aPagar} nombres={["Pagado", "Retirado sin pagar (a pagar)"]} />
            <DetallePorNombre
              color="serie-2"
              nombres={["Pagado", "A pagar"]}
              filas={compras.porProveedor.slice(0, 8).map((p) => ({ clave: p.proveedorId, nombre: p.proveedor, total: p.total, hecho: p.pagado, falta: p.aPagar, enlace: `/cuentas-proveedores/${p.proveedorId}` }))}
            />
            {compras.porProveedor.length === 0 && <p className="text-texto-suave">No hubo compras {cuando}.</p>}
          </div>
        )}
        {ventas && (
          <div className={tarjeta}>
            <h3 className="text-lg font-semibold">🚚 Ventas · {cuando}</h3>
            <p>
              Se entregó a los clientes <b className="text-2xl tabular-nums">{plata(ventas.total)}</b>
            </p>
            <DosPartes color="serie-1" pctHecho={ventas.pctCobrado} hecho={ventas.cobrado} falta={ventas.aCobrar} nombres={["Cobrado", "Entregado sin cobrar (a cobrar)"]} />
            <DetallePorNombre
              color="serie-1"
              nombres={["Cobrado", "A cobrar"]}
              filas={ventas.porCliente.slice(0, 8).map((c) => ({ clave: c.clienteId, nombre: c.cliente, total: c.total, hecho: c.cobrado, falta: c.aCobrar, enlace: `/cuentas-clientes/${c.clienteId}` }))}
            />
            {ventas.porCliente.length === 0 && <p className="text-texto-suave">No hubo entregas {cuando}.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/** A hoy: a quién falta cobrarle y a quién falta pagarle, del que más al que menos. */
export function PendientesPorNombre({ aCobrar, aPagar, total }: { aCobrar: Balance["aCobrarPorCliente"]; aPagar: Balance["aPagarPorProveedor"]; total: { aCobrar: string; aPagar: string } }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className={tarjeta}>
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-semibold">
          <span>🤝 A cobrar, por cliente · a hoy</span>
          <b className="text-2xl tabular-nums">{plata(total.aCobrar)}</b>
        </h2>
        {aCobrar.length === 0 ? (
          <p className="text-texto-suave">No hay nada para cobrar.</p>
        ) : (
          <BarrasHorizontales rayadas filas={aCobrar.slice(0, 10).map((c) => ({ etiqueta: c.cliente, valor: Number(c.saldo), texto: plata(c.saldo), detalle: c.desde ? `debe desde el ${fechaConDia(c.desde)}` : "debe de antes" }))} />
        )}
        <Link href="/cuentas-clientes" className="self-start font-semibold underline underline-offset-4">
          Ver y anotar cobros →
        </Link>
      </div>
      <div className={tarjeta}>
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-semibold">
          <span>📤 A pagar, por proveedor · a hoy</span>
          <b className="text-2xl tabular-nums">{plata(total.aPagar)}</b>
        </h2>
        {aPagar.length === 0 ? <p className="text-texto-suave">No le debemos nada a ningún proveedor.</p> : <BarrasHorizontales rayadas color="serie-2" filas={aPagar.slice(0, 10).map((p) => ({ etiqueta: p.proveedor, valor: Number(p.saldo), texto: plata(p.saldo) }))} />}
        <Link href="/cuentas-proveedores" className="self-start font-semibold underline underline-offset-4">
          Ver y anotar pagos →
        </Link>
      </div>
    </section>
  );
}

/** Los gastos y los ingresos generales de estas fechas, por rubro. */
export function GastosPorRubro({ rubros, unDia }: { rubros: Balance["gastosPorRubro"]; unDia: boolean }) {
  const gastos = rubros.filter((r) => r.tipo === "GASTO");
  const ingresos = rubros.filter((r) => r.tipo === "INGRESO");
  const fila = (r: (typeof rubros)[number]) => ({ etiqueta: `${r.dibujo} ${r.rubro}`, valor: Number(r.total), texto: plata(r.total), detalle: r.cantidad ? `${r.cantidad.replace(".", ",")} ${r.unidad}` : null });
  return (
    <section className={tarjeta}>
      <h2 className="text-lg font-semibold">
        <span aria-hidden>💸</span> Gastos e ingresos generales · {unDia ? "ese día" : "en estas fechas"}
      </h2>
      {rubros.length === 0 ? (
        <p className="text-texto-suave">No hay gastos ni ingresos anotados. Se anotan en “Gastos e ingresos” (nafta, peajes, arreglos…).</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {gastos.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-texto-suave">💸 En qué se gastó</h3>
              <BarrasHorizontales color="serie-2" filas={gastos.map(fila)} />
            </div>
          )}
          {ingresos.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-texto-suave">💵 Por qué entró plata</h3>
              <BarrasHorizontales filas={ingresos.map(fila)} />
            </div>
          )}
        </div>
      )}
      <Link href="/gastos" className="self-start font-semibold underline underline-offset-4">
        Anotar un gasto o un ingreso →
      </Link>
    </section>
  );
}
