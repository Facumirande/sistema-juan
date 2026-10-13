import type { Metadata } from "next";
import { cookies } from "next/headers";

import { obtenerBaseDatos } from "@/db/cliente";
import { COOKIE_CIRCUITO, SIN_CIRCUITO } from "@/dominio/compras/circuitos";
import { formatearCantidad, type UnidadMedida } from "@/dominio/dinero/formato";
import { obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { diasParaElegir } from "@/modulos/jornadas/dia";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { diaElegido } from "@/ui/dia-elegido";
import Link from "@/ui/enlace";
import { FechaGrande } from "@/ui/fecha-grande";
import { Encabezado, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SelectorDeDia } from "@/ui/selector-de-dia";

import { Planificador } from "./planificador";

export const metadata: Metadata = { title: "Recorrido de compra · Sistema Repartos" };

/**
 * P-53 Recorrido de compra (pedido del usuario, 12/10/2026: hacer más visible lo de los recorridos y
 * poder preseleccionar grupos para después acomodar y comprar). Es la lista de compras del día vista
 * como un recorrido: una parada por puesto con sus productos. Se eligen productos y se los manda a su
 * puesto, se acomoda el orden de las paradas y se va a comprar (RN-203).
 */
export default async function PaginaRecorrido({ searchParams }: PageProps<"/lista-compra/recorrido">) {
  const sesion = await sesionParaPantalla("lista_compra.ver");
  const db = obtenerBaseDatos();
  const sp = await searchParams;
  const pedida = parametro(sp.fecha) ?? (await diaElegido());
  const { fecha, hoy, dias } = await diasParaElegir(db, sesion.authUserId, pedida);
  const lista = await obtenerListaCompra(db, sesion.authUserId, fecha, { paraComprar: true });
  const cerrado = lista?.estadoJornada === "CERRADA";
  const guardado = (await cookies()).get(COOKIE_CIRCUITO)?.value ?? null;
  const lineas = lista ? lista.plan.flatMap((p) => p.lineas) : [];

  return (
    <section className="flex max-w-5xl flex-col gap-4">
      <Encabezado titulo="Recorrido de compra" descripcion="Cada puesto con lo que le vas a comprar, en el orden en que los recorrés." />
      <FechaGrande fecha={fecha} hoy={hoy} />
      <SelectorDeDia dias={dias} fecha={fecha} hoy={hoy} ruta="/lista-compra/recorrido?fecha={fecha}" />
      {!lista ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <p className="text-lg font-semibold">Todavía no hay lista de compras para este día</p>
          <p className="text-texto-suave">El recorrido se arma con la lista: primero mandá los pedidos a la lista de compras.</p>
          <div>
            <Link href={`/lista-compra?fecha=${fecha}`} className={clasesBoton("principal")}>
              Ir a la lista de compras →
            </Link>
          </div>
        </div>
      ) : (
        <Planificador
          fecha={fecha}
          renglones={lineas.map((l) => ({
            id: l.id,
            producto: l.producto,
            cantidad: formatearCantidad(l.necesidadBase, l.unidadBase as UnidadMedida),
            puestoId: l.proveedorId,
            puestoNombre: l.proveedor,
            puestoUbicacion: l.ubicacion,
            hecho: l.estado === "COMPRADO" || l.estado === "NO_CONSEGUIDO",
          }))}
          proveedores={lista.proveedores}
          circuitos={lista.circuitos}
          circuitoInicial={guardado === SIN_CIRCUITO ? "" : guardado}
          puedeEditar={sesion.permisos.includes("lista_compra.editar") && !cerrado}
        />
      )}
    </section>
  );
}
