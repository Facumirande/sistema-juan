import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { circuitosDeCompra } from "@/modulos/compras/circuitos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { EditorDeCircuitos } from "./editor";

export const metadata: Metadata = { title: "Circuitos de compra · Sistema Repartos" };

/**
 * P-52 Circuitos de compra (pedido del usuario, 12/10/2026: estar ordenado en la compra): se arma el
 * orden en que se recorren los puestos del mercado. Con un circuito elegido, la lista de compras se
 * acomoda sola en ese orden y dice qué puesto toca ahora (RN-201).
 */
export default async function PaginaCircuitos({ searchParams }: PageProps<"/lista-compra/circuitos">) {
  const sesion = await sesionParaPantalla("lista_compra.ver");
  const sp = await searchParams;
  const pedida = parametro(sp.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : "";
  const volver = fecha ? `/lista-compra?fecha=${fecha}` : "/lista-compra";
  const { circuitos, puestos } = await circuitosDeCompra(obtenerBaseDatos(), sesion.authUserId);

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <Encabezado titulo="Circuitos de compra" descripcion="El orden en que recorrés los puestos. La lista de compras se acomoda en ese orden." volver={{ ruta: volver, texto: "Lista de compras" }} />
      <EditorDeCircuitos circuitos={circuitos} puestos={puestos} puedeEditar={sesion.permisos.includes("lista_compra.editar")} fecha={fecha} volver={volver} />
    </section>
  );
}
