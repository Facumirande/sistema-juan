import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { obtenerReparto } from "@/modulos/entregas/repartos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { fechaConDia } from "@/ui/etiquetas";

export const metadata: Metadata = { title: "DOC-04 Hoja de ruta · Sistema Juan" };

/** DOC-04 Hoja de ruta de reparto (09): paradas en orden, sin precios (RN-124). */
export default async function HojaDeRuta({ params }: PageProps<"/repartos/[id]/imprimir">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_entrega");
  const r = await cargarFicha(obtenerReparto(obtenerBaseDatos(), sesion.authUserId, idDeRuta((await params).id)));
  const bultos = r.paradas.reduce((s, p) => s + (p.bultos ?? 0), 0);
  const hora = (d: Date | null) => (d ? formatearFechaHora(d, sesion.zonaHoraria).slice(11) : "—");

  return (
    <article className="mx-auto flex max-w-5xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={r.esMio && !sesion.permisos.includes("repartos.ver") ? "/repartos/mios" : `/repartos/${r.id}`} className="text-texto-suave hover:underline">
          ← Reparto
        </Link>
        <BotonImprimir />
      </div>
      <header className="flex flex-col gap-1 border-b-2 border-texto pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">HOJA DE RUTA</h1>
          <p className="font-semibold">N° {r.numero}</p>
        </div>
        <p>
          Entrega del {fechaConDia(r.fecha)} · {r.repartidor ?? "sin repartidor"}
          {r.vehiculo && ` · ${r.vehiculo}`} · salida prevista {hora(r.salidaPrevista)} · paradas: {r.paradas.length} · bultos: {bultos}
        </p>
      </header>
      <table className="w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1.5 [&_td]:align-top [&_th]:border-b [&_th]:border-texto [&_th]:px-1">
        <thead>
          <tr>
            <th>Ord.</th>
            <th>Cliente / punto</th>
            <th>Dirección</th>
            <th>Recibe</th>
            <th>Contacto</th>
            <th>Bultos</th>
            <th>Entrega</th>
            <th className="w-20">Llegada</th>
            <th className="w-28">Recibió</th>
          </tr>
        </thead>
        <tbody>
          {r.paradas.map((p, i) => (
            <tr key={p.id} className="break-inside-avoid">
              <td>{i + 1}</td>
              <td>
                <b>{p.cliente}</b>
                <span className="block">{p.punto}</span>
              </td>
              <td>
                {p.direccion}
                {p.localidad && `, ${p.localidad}`}
                {(p.referencias || p.instrucciones) && <span className="block text-xs">↳ {[p.referencias, p.instrucciones].filter(Boolean).join(" · ")}</span>}
              </td>
              <td className="whitespace-nowrap">{p.horario ?? ""}</td>
              <td>
                {p.contacto}
                {p.telefono && <span className="block whitespace-nowrap">{p.telefono}</span>}
              </td>
              <td>{p.bultos ?? ""}</td>
              <td className="whitespace-nowrap">
                {p.numero} v{p.version}
              </td>
              <td className="border-texto!" />
              <td className="border-texto!" />
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="border-t border-texto pt-2 text-sm">
        Documento sin valores. Devolver al finalizar el reparto con los duplicados firmados. · Impreso {formatearFechaHora(new Date(), sesion.zonaHoraria)} por {sesion.nombre}
      </footer>
    </article>
  );
}
