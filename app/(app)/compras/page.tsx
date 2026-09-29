import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { listarCompras } from "@/modulos/compras/compras";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { CONDICIONES_COMPRA, ESTADOS_PAGO, fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Compras · Sistema Juan" };

/** P-56 Compras de un día. */
export default async function PaginaCompras({ searchParams }: PageProps<"/compras">) {
  const sesion = await sesionParaPantalla("compras.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : (await fechasDeTrabajo(db, sesion.authUserId)).sugerida;
  const compras = await listarCompras(db, sesion.authUserId, { fecha });
  const vigentes = compras.filter((c) => c.estado === "REGISTRADA");
  const verCostos = sesion.permisos.includes("precios.ver_costos");

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado titulo="Compras" descripcion={`Lo que se compró en el mercado para la entrega del ${fechaConDia(fecha)}. Tocá una compra para ver el detalle o anularla.`}>
        <Link href={`/lista-compra?fecha=${fecha}`} className={clasesBoton("secundario")}>
          Lista de compra
        </Link>
        {sesion.permisos.includes("compras.registrar") && (
          <Link href={`/compras/nueva?fecha=${fecha}`} className={clasesBoton("principal")}>
            Registrar compra
          </Link>
        )}
      </Encabezado>
      <nav aria-label="Día" className="flex flex-wrap items-center gap-2">
        <Link href={`/compras?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="fecha" defaultValue={fecha} className="h-11 rounded-lg border border-borde bg-superficie px-3" aria-label="Fecha de entrega" />
          <button type="submit" className={clasesBoton("secundario")}>
            Ver
          </button>
        </form>
        <Link href={`/compras?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>
      {compras.length === 0 ? (
        <p className="text-texto-suave">Todavía no hay compras para este día.</p>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Proveedor</th>
                <th>Pago</th>
                {verCostos && <th className="text-right">Total</th>}
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id} className={c.estado === "ANULADA" ? "opacity-60" : ""}>
                  <td>
                    <Link href={`/compras/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                      {c.numero}
                    </Link>
                    <span className="block text-sm text-texto-suave">{formatearFechaHora(c.fecha, sesion.zonaHoraria).slice(11)}</span>
                  </td>
                  <td>{c.proveedor}</td>
                  <td>
                    {c.estado === "ANULADA" ? (
                      <span className="text-error">Anulada</span>
                    ) : (
                      <>
                        {CONDICIONES_COMPRA[c.condicion]}
                        {c.estadoPago && <span className="block text-sm text-texto-suave">{ESTADOS_PAGO[c.estadoPago]}</span>}
                        {c.excedeLimite && <span className="block text-sm text-error">superó el límite</span>}
                      </>
                    )}
                  </td>
                  {verCostos && <td className="text-right whitespace-nowrap">{c.total ? formatearMoneda(c.total) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </Tabla>
          {verCostos && <p className="text-texto-suave">Comprado en el día: {formatearMoneda(sumar(vigentes.map((c) => c.total ?? "0")))}</p>}
        </>
      )}
    </section>
  );
}
