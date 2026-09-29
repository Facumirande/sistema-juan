import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { listarComprobantes, pendientesDeFacturar, type Periodicidad } from "@/modulos/facturacion/facturacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { PERIODICIDADES, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { facturarAccion } from "./acciones";

export const metadata: Metadata = { title: "Facturación · Sistema Juan" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/** P-85 Facturación y P-86 Facturar período: lo entregado sin facturar y los comprobantes emitidos. */
export default async function PaginaFacturacion({ searchParams }: PageProps<"/facturacion">) {
  const sesion = await sesionParaPantalla("facturacion.ver");
  const db = obtenerBaseDatos();
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const d = parametro(f.desde);
  const h = parametro(f.hasta);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) ? d : `${hasta.slice(0, 7)}-01`;
  const periodicidad = parametro(f.periodicidad) as Periodicidad | undefined;
  const verComprobantes = parametro(f.ver) === "comprobantes";
  const puedeEmitir = sesion.permisos.includes("facturacion.emitir");
  const [pendientes, comprobantes] = await Promise.all([
    verComprobantes ? Promise.resolve([]) : pendientesDeFacturar(db, sesion.authUserId, { hasta, periodicidad: periodicidad && periodicidad in PERIODICIDADES ? periodicidad : undefined }),
    verComprobantes ? listarComprobantes(db, sesion.authUserId, { desde, hasta }) : Promise.resolve([]),
  ]);
  const q = (cambios: Record<string, string>) => `/facturacion?${new URLSearchParams({ desde, hasta, ...(verComprobantes ? { ver: "comprobantes" } : {}), ...cambios }).toString()}`;

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Facturación" descripcion="Los comprobantes de venta de lo que se entregó (son internos, no son factura fiscal). A los clientes de “en cada entrega” se les hace solo al confirmar la entrega; a los de semana, quincena o mes, hacéselo desde “Sin facturar”.">
        {sesion.permisos.includes("facturacion.exportar") && (
          <Link href={`/facturacion/exportar?desde=${desde}&hasta=${hasta}`} className={clasesBoton("secundario")}>
            Exportar para el contador
          </Link>
        )}
      </Encabezado>
      <nav className="flex flex-wrap gap-2">
        <Link href={`/facturacion?desde=${desde}&hasta=${hasta}`} className={clasesBoton(verComprobantes ? "secundario" : "principal")}>
          Sin facturar
        </Link>
        <Link href={`/facturacion?desde=${desde}&hasta=${hasta}&ver=comprobantes`} className={clasesBoton(verComprobantes ? "principal" : "secundario")}>
          Comprobantes
        </Link>
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2">
        {verComprobantes && <input type="hidden" name="ver" value="comprobantes" />}
        {verComprobantes && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Desde</span>
            <input type="date" name="desde" defaultValue={desde} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{verComprobantes ? "Hasta" : "Entregas hasta"}</span>
          <input type="date" name="hasta" defaultValue={hasta} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
        </label>
        {!verComprobantes && <Selector etiqueta="Cómo factura" name="periodicidad" opciones={opciones(PERIODICIDADES)} vacia="Todos" defaultValue={periodicidad ?? ""} />}
        <button type="submit" className={clasesBoton("secundario")}>
          Ver
        </button>
      </form>

      {!verComprobantes ? (
        pendientes.length === 0 ? (
          <p className="text-texto-suave">No hay entregas sin facturar hasta el {formatearFecha(hasta)}.</p>
        ) : (
          <FormularioAccion accion={facturarAccion} boton="Emitir comprobantes de lo marcado" confirmar="¿Emitir un comprobante por cliente con las entregas marcadas?">
            <input type="hidden" name="hasta" value={hasta} />
            <input type="hidden" name="desde" value={pendientes.flatMap((p) => p.entregas.map((e) => e.fecha)).sort()[0] ?? hasta} />
            {pendientes.map((p) => (
              <Tarjeta key={p.clienteId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{p.cliente}</h2>
                  <span className="text-texto-suave">
                    {PERIODICIDADES[p.periodicidad]} · <b className="text-texto">{formatearMoneda(p.total)}</b>
                  </span>
                </div>
                {p.sinIdentificacionFiscal && <p className="text-sm text-texto-suave">Sin CUIT cargado (el comprobante interno se emite igual).</p>}
                <ul className="flex flex-col">
                  {p.entregas.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                      <label className="flex min-h-11 items-center gap-3">
                        {puedeEmitir && <input type="checkbox" name="entrega" value={e.id} defaultChecked={e.documentosAlDia} disabled={!e.documentosAlDia} className="size-5" />}
                        <span>
                          <Link href={`/entregas/${e.id}`} className="underline-offset-4 hover:underline">
                            {e.numero} v{e.version}
                          </Link>{" "}
                          · {formatearFecha(e.fecha)} · {e.punto}
                          {!e.documentosAlDia && <span className="text-error"> · faltan documentos</span>}
                        </span>
                      </label>
                      <span className="font-semibold">{formatearMoneda(e.total)}</span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            ))}
          </FormularioAccion>
        )
      ) : comprobantes.length === 0 ? (
        <p className="text-texto-suave">No hay comprobantes en estas fechas.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Comprobante</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Entregas</th>
              <th className="text-right">Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {comprobantes.map((c) => (
              <tr key={c.id} className={c.estado === "ANULADA" ? "opacity-60" : ""}>
                <td>
                  <Link href={`/facturacion/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                    {c.numero}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{formatearFecha(c.fecha)}</td>
                <td>
                  {c.cliente}
                  {c.periodo && <span className="block text-sm text-texto-suave">período {formatearFecha(c.periodo.desde).slice(0, 5)} al {formatearFecha(c.periodo.hasta).slice(0, 5)}</span>}
                </td>
                <td>{c.entregas}</td>
                <td className="text-right whitespace-nowrap">{formatearMoneda(c.total)}</td>
                <td>
                  {c.estado === "ANULADA" ? "Anulado" : "Emitido"}
                  {c.exportadaEn && <span className="block text-sm text-texto-suave">exportado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {verComprobantes && (
        <nav className="flex gap-2 text-sm">
          <Link href={q({ desde: sumarDias(desde, -30), hasta: sumarDias(desde, -1) })} className="text-texto-suave hover:underline">
            ← Mes anterior
          </Link>
        </nav>
      )}
    </section>
  );
}
