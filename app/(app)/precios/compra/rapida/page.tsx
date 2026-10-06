import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { haceDias } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Casilla, Encabezado } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { actualizacionRapidaAccion } from "../acciones";

export const metadata: Metadata = { title: "Actualizar precios · Sistema Repartos" };

/** P-26 Actualización rápida en el puesto, pensada para el celular (08 §5.5). */
export default async function ActualizacionRapida({ searchParams }: PageProps<"/precios/compra/rapida">) {
  const sesion = await sesionParaPantalla("precios.editar_compra");
  const proveedorId = parametro((await searchParams).proveedor);
  const { ofertas } = await listaGeneralPreciosCompra(obtenerBaseDatos(), sesion.authUserId);

  if (!proveedorId || !ofertas.some((o) => o.proveedorId === proveedorId)) {
    const proveedores = [...new Map(ofertas.map((o) => [o.proveedorId, { id: o.proveedorId, nombre: o.proveedor, ubicacion: o.ubicacionMercado }])).values()].sort(
      (a, b) => (a.ubicacion ?? a.nombre).localeCompare(b.ubicacion ?? b.nombre, "es", { numeric: true }),
    );
    return (
      <section className="flex max-w-md flex-col gap-4">
        <Encabezado titulo="Actualizar precios" volver={{ ruta: "/precios/compra", texto: "Precios de compra" }} descripcion="Elegí el puesto donde estás." />
        {proveedores.length === 0 && <p className="text-texto-suave">Todavía no hay precios cargados.</p>}
        <ul className="flex flex-col gap-2">
          {proveedores.map((p) => (
            <li key={p.id}>
              <Link
                href={`/precios/compra/rapida?proveedor=${p.id}`}
                className="flex min-h-14 flex-col justify-center rounded-lg border border-borde bg-superficie px-4 py-2 font-semibold"
              >
                {p.nombre}
                {p.ubicacion && <span className="text-sm font-normal text-texto-suave">{p.ubicacion}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const propias = ofertas.filter((o) => o.proveedorId === proveedorId);
  const proveedor = propias[0]!;

  return (
    <section className="flex max-w-md flex-col gap-4">
      <Encabezado
        titulo={proveedor.proveedor}
        volver={{ ruta: "/precios/compra/rapida", texto: "Otro puesto" }}
        descripcion="Escribí solo los precios que cambiaron. Los que dejes vacíos siguen igual."
      />
      <FormularioAccion accion={actualizacionRapidaAccion} boton="Guardar">
        <input type="hidden" name="proveedorId" value={proveedorId} />
        <ul className="flex flex-col gap-3">
          {propias.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3">
              <input type="hidden" name="ofertaId" value={o.id} />
              <p className="font-semibold">
                {o.producto} · <span className="font-normal">{o.presentacion}</span>
              </p>
              <p className="text-texto-suave">
                Actual <b className="text-texto">{formatearMoneda(o.precioVigente)}</b> ·{" "}
                <span className={o.desactualizada ? "font-semibold text-error" : ""}>{haceDias(o.diasSinActualizar)}</span>
                {!o.disponible && <span className="text-error"> · no había</span>}
              </p>
              <input
                name={`precio_${o.id}`}
                inputMode="decimal"
                autoComplete="off"
                aria-label={`Precio nuevo de ${o.producto}, ${o.presentacion}`}
                placeholder="Precio nuevo"
                className="h-14 rounded-lg border border-borde bg-superficie px-3 text-xl"
              />
              <Casilla etiqueta="No hay hoy" name={`nohay_${o.id}`} />
            </li>
          ))}
        </ul>
        <Casilla
          etiqueta="Confirmar los que dejé vacíos"
          name="confirmarResto"
          defaultChecked
          ayuda="Quedan como actualizados hoy, con el mismo precio."
        />
      </FormularioAccion>
    </section>
  );
}
