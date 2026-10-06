import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { sumarDias } from "@/dominio/fechas/fechas";
import { viajeDelDia } from "@/modulos/entregas/viaje";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { ubicarSalidaAccion } from "./acciones";
import { paradasDelDia } from "./paradas";
import { PlanificadorDeViaje } from "./planificador";
import { MarcarUbicacion } from "./ubicacion";

export const metadata: Metadata = { title: "Viaje de entrega · Sistema Juan" };

/**
 * P-78b Viaje de entrega: las entregas del día que falta llevar, el mejor recorrido (eligiendo cuál
 * va primero si se quiere) y el GPS para ir. Con las que no están en un reparto se arma uno.
 */
export default async function PaginaViaje({ searchParams }: PageProps<"/viaje">) {
  const sesion = await sesionParaPantalla("repartos.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await jornadaEnCurso(db, sesion.authUserId);
  const { salida, paradas } = await viajeDelDia(db, sesion.authUserId, fecha);
  const sueltas = paradas.filter((p) => !p.repartoId);
  const enCamino = paradas.filter((p) => p.estado === "EN_REPARTO").sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  const repartos = [...new Map(paradas.filter((p) => p.repartoId).map((p) => [p.repartoId!, p.reparto!])).entries()];

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado titulo="Viaje de entrega" descripcion={`Las entregas del ${fechaConDia(fecha)} que faltan llevar. El sistema calcula el orden con menos kilómetros; tocá “Ir” para abrir el GPS en cada parada.`}>
        <Link href={`/inicio?fecha=${fecha}`} className={clasesBoton("secundario")}>
          Volver al tablero
        </Link>
      </Encabezado>
      <nav aria-label="Día" className="flex gap-2">
        <Link href={`/viaje?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/viaje?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>

      {sesion.permisos.includes("configuracion.editar") && (
        <details className="rounded-lg border border-borde bg-superficie p-4" open={!salida.coordenada}>
          <summary className="cursor-pointer font-semibold">🏁 De dónde salen los repartos {salida.coordenada ? `· ${salida.direccion ?? "marcado"}` : "· sin marcar"}</summary>
          <div className="mt-3">
            <MarcarUbicacion accion={ubicarSalidaAccion} campos={{}} actual={salida.coordenada} direccion={salida.direccion ?? ""} titulo="Punto de salida" />
          </div>
        </details>
      )}

      {enCamino.length > 0 && (
        <Tarjeta titulo="🚚 En camino">
          <p className="text-texto-suave">Al dejar cada pedido, tocá Entregar y anotá quién lo recibió (y si faltó o devolvieron algo).</p>
          <ul className="flex flex-col gap-2">
            {enCamino.map((p) => (
              <li key={p.entregaId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde p-3">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {p.orden ? `${p.orden}. ` : ""}
                    {p.cliente}
                  </span>
                  <span className="block text-sm text-texto-suave">
                    {p.direccion}
                    {p.horario && ` · recibe ${p.horario}`}
                  </span>
                </span>
                {sesion.permisos.includes("entregas.confirmar") && (
                  <Link href={`/repartos/mios/entrega/${p.entregaId}?volver=${encodeURIComponent(`/viaje?fecha=${fecha}`)}`} className={clasesBoton("principal")}>
                    ✅ Entregar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {repartos.length > 0 && (
        <Tarjeta titulo="Repartos armados">
          <ul className="flex flex-col gap-2">
            {repartos.map(([id, numero]) => (
              <li key={id}>
                <Link href={`/repartos/${id}#recorrido`} className="flex min-h-11 items-center justify-between rounded-lg border border-borde px-3 font-medium hover:border-marca">
                  {numero} · {paradas.filter((p) => p.repartoId === id).length} paradas
                  <span>Ver el recorrido →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {sueltas.length === 0 ? (
        paradas.length === 0 && <p className="text-texto-suave">No hay entregas para llevar este día: se arman al empezar a preparar.</p>
      ) : (
        <Tarjeta titulo={repartos.length ? "Entregas sin reparto" : "Entregas para llevar"}>
          <PlanificadorDeViaje paradas={paradasDelDia(sueltas)} salida={salida} guardar={sesion.permisos.includes("repartos.gestionar") ? { tipo: "armar", fecha } : null} />
        </Tarjeta>
      )}
    </section>
  );
}
