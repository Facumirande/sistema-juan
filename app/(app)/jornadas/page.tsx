import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarJornadas } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";

export const metadata: Metadata = { title: "Jornadas · Sistema Juan" };

/** P-45 Jornadas: cada día de entrega con sus pedidos. Se crean solas al cargar el primer pedido (RN-035). */
export default async function PaginaJornadas() {
  const sesion = await sesionParaPantalla("jornada.ver");
  const { jornadas, sugerida } = await listarJornadas(obtenerBaseDatos(), sesion.authUserId);
  const verVenta = sesion.permisos.includes("precios.ver_venta");

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado titulo="Jornadas" descripcion="Cada día de entrega: sus pedidos y, más adelante, la compra, la preparación y el reparto.">
        <Link href={`/pedidos?fecha=${sugerida}`} className={clasesBoton("principal")}>
          Pedidos de mañana
        </Link>
      </Encabezado>
      {jornadas.length === 0 ? (
        <p className="text-texto-suave">Todavía no hay jornadas: se crean solas al cargar el primer pedido de cada día.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Día</th>
              <th>Estado</th>
              <th>Pedidos</th>
              {verVenta && <th className="text-right">Total estimado</th>}
            </tr>
          </thead>
          <tbody>
            {jornadas.map((j) => (
              <tr key={j.id}>
                <td>
                  <Link href={`/pedidos?fecha=${j.fecha}`} className="font-medium capitalize underline-offset-4 hover:underline">
                    {fechaConDia(j.fecha)}
                  </Link>
                </td>
                <td>{ESTADOS_JORNADA[j.estado]}</td>
                <td>
                  {j.confirmados} confirmado(s)
                  {j.borradores > 0 && <span className="block text-sm text-texto-suave">{j.borradores} en borrador</span>}
                </td>
                {verVenta && <td className="text-right">{j.totalEstimado ? formatearMoneda(j.totalEstimado) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
