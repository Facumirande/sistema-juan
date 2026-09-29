import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { listarPedidos } from "@/modulos/pedidos/pedidos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_PEDIDO, fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Pedidos · Sistema Juan" };

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** P-40 Pedidos de un día de entrega (por defecto, el que se propone para cargar: mañana). */
export default async function PaginaPedidos({ searchParams }: PageProps<"/pedidos">) {
  const sesion = await sesionParaPantalla("pedidos.ver");
  const f = await searchParams;
  const pedida = parametro(f.fecha);
  const clienteElegido = parametro(f.cliente);
  const db = obtenerBaseDatos();
  const { pedidos, fecha } = await listarPedidos(db, sesion.authUserId, { fecha: pedida && PATRON_FECHA.test(pedida) ? pedida : undefined });
  const activos = pedidos.filter((p) => p.estado !== "CANCELADO");
  const total = sumar(activos.map((p) => p.totalEstimado ?? "0"));
  const verVenta = sesion.permisos.includes("precios.ver_venta");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Pedidos" descripcion="Los pedidos de un día, en forma de lista. Para mandarlos a la lista de compras o ver cómo avanzan, es más cómodo el tablero." />

      <nav aria-label="Día de entrega" className="flex flex-wrap items-center gap-2">
        <Link href={`/pedidos?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="fecha" defaultValue={fecha} className="h-11 rounded-lg border border-borde bg-superficie px-3" aria-label="Fecha de entrega" />
          <button type="submit" className={clasesBoton("secundario")}>
            Ver
          </button>
        </form>
        <Link href={`/pedidos?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
        <p className="text-lg font-semibold">Entrega del {fechaConDia(fecha)}</p>
      </nav>

      {sesion.permisos.includes("pedidos.crear") && (
        <Link href={`/pedidos/nuevo?fecha=${fecha}${clienteElegido ? `&cliente=${clienteElegido}` : ""}`} className={`${clasesBoton("principal")} self-start`}>
          ＋ Nuevo pedido
        </Link>
      )}

      {pedidos.length === 0 ? (
        <p className="text-texto-suave">No hay pedidos para este día.</p>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th>Estado</th>
                {verVenta && <th className="text-right">Total estimado</th>}
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className={p.estado === "CANCELADO" ? "opacity-60" : ""}>
                  <td>
                    <Link href={`/pedidos/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.numero}
                    </Link>
                  </td>
                  <td>
                    {p.cliente}
                    <span className="block text-sm text-texto-suave">{p.puntoEntrega}</span>
                  </td>
                  <td>{p.lineas}</td>
                  <td>
                    {ESTADOS_PEDIDO[p.estado]}
                    {p.esTardio && <span className="block text-sm text-texto-suave">tardío</span>}
                    {p.conAlertas && <span className="block text-sm text-error">⚠ revisar precios</span>}
                  </td>
                  {verVenta && <td className="text-right whitespace-nowrap">{p.totalEstimado ? formatearMoneda(p.totalEstimado) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </Tabla>
          <p className="text-texto-suave">
            {activos.length} pedido(s){verVenta && ` · total estimado ${formatearMoneda(total)}`}
          </p>
        </>
      )}
    </section>
  );
}
