import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { obtenerProducto, recargosParaAlta } from "@/modulos/catalogo/productos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { Encabezado } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { FormularioProducto } from "../../nuevo/formulario";

export const metadata: Metadata = { title: "Editar producto · Sistema Repartos" };

/**
 * Editar un producto con las mismas herramientas con que se lo crea (pedido del usuario,
 * 11/10/2026): las tres preguntas, el dibujo para elegir y la tarjeta de cómo va a quedar. Se llega
 * con el lápiz de su tarjeta en Productos o desde su ficha.
 */
export default async function EditarProducto({ params, searchParams }: PageProps<"/productos/[id]/editar">) {
  const sesion = await sesionParaPantalla("productos.editar");
  const id = idDeRuta((await params).id);
  const volver = parametro((await searchParams).volver) === "ficha" ? "ficha" : "lista";
  const db = obtenerBaseDatos();
  const [p, categorias, recargos] = await Promise.all([cargarFicha(obtenerProducto(db, sesion.authUserId, id)), listarCategorias(db, sesion.authUserId), recargosParaAlta(db, sesion.authUserId)]);
  // Las categorías que se usan (tienen productos) y, siempre, la del producto.
  const activas = categorias.filter((c) => c.productosActivos > 0 || c.id === p.categoriaId).map((c) => ({ id: c.id, nombre: c.nombre, grupo: c.grupo }));
  const verRecargos = sesion.permisos.includes("precios.editar_reglas") && sesion.permisos.includes("precios.ver_margenes");
  const vigentes = p.presentaciones.filter((pr) => pr.activo);

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo={`Editar ${p.nombre}`}
        volver={volver === "ficha" ? { ruta: `/productos/${p.id}`, texto: p.nombre } : { ruta: "/productos", texto: "Productos" }}
        descripcion="Las mismas preguntas que al crearlo, con lo que ya tiene cargado. Cambiá lo que haga falta y guardá."
      />
      <FormularioProducto
        categorias={activas}
        // Su propio código no cuenta como "ya usado".
        codigos={recargos.codigos.filter((c) => c.toUpperCase() !== p.codigo.toUpperCase())}
        recargoGlobal={String(Number(recargos.global))}
        recargoPorCategoria={Object.fromEntries(Object.entries(recargos.porCategoria).map(([k, v]) => [k, v ? String(Number(v)) : null]))}
        verRecargos={verRecargos}
        producto={{
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          categoriaId: p.categoriaId,
          unidadBase: p.unidadBase,
          unidadEditable: p.unidadBaseEditable,
          admiteFraccion: p.admiteFraccion,
          recargo: p.ganancia.propia === null ? "" : String(Number(p.ganancia.propia)).replace(".", ","),
          observaciones: p.observaciones ?? "",
          nombreCorto: p.nombreCorto ?? "",
          dibujo: p.dibujo,
          envasesDeCompra: vigentes.filter((pr) => pr.usableEnCompra && !pr.esUnidadBase).map((pr) => ({ id: pr.id, nombre: pr.nombre })),
          // El envase "de la unidad" (kilo, unidad…) es comprarlo suelto.
          envaseDeCompraId: vigentes.some((pr) => pr.id === p.presentacionCompraDefaultId && !pr.esUnidadBase) ? p.presentacionCompraDefaultId : null,
          envasesDeVenta: vigentes.filter((pr) => pr.usableEnVenta).map((pr) => ({ id: pr.id, nombre: pr.nombre })),
          envaseDeVentaId: p.presentacionVentaDefaultId,
          volver,
        }}
      />
    </section>
  );
}
