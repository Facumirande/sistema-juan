import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { gastosEIngresos } from "@/modulos/gastos/gastos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { MEDIOS_PAGO, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";
import { BarrasHorizontales } from "@/ui/graficos";
import { parametro } from "@/ui/parametros";

import { anularMovimientoAccion, estadoDeRubroAccion } from "./acciones";
import { FormularioDeGasto, FormularioDeRubro } from "./formularios";

export const metadata: Metadata = { title: "Gastos e ingresos · Sistema Repartos" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/**
 * P-66 Gastos e ingresos: lo que se gasta o entra por fuera de la mercadería (nafta, peajes,
 * arreglos, otros ingresos), por rubro. Cuenta en el balance como plata real que salió o entró.
 */
export default async function PaginaGastos({ searchParams }: PageProps<"/gastos">) {
  const sesion = await sesionParaPantalla("pagos.ver");
  const sp = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const h = parametro(sp.hasta);
  const d = parametro(sp.desde);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : `${hoy.slice(0, 7)}-01`;
  const g = await gastosEIngresos(obtenerBaseDatos(), sesion.authUserId, { desde, hasta });
  const puedeAnotar = sesion.permisos.includes("pagos.registrar");
  const puedeAnular = sesion.permisos.includes("pagos.anular");
  const finDelMesPasado = sumarDias(`${hoy.slice(0, 7)}-01`, -1);
  const rangos = [
    { nombre: "Hoy", desde: hoy, hasta: hoy },
    { nombre: "Últimos 7 días", desde: sumarDias(hoy, -6), hasta: hoy },
    { nombre: "Este mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { nombre: "El mes pasado", desde: `${finDelMesPasado.slice(0, 7)}-01`, hasta: finDelMesPasado },
    { nombre: "Este año", desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
  ];
  const elegido = rangos.find((r) => r.desde === desde && r.hasta === hasta);
  const diferencia = dec(g.totales.ingresos).minus(g.totales.gastos);
  const gastos = g.porRubro.filter((r) => r.tipo === "GASTO");
  const ingresos = g.porRubro.filter((r) => r.tipo === "INGRESO");
  const dato = "flex flex-col rounded-2xl p-4";
  const fila = (r: (typeof g.porRubro)[number]) => ({
    etiqueta: `${r.dibujo} ${r.rubro}`,
    valor: Number(r.total),
    texto: formatearMoneda(r.total),
    detalle: `${r.veces === 1 ? "1 vez" : `${r.veces} veces`}${r.cantidad ? ` · ${formatearNumero(r.cantidad, { decimales: 2, recortarCeros: true })} ${r.unidad}` : ""}`,
  });

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Encabezado titulo="Gastos e ingresos" descripcion="Lo que se gasta o entra por fuera de la mercadería: nafta, peajes, arreglos, otros ingresos. Se anota por rubro y después se ve en el Balance.">
        <Link href={`/balance?desde=${desde}&hasta=${hasta}`} className={clasesBoton("secundario")}>
          📈 Ver en el Balance
        </Link>
      </Encabezado>

      {puedeAnotar && (
        <Tarjeta titulo="＋ Anotar un gasto o un ingreso">
          <FormularioDeGasto rubros={g.rubros} hoy={g.hoy} />
        </Tarjeta>
      )}

      <nav aria-label="Qué fechas ver" className="flex flex-wrap gap-2 print:hidden">
        {rangos.map((r) => (
          <Link key={r.nombre} href={`/gastos?desde=${r.desde}&hasta=${r.hasta}`} aria-current={r === elegido ? "true" : undefined} className={clasesBoton(r === elegido ? "principal" : "secundario")}>
            {r.nombre}
          </Link>
        ))}
      </nav>
      <p className="text-2xl font-extrabold">{desde === hasta ? <span className="first-letter:uppercase">{fechaConDia(desde)}</span> : `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <p className={`${dato} bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]`}>
          <span className="font-semibold">💸 Se gastó</span>
          <b className="text-3xl tabular-nums">{formatearMoneda(g.totales.gastos)}</b>
        </p>
        <p className={`${dato} bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]`}>
          <span className="font-semibold">💵 Entró por otras cosas</span>
          <b className="text-3xl tabular-nums">{formatearMoneda(g.totales.ingresos)}</b>
        </p>
        <p className={`${dato} border border-borde bg-superficie`}>
          <span className="text-texto-suave">Diferencia</span>
          <b className={`text-3xl tabular-nums ${diferencia.lt(0) ? "text-error" : ""}`}>{formatearMoneda(diferencia.toString())}</b>
        </p>
      </div>

      {g.porRubro.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {gastos.length > 0 && (
            <Tarjeta titulo="💸 En qué se gastó">
              <BarrasHorizontales color="serie-2" filas={gastos.map(fila)} />
            </Tarjeta>
          )}
          {ingresos.length > 0 && (
            <Tarjeta titulo="💵 Por qué entró plata">
              <BarrasHorizontales filas={ingresos.map(fila)} />
            </Tarjeta>
          )}
        </div>
      )}

      <Tarjeta titulo="🗒️ Lo anotado">
        {g.movimientos.length === 0 ? (
          <p className="text-texto-suave">No hay nada anotado en estas fechas.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {g.movimientos.map((m) => (
              <li key={m.id} className={`flex flex-col gap-2 py-3 ${m.anulado ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span aria-hidden className="text-3xl leading-none">
                    {m.dibujo}
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className={`text-xl font-bold ${m.anulado ? "line-through" : ""}`}>{m.rubro}</p>
                    <p className="text-sm text-texto-suave">
                      <span className="font-semibold first-letter:uppercase">{fechaConDia(m.fecha)}</span> · {MEDIOS_PAGO[m.medioPago] ?? m.medioPago}
                      {m.cantidad && ` · ${formatearNumero(m.cantidad, { decimales: 2, recortarCeros: true })} ${m.unidad}`}
                      {m.detalle && ` · “${m.detalle}”`}
                      {m.quien && ` · lo anotó ${m.quien.split(" ")[0]}`}
                    </p>
                    {m.anulado && <p className="text-sm font-semibold">Anulado: {m.motivoAnulacion}</p>}
                  </div>
                  <b className={`text-xl tabular-nums ${m.anulado ? "line-through" : m.tipo === "INGRESO" ? "text-marca" : ""}`}>
                    {m.tipo === "INGRESO" ? "+" : "−"} {formatearMoneda(m.monto)}
                  </b>
                </div>
                {puedeAnular && !m.anulado && (
                  <details>
                    <summary className="cursor-pointer text-sm text-texto-suave">Anular</summary>
                    <FormularioAccion accion={anularMovimientoAccion} boton="Anular" variante="peligro" enLinea>
                      <input type="hidden" name="movimientoId" value={m.id} />
                      <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. se anotó dos veces" required />
                    </FormularioAccion>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {puedeAnotar && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-lg font-semibold">⚙️ Rubros: crear uno nuevo o cambiar los que hay</summary>
          <div className="mt-4 flex flex-col gap-5">
            <div className="rounded-xl bg-fondo p-4">
              <h3 className="mb-3 text-lg font-semibold">Nuevo rubro</h3>
              <FormularioDeRubro />
            </div>
            <ul className="flex flex-col divide-y divide-borde">
              {g.rubros.map((r) => (
                <li key={r.id} className="py-3">
                  <details>
                    <summary className={`flex cursor-pointer flex-wrap items-center gap-2 text-lg ${r.activo ? "" : "opacity-60"}`}>
                      <span aria-hidden className="text-2xl">
                        {r.dibujo}
                      </span>
                      <b>{r.nombre}</b>
                      <span className="rounded-full border border-borde px-2.5 py-0.5 text-sm">{r.tipo === "GASTO" ? "Gasto" : "Ingreso"}</span>
                      {r.unidad && <span className="text-sm text-texto-suave">se cuenta en {r.unidad}</span>}
                      {!r.activo && <span className="text-sm font-semibold">dado de baja</span>}
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <FormularioDeRubro rubro={r} />
                      <BotonAccion accion={estadoDeRubroAccion} datos={{ rubroId: r.id, activo: r.activo ? "no" : "si" }} className={clasesBoton(r.activo ? "peligro" : "secundario")}>
                        {r.activo ? "Dar de baja (deja de aparecer para anotar)" : "Volver a activarlo"}
                      </BotonAccion>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </section>
  );
}
