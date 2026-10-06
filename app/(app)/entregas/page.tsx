import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { listarEntregas } from "@/modulos/entregas/entregas";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_ENTREGA, fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { FlechaNavegacion } from "@/ui/iconos";

export const metadata: Metadata = { title: "Entregas · Sistema Juan" };

/** P-79 Entregas del día. */
export default async function PaginaEntregas({ searchParams }: PageProps<"/entregas">) {
  const sesion = await sesionParaPantalla("entregas.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await jornadaEnCurso(db, sesion.authUserId);
  const entregas = await listarEntregas(db, sesion.authUserId, fecha);
  const vigentes = entregas.filter((e) => e.estado !== "ANULADA");
  const verVenta = sesion.permisos.includes("precios.ver_venta");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Entregas" descripcion={`Lo que se le lleva a cada cliente el ${fechaConDia(fecha)}. Cuando el cliente recibe, confirmá la entrega: completa, con diferencias o no recibida.`}>
        <Link href={`/preparacion/${fecha}`} className={clasesBoton("secundario")}>
          📦 Preparación
        </Link>
        <Link href={`/entregas/remitos?fecha=${fecha}`} className={clasesBoton("secundario")}>
          🧾 Remitos
        </Link>
        <Link href={`/viaje?fecha=${fecha}`} className={clasesBoton("secundario")}>
          <FlechaNavegacion /> Viaje de entrega
        </Link>
      </Encabezado>
      <nav aria-label="Día" className="flex gap-2">
        <Link href={`/entregas?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/entregas?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>
      {entregas.length === 0 ? (
        <p className="text-texto-suave">No hay entregas para este día: se arman al iniciar la preparación.</p>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <th>Entrega</th>
                <th>Cliente</th>
                <th>Reparto</th>
                <th>Estado</th>
                <th>Remito</th>
                {verVenta && <th className="text-right">Total</th>}
              </tr>
            </thead>
            <tbody>
              {entregas.map((e) => (
                <tr key={e.id} className={e.estado === "ANULADA" ? "opacity-60" : ""}>
                  <td>
                    <Link href={`/entregas/${e.id}`} className="font-medium underline-offset-4 hover:underline">
                      {e.numero}
                    </Link>
                  </td>
                  <td>
                    {e.cliente}
                    <span className="block text-sm text-texto-suave">{e.punto}</span>
                  </td>
                  <td>{e.reparto ? `${e.reparto}${e.orden ? ` · ${e.orden}` : ""}` : "—"}</td>
                  <td>
                    {ESTADOS_ENTREGA[e.estado]}
                    {e.conDiferencias && <span className="block text-sm text-error">con diferencias</span>}
                  </td>
                  <td>
                    {e.estado === "ANULADA" ? (
                      "—"
                    ) : e.documentosAlDia ? (
                      <Link href={`/entregas/${e.id}/documento/lista-entrega`} className="font-medium underline-offset-4 hover:underline">
                        🧾 Ver
                      </Link>
                    ) : e.version > 0 ? (
                      <span className="text-error">Hay que rehacerlo</span>
                    ) : (
                      "Sin hacer"
                    )}
                  </td>
                  {verVenta && <td className="text-right whitespace-nowrap">{e.total ? formatearMoneda(e.total) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </Tabla>
          {verVenta && <p className="text-texto-suave">Total del día (entregas con remito): {formatearMoneda(sumar(vigentes.map((e) => e.total ?? "0")))}</p>}
        </>
      )}
    </section>
  );
}
