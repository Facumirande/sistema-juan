import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { registroDeMovimientos, type TipoRegistro } from "@/modulos/reportes/balance";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Movimientos · Sistema Juan" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS: Record<TipoRegistro, { nombre: string; plural: string; ayuda: string }> = {
  VENTA: { nombre: "Venta", plural: "Ventas", ayuda: "entregas confirmadas" },
  COMPRA: { nombre: "Compra", plural: "Compras", ayuda: "en el mercado" },
  PAGO: { nombre: "Pago", plural: "Pagos", ayuda: "a proveedores" },
  AJUSTE: { nombre: "Ajuste", plural: "Ajustes", ayuda: "de cuentas con proveedores" },
};

/** Registro de movimientos: todo lo que se vendió, compró y pagó en el período, del más nuevo al más viejo. */
export default async function PaginaMovimientos({ searchParams }: PageProps<"/balance/movimientos">) {
  const sesion = await sesionParaPantalla("reportes.ver");
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const h = parametro(f.hasta);
  const d = parametro(f.desde);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : sumarDias(hasta, -29);
  const t = parametro(f.tipo);
  const tipo = t && t in TIPOS ? (t as TipoRegistro) : null;
  const r = await registroDeMovimientos(obtenerBaseDatos(), sesion.authUserId, { desde, hasta, tipos: tipo ? [tipo] : [] });
  const enlace = (x: TipoRegistro | null) => `/balance/movimientos?desde=${desde}&hasta=${hasta}${x ? `&tipo=${x}` : ""}`;

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Movimientos" descripcion={`Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}. Sin lo anulado.`} volver={{ ruta: `/balance?desde=${desde}&hasta=${hasta}`, texto: "Balance" }}>
        <BotonImprimir />
      </Encabezado>

      <div className="flex flex-col gap-3 print:hidden">
        <nav aria-label="Tipo" className="flex flex-wrap gap-2">
          <Link href={enlace(null)} className={clasesBoton(tipo === null ? "principal" : "secundario")}>
            Todo
          </Link>
          {(Object.keys(TIPOS) as TipoRegistro[]).map((x) => (
            <Link key={x} href={enlace(x)} className={clasesBoton(tipo === x ? "principal" : "secundario")}>
              {TIPOS[x].plural}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
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
      </div>

      {Object.keys(r.totales).length > 0 && (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(TIPOS) as TipoRegistro[])
            .filter((x) => r.totales[x])
            .map((x) => (
              <li key={x} className="flex flex-col gap-0.5 rounded-lg border border-borde bg-superficie p-4">
                <span className="text-sm text-texto-suave">
                  {TIPOS[x].plural} {TIPOS[x].ayuda}
                </span>
                <span className="text-xl font-semibold tabular-nums">{formatearMoneda(r.totales[x]!.importe)}</span>
                <span className="text-sm text-texto-suave">
                  {r.totales[x]!.cantidad} {r.totales[x]!.cantidad === 1 ? "movimiento" : "movimientos"}
                </span>
              </li>
            ))}
        </ul>
      )}

      {r.movimientos.length === 0 ? (
        <p className="text-texto-suave">No hay movimientos en estas fechas.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Día</th>
              <th>Qué</th>
              <th>Cliente o proveedor</th>
              <th>Detalle</th>
              <th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.movimientos.map((m) => (
              <tr key={`${m.tipo}:${m.id}`}>
                <td className="whitespace-nowrap">{formatearFecha(m.fecha).slice(0, 5)}</td>
                <td className="whitespace-nowrap">
                  <Link href={m.enlace} className="underline-offset-4 hover:underline">
                    {TIPOS[m.tipo].nombre} {m.numero}
                  </Link>
                </td>
                <td>{m.quien}</td>
                <td className="text-sm text-texto-suave">{m.detalle}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatearMoneda(m.importe)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {r.recortado && <p className="text-sm text-texto-suave">Se muestran los 500 más nuevos: achicá las fechas para ver el resto.</p>}
    </section>
  );
}
