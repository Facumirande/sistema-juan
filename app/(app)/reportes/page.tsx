import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { reporteCompras, reporteDeuda, reporteDiferencias, reporteJornadas, reporteVentas } from "@/modulos/reportes/reportes";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { MOTIVOS_DIFERENCIA, MOTIVOS_FALTANTE, fechaConDia } from "@/ui/etiquetas";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { Encabezado, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Reportes · Sistema Juan" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;
const REPORTES = { ventas: "Ventas y margen", compras: "Compras", jornadas: "Días cerrados", deuda: "Deuda con proveedores", diferencias: "Faltantes y diferencias" } as const;
type Reporte = keyof typeof REPORTES;

const plata = (v: string | null) => (v === null ? "—" : formatearMoneda(v));
const pct = (v: string | null) => (v === null ? "—" : `${formatearNumero(v, { decimales: 1 })} %`);
const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);

/** P-90 Reportes (MVP básico). */
export default async function PaginaReportes({ searchParams }: PageProps<"/reportes">) {
  const sesion = await sesionParaPantalla("reportes.ver");
  const db = obtenerBaseDatos();
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const h = parametro(f.hasta);
  const d = parametro(f.desde);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : `${hasta.slice(0, 7)}-01`;
  const pedido = parametro(f.ver);
  const ver: Reporte = pedido && pedido in REPORTES ? (pedido as Reporte) : "ventas";
  const periodo = { desde, hasta };

  const ventas = ver === "ventas" ? await reporteVentas(db, sesion.authUserId, periodo) : null;
  const compras = ver === "compras" ? await reporteCompras(db, sesion.authUserId, periodo) : null;
  const jornadas = ver === "jornadas" ? await reporteJornadas(db, sesion.authUserId, periodo) : null;
  const deuda = ver === "deuda" ? await reporteDeuda(db, sesion.authUserId) : null;
  const diferencias = ver === "diferencias" ? await reporteDiferencias(db, sesion.authUserId, periodo) : null;

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Reportes" descripcion={ver === "deuda" ? `Al ${formatearFecha(hoy)}.` : `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}.`}>
        <BotonImprimir />
      </Encabezado>
      <nav className="flex flex-wrap gap-2 print:hidden">
        {Object.entries(REPORTES).map(([clave, texto]) => (
          <Link key={clave} href={`/reportes?ver=${clave}&desde=${desde}&hasta=${hasta}`} className={clasesBoton(clave === ver ? "principal" : "secundario")}>
            {texto}
          </Link>
        ))}
      </nav>
      {ver !== "deuda" && (
        <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
          <input type="hidden" name="ver" value={ver} />
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
      )}

      {ventas && (
        <>
          <p className="text-lg">
            Vendido <b>{plata(ventas.total.venta)}</b> · costo {plata(ventas.total.costo)} · margen <b>{pct(ventas.total.margenPct)}</b>
          </p>
          <Tarjeta titulo="Por cliente">
            <Tabla>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="text-right">Entregas</th>
                  <th className="text-right">Vendido</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {ventas.porCliente.map((x) => (
                  <tr key={x.cliente}>
                    <td>{x.cliente}</td>
                    <td className="text-right">{x.entregas}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.venta)}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.costo)}</td>
                    <td className="text-right">{pct(x.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
          <Tarjeta titulo="Por producto">
            <Tabla>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Entregado</th>
                  <th className="text-right">Vendido</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {ventas.porProducto.map((x) => (
                  <tr key={x.producto}>
                    <td>{x.producto}</td>
                    <td className="text-right whitespace-nowrap">{cant(x.cantidad, x.unidad)}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.venta)}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.costo)}</td>
                    <td className="text-right">{pct(x.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        </>
      )}

      {compras && (
        <>
          <Tarjeta titulo="Por proveedor">
            <Tabla>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="text-right">Compras</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pagado en el momento</th>
                </tr>
              </thead>
              <tbody>
                {compras.porProveedor.map((x) => (
                  <tr key={x.proveedor}>
                    <td>{x.proveedor}</td>
                    <td className="text-right">{x.compras}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.total)}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.pagado)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
          <Tarjeta titulo="Por producto">
            <Tabla>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Comprado</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Costo promedio</th>
                </tr>
              </thead>
              <tbody>
                {compras.porProducto.map((x) => (
                  <tr key={x.producto}>
                    <td>{x.producto}</td>
                    <td className="text-right whitespace-nowrap">{cant(x.cantidad, x.unidad)}</td>
                    <td className="text-right whitespace-nowrap">{plata(x.total)}</td>
                    <td className="text-right whitespace-nowrap">
                      {plata(x.costoPromedio)}/{x.unidad === "KG" ? "kg" : "u"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        </>
      )}

      {jornadas &&
        (jornadas.length === 0 ? (
          <p className="text-texto-suave">No hay días cerrados en estas fechas.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Día</th>
                <th className="text-right">Comprado</th>
                <th className="text-right">Vendido</th>
                <th className="text-right">Margen</th>
                <th className="text-right">Sobrantes</th>
                <th className="text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map(({ fecha, resumen: r }) => (
                <tr key={fecha}>
                  <td>
                    <Link href={`/jornadas/${fecha}/cierre`} className="capitalize underline-offset-4 hover:underline">
                      {fechaConDia(fecha)}
                    </Link>
                  </td>
                  <td className="text-right whitespace-nowrap">{plata(r.comprado)}</td>
                  <td className="text-right whitespace-nowrap">{plata(r.vendido)}</td>
                  <td className="text-right whitespace-nowrap">
                    {plata(r.margen)} <span className="text-sm text-texto-suave">{pct(r.margenPct)}</span>
                  </td>
                  <td className="text-right whitespace-nowrap">{plata(r.sobrantesCosto)}</td>
                  <td className="text-right font-semibold whitespace-nowrap">{plata(r.resultado)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ))}

      {deuda &&
        (deuda.filas.length === 0 ? (
          <p className="text-texto-suave">No se le debe nada a ningún proveedor.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">No vencido</th>
                <th className="text-right">1–7 días</th>
                <th className="text-right">8–15</th>
                <th className="text-right">16–30</th>
                <th className="text-right">Más de 30</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {deuda.filas.map((x) => (
                <tr key={x.proveedor}>
                  <td>{x.proveedor}</td>
                  {[x.noVencido, x.de1a7, x.de8a15, x.de16a30, x.masDe30].map((v, i) => (
                    <td key={i} className={`text-right whitespace-nowrap ${i > 0 && v !== "0" ? "text-error" : ""}`}>
                      {v === "0" ? "—" : plata(v)}
                    </td>
                  ))}
                  <td className="text-right font-semibold whitespace-nowrap">{plata(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ))}

      {diferencias &&
        (diferencias.length === 0 ? (
          <p className="text-texto-suave">No hubo faltantes ni diferencias en estas fechas.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Día</th>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Qué pasó</th>
                <th className="text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {diferencias.map((x, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatearFecha(x.fecha).slice(0, 5)}</td>
                  <td>{x.cliente}</td>
                  <td>{x.producto}</td>
                  <td>
                    {x.motivoFaltante && <span className="block">Al preparar: {MOTIVOS_FALTANTE[x.motivoFaltante]}</span>}
                    {x.motivoDiferencia && (
                      <span className="block">
                        Al entregar: {MOTIVOS_DIFERENCIA[x.motivoDiferencia]}
                        {x.detalle && ` (${x.detalle})`}
                      </span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {x.faltante && <span className="block">faltó {cant(x.faltante, x.unidad)}</span>}
                    {x.rechazo && <span className="block">devuelto {cant(x.rechazo, x.unidad)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        ))}
    </section>
  );
}
