import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { panelDeJornada } from "@/modulos/entregas/panel";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Encabezado, clasesBoton } from "@/ui/formularios";

import { iniciarPreparacionAccion } from "../../preparacion/acciones";

export const metadata: Metadata = { title: "Jornada · Sistema Juan" };

const PASOS = ["ABIERTA", "COMPRANDO", "PREPARANDO", "REPARTIENDO", "CERRADA"] as const;
const suma = (o: Record<string, number>, ...claves: string[]) => claves.reduce((s, k) => s + (o[k] ?? 0), 0);

function Bloque({ titulo, ruta, texto, children }: { titulo: string; ruta: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="flex-1 text-texto-suave">{children}</div>
      <Link href={ruta} className={clasesBoton("secundario")}>
        {texto}
      </Link>
    </div>
  );
}

/** P-46 Panel de la jornada: en qué paso está el día y el avance de cada etapa. */
export default async function PanelJornada({ params }: PageProps<"/jornadas/[fecha]">) {
  const sesion = await sesionParaPantalla("jornada.ver");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const p = await panelDeJornada(obtenerBaseDatos(), sesion.authUserId, fecha);
  const actual = p.estado ? PASOS.indexOf(p.estado as (typeof PASOS)[number]) : -1;
  const horaDe: Record<string, Date | null> = { COMPRANDO: p.pasos.compra, PREPARANDO: p.pasos.preparacion, REPARTIENDO: p.pasos.reparto, CERRADA: p.pasos.cierre };
  const pedidosVivos = suma(p.pedidos, "CONFIRMADO", "EN_COMPRA", "EN_PREPARACION", "PREPARADO", "EN_REPARTO", "ENTREGADO");
  const entregasTotal = Object.values(p.entregas).reduce((s, n) => s + n, 0);
  const puedePreparar = sesion.permisos.includes("preparacion.registrar") && p.estado !== null && p.estado !== "CERRADA" && pedidosVivos > 0;

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado titulo={`Jornada del ${fechaConDia(fecha)}`} volver={{ ruta: "/jornadas", texto: "Jornadas" }} />
      <nav aria-label="Día" className="flex gap-2">
        <Link href={`/jornadas/${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/jornadas/${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>
      {p.estado === null ? (
        <p className="text-texto-suave">Todavía no hay pedidos para este día.</p>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2" aria-label="Pasos de la jornada">
            {PASOS.map((paso, i) => (
              <li key={paso} className={`rounded-full border px-3 py-1 text-sm ${i === actual ? "border-marca bg-marca font-semibold text-marca-texto" : i < actual ? "border-marca text-marca" : "border-borde text-texto-suave"}`}>
                {i < actual ? "✔ " : ""}
                {ESTADOS_JORNADA[paso]}
                {horaDe[paso] && ` ${formatearFechaHora(horaDe[paso]!, sesion.zonaHoraria).slice(0, 5)} ${formatearFechaHora(horaDe[paso]!, sesion.zonaHoraria).slice(11)}`}
              </li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <Bloque titulo="Pedidos" ruta={`/pedidos?fecha=${fecha}`} texto="Ver pedidos">
              {pedidosVivos} confirmados
              {(p.pedidos.BORRADOR ?? 0) > 0 && ` · ${p.pedidos.BORRADOR} en borrador`}
              {(p.pedidos.CANCELADO ?? 0) > 0 && ` · ${p.pedidos.CANCELADO} cancelados`}
            </Bloque>
            <Bloque titulo="Compra" ruta={`/lista-compra?fecha=${fecha}`} texto="Lista de compra">
              {p.lista.armada ? `${p.lista.compradas} de ${p.lista.lineas} productos resueltos` : "Lista sin armar"}
              {p.lista.desactualizada && " · hay cambios para actualizar"}
              {` · ${p.compras} ${p.compras === 1 ? "compra" : "compras"}`}
            </Bloque>
            <Bloque titulo="Preparación" ruta={`/preparacion/${fecha}`} texto="Ir a preparación">
              {entregasTotal === 0
                ? "Sin empezar"
                : `${suma(p.entregas, "PREPARADA", "EN_REPARTO", "ENTREGADA")} de ${entregasTotal} entregas preparadas`}
              {puedePreparar && entregasTotal === 0 && (
                <FormularioAccion accion={iniciarPreparacionAccion} boton="Iniciar preparación" className="pt-2">
                  <input type="hidden" name="fecha" value={fecha} />
                </FormularioAccion>
              )}
            </Bloque>
            <Bloque titulo="Reparto y entregas" ruta={`/repartos?fecha=${fecha}`} texto="Ver repartos">
              {suma(p.repartos, "PLANIFICADO", "EN_CURSO", "FINALIZADO")} repartos · {p.entregas.ENTREGADA ?? 0} de {entregasTotal} entregadas
            </Bloque>
          </div>
        </>
      )}
    </section>
  );
}
