import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { listarRepartos, repartidoresDisponibles } from "@/modulos/entregas/repartos";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_REPARTO, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { crearRepartoAccion } from "./acciones";

export const metadata: Metadata = { title: "Repartos · Sistema Juan" };

/** P-75 Repartos del día. */
export default async function PaginaRepartos({ searchParams }: PageProps<"/repartos">) {
  const sesion = await sesionParaPantalla("repartos.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await jornadaEnCurso(db, sesion.authUserId);
  const { jornadaEstado, repartos, sinReparto } = await listarRepartos(db, sesion.authUserId, fecha);
  const puedeGestionar = sesion.permisos.includes("repartos.gestionar");
  const repartidores = puedeGestionar ? await repartidoresDisponibles(db, sesion.authUserId) : [];
  const hora = (d: Date | null) => (d ? formatearFechaHora(d, sesion.zonaHoraria).slice(11) : "—");

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado titulo="Repartos" descripcion={`Entrega del ${fechaConDia(fecha)}.`}>
        <Link href={`/entregas?fecha=${fecha}`} className={clasesBoton("secundario")}>
          Entregas
        </Link>
      </Encabezado>
      <nav aria-label="Día" className="flex gap-2">
        <Link href={`/repartos?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/repartos?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>
      {!jornadaEstado ? (
        <p className="text-texto-suave">No hay pedidos para este día.</p>
      ) : (
        <>
          {sinReparto > 0 && <p className="font-semibold">{sinReparto === 1 ? "Hay 1 entrega sin reparto." : `Hay ${sinReparto} entregas sin reparto.`}</p>}
          {repartos.length > 0 && (
            <Tabla>
              <thead>
                <tr>
                  <th>Reparto</th>
                  <th>Quién</th>
                  <th>Paradas</th>
                  <th>Salida</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {repartos.map((r) => (
                  <tr key={r.id} className={r.estado === "ANULADO" ? "opacity-60" : ""}>
                    <td>
                      <Link href={`/repartos/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                        {r.numero}
                      </Link>
                      {r.vehiculo && <span className="block text-sm text-texto-suave">{r.vehiculo}</span>}
                    </td>
                    <td>{r.repartidor ?? "—"}</td>
                    <td>
                      {r.entregadas}/{r.paradas}
                      {r.bultos > 0 && <span className="block text-sm text-texto-suave">{r.bultos} bultos</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.salida ? hora(r.salida) : `prevista ${hora(r.salidaPrevista)}`}
                      {r.regreso && <span className="block text-sm text-texto-suave">volvió {hora(r.regreso)}</span>}
                    </td>
                    <td>{ESTADOS_REPARTO[r.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {puedeGestionar && jornadaEstado !== "CERRADA" && (
            <Tarjeta titulo="Nuevo reparto">
              <FormularioAccion accion={crearRepartoAccion} boton="Crear reparto">
                <input type="hidden" name="fecha" value={fecha} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Selector etiqueta="Quién lo hace" name="repartidorId" opciones={repartidores.map((u) => ({ valor: u.id, etiqueta: u.nombre }))} vacia="—" />
                  <Campo etiqueta="Vehículo (opcional)" name="vehiculo" placeholder="Ej. camioneta AB123CD" />
                  <Campo etiqueta="Salida prevista" name="salida" type="time" />
                </div>
              </FormularioAccion>
            </Tarjeta>
          )}
        </>
      )}
    </section>
  );
}
