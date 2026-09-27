import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { listarProductos } from "@/modulos/catalogo/productos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { UNIDADES, UNIDADES_CORTAS, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Aviso, Campo, CampoNumero, Casilla, Desplegable, Encabezado, Estado, Filtros, Selector, Tabla, clasesBoton } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

import { crearProductoAccion } from "./acciones";

export const metadata: Metadata = { title: "Productos · Sistema Juan" };

/** P-10 Productos (08 §5.2). */
export default async function PaginaProductos({ searchParams }: PageProps<"/productos">) {
  const sesion = await sesionParaPantalla("productos.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const categoriaId = parametro(filtros.categoria);
  const estado = estadoFiltro(filtros.estado);

  const db = obtenerBaseDatos();
  const [productos, categorias] = await Promise.all([
    listarProductos(db, sesion.authUserId, { texto, categoriaId, estado }),
    listarCategorias(db, sesion.authUserId),
  ]);
  const categoriasActivas = categorias.filter((c) => c.activo);
  const opcionesCategoria = categoriasActivas.map((c) => ({ valor: c.id, etiqueta: c.nombre }));
  const puedeEditar = sesion.permisos.includes("productos.editar");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Productos" descripcion="Todo lo que se compra y se vende. Los cálculos internos se hacen en la unidad base de cada producto.">
        <Link href="/productos/categorias" className={clasesBoton("secundario")}>
          Categorías
        </Link>
        {sesion.permisos.includes("precios.ver_costos") && (
          <Link href="/precios/compra" className={clasesBoton("secundario")}>
            Precios de compra
          </Link>
        )}
      </Encabezado>

      {puedeEditar &&
        (categoriasActivas.length === 0 ? (
          <Aviso>
            Para cargar productos primero creá al menos una categoría (ej. Verduras, Frutas) en{" "}
            <Link href="/productos/categorias" className="font-medium underline">
              Categorías
            </Link>
            .
          </Aviso>
        ) : (
          <Desplegable titulo="+ Nuevo producto" abierto={productos.length === 0 && !texto}>
            <FormularioAccion accion={crearProductoAccion} boton="Crear producto">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Código" name="codigo" placeholder="Ej. TOM-R" autoCapitalize="characters" required />
                <Campo etiqueta="Nombre" name="nombre" placeholder="Ej. Tomate redondo" required />
                <Selector etiqueta="Categoría" name="categoriaId" opciones={opcionesCategoria} />
                <Selector
                  etiqueta="Unidad base"
                  name="unidadBase"
                  opciones={opciones(UNIDADES)}
                  defaultValue="KG"
                  ayuda="En qué se cuentan los pedidos y el stock. Después no se puede cambiar."
                />
                <Campo etiqueta="Nombre corto (opcional)" name="nombreCorto" placeholder="Para el celular" />
              </div>
              <Casilla etiqueta="Admite fracción" name="admiteFraccion" defaultChecked ayuda="Destildalo si solo se vende entero (ej. lechuga por unidad)." />
              <fieldset className="grid gap-4 rounded-lg border border-borde p-3 sm:grid-cols-2">
                <legend className="px-1 font-medium">Presentación de compra (opcional)</legend>
                <Campo etiqueta="Nombre" name="presentacionCompraNombre" placeholder="Ej. Cajón 18 kg" />
                <CampoNumero etiqueta="Cuántas unidades base trae" name="presentacionCompraFactor" placeholder="Ej. 18" />
              </fieldset>
              <AreaTexto etiqueta="Observaciones (opcional)" name="observaciones" />
            </FormularioAccion>
          </Desplegable>
        ))}

      <Filtros>
        <Campo etiqueta="Buscar" name="texto" defaultValue={texto} placeholder="Nombre o código" />
        <Selector etiqueta="Categoría" name="categoria" opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} vacia="Todas" defaultValue={categoriaId} />
        <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
      </Filtros>

      {productos.length === 0 ? (
        <p className="text-texto-suave">No hay productos {texto || categoriaId ? "con esos filtros" : "cargados todavía"}.</p>
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
                    {p.nombre}
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
