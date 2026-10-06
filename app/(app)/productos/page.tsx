import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { CATEGORIAS_PREELEGIDAS, preelegida } from "@/dominio/catalogo/categorias";
import { dibujoDeProducto, grupoDeProducto } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { listarProductos, type ProductoListado } from "@/modulos/catalogo/productos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { VistaTarjetasOLista } from "@/ui/cuadricula";
import { UNIDADES_CORTAS } from "@/ui/etiquetas";
import { Aviso, Campo, Encabezado, Estado, Filtros, Selector, Tabla, clasesBoton } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

import { TableroDeProductos, type GrupoDeProductos, type TarjetaDeProducto } from "./tablero-productos";

export const metadata: Metadata = { title: "Productos · Sistema Juan" };

const FRANJA: Readonly<Record<string, string>> = { VERDURA: "var(--etiqueta-verde)", FRUTA: "var(--etiqueta-naranja)", OTRO: "var(--etiqueta-gris)" };

/** Los datos de la tarjeta de un producto, ya escritos (la tarjeta se dibuja en el navegador para poder arrastrarla). */
function tarjetaDe(p: ProductoListado): TarjetaDeProducto {
  const unidad = UNIDADES_CORTAS[p.unidadBase] ?? "";
  const grupo = grupoDeProducto(p.nombre, p.grupo);
  const datos: TarjetaDeProducto["datos"] = [{ icono: "📦", texto: p.presentacionCompra ? `Se compra en ${p.presentacionCompra}` : "Sin envase de compra" }];
  if (p.ofertas === 0) datos.push({ icono: "⚠", texto: "Sin precio de compra", aviso: true });
  else datos.push({ icono: "💲", texto: `${p.mejorCosto ? `Desde ${formatearMoneda(p.mejorCosto)} el ${unidad}` : "Con precio"} · ${p.ofertas === 1 ? "1 proveedor" : `${p.ofertas} proveedores`}` });
  if (p.proveedorPreferido) datos.push({ icono: "★", texto: `Preferido: ${p.proveedorPreferido}` });
  return {
    id: p.id,
    nombre: p.nombre,
    dibujo: dibujoDeProducto(p.nombre, grupo),
    franja: FRANJA[grupo] ?? FRANJA.OTRO!,
    subtitulo: `${p.codigo} · se cuenta por ${unidad}`,
    datos,
    inactivo: !p.activo,
  };
}

/** P-10 Productos (08 §5.2): en tarjetas por categoría o en lista. */
export default async function PaginaProductos({ searchParams }: PageProps<"/productos">) {
  const sesion = await sesionParaPantalla("productos.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const categoriaId = parametro(filtros.categoria);
  const estado = estadoFiltro(filtros.estado);
  const vista = parametro(filtros.vista) === "lista" ? "lista" : "tarjetas";

  const db = obtenerBaseDatos();
  const [productos, categorias] = await Promise.all([
    listarProductos(db, sesion.authUserId, { texto, categoriaId, estado }),
    listarCategorias(db, sesion.authUserId, { soloConProductos: true }),
  ]);
  const puedeEditar = sesion.permisos.includes("productos.editar");
  // Una categoría se ve solo si tiene productos (RN-154): los grupos salen de los productos.
  const grupos = new Map<string, GrupoDeProductos>();
  for (const p of productos) {
    const g = grupos.get(p.categoriaId) ?? { categoriaId: p.categoriaId, nombre: p.categoria, icono: preelegida(p.categoria)?.icono ?? dibujoDeProducto("", p.grupo), productos: [] };
    g.productos.push(tarjetaDe(p));
    grupos.set(p.categoriaId, g);
  }
  const enlaceVista = (v: "tarjetas" | "lista") => {
    const q = new URLSearchParams();
    if (texto) q.set("texto", texto);
    if (categoriaId) q.set("categoria", categoriaId);
    if (estado !== "activos") q.set("estado", estado);
    if (v === "lista") q.set("vista", "lista");
    return `/productos${q.size ? `?${q.toString()}` : ""}`;
  };

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <Encabezado titulo="Productos" descripcion="Todo lo que se compra y se vende. Tocá un producto para ver qué puestos lo venden y a qué precio.">
        {puedeEditar && (
          <>
            <Link href="/productos/nuevo" className={clasesBoton("principal")}>
              ＋ Nuevo producto
            </Link>
            <Link href="/productos/cargar" className={clasesBoton("secundario")}>
              📥 Cargar desde una planilla
            </Link>
          </>
        )}
        <Link href="/productos/categorias" className={clasesBoton("secundario")}>
          Categorías
        </Link>
        {sesion.permisos.includes("precios.ver_costos") && (
          <Link href="/precios/compra" className={clasesBoton("secundario")}>
            Precios de compra
          </Link>
        )}
        {sesion.permisos.includes("precios.ver_margenes") && (
          <Link href="/precios/venta" className={clasesBoton("secundario")}>
            Precios de venta
          </Link>
        )}
      </Encabezado>


      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filtros>
          {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
          <Campo etiqueta="Buscar" name="texto" defaultValue={texto} placeholder="Nombre o código" />
          <Selector etiqueta="Categoría" name="categoria" opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} vacia="Todas" defaultValue={categoriaId} />
          <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
        </Filtros>
        <VistaTarjetasOLista vista={vista} enlace={enlaceVista} />
      </div>

      {productos.length === 0 ? (
        texto || categoriaId ? (
          <p className="text-texto-suave">No hay productos con esos filtros.</p>
        ) : (
          <Aviso>
            Todavía no hay productos. Cargalos de a uno con “＋ Nuevo producto” o todos juntos con la{" "}
            <Link href="/productos/cargar" className="font-medium underline">
              planilla de productos
            </Link>{" "}
            (alcanza con los nombres uno debajo del otro).
          </Aviso>
        )
      ) : vista === "tarjetas" ? (
        <TableroDeProductos grupos={[...grupos.values()]} preelegidas={CATEGORIAS_PREELEGIDAS.map(({ nombre, icono, ayuda }) => ({ nombre, icono, ayuda }))} puedeEditar={puedeEditar} />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th>Presentaciones</th>
              <th>Proveedores</th>
              <th>Preferido</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/productos/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                    <span aria-hidden>{dibujoDeProducto(p.nombre, grupoDeProducto(p.nombre, p.grupo))}</span> {p.nombre}
                  </Link>
                  <span className="block text-sm text-texto-suave">{p.codigo}</span>
                </td>
                <td>{p.categoria}</td>
                <td>{UNIDADES_CORTAS[p.unidadBase]}</td>
                <td>{p.presentaciones}</td>
                <td className={p.ofertas === 0 ? "text-error" : ""}>{p.ofertas === 0 ? "Sin precio" : p.ofertas}</td>
                <td>{p.proveedorPreferido ?? "—"}</td>
                <td>
                  <Estado activo={p.activo} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
