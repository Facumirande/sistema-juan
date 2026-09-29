import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { listarProductos, type ProductoListado } from "@/modulos/catalogo/productos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Dato, Grupo, TarjetaRegistro, VistaTarjetasOLista } from "@/ui/cuadricula";
import { UNIDADES_CORTAS } from "@/ui/etiquetas";
import { Aviso, Campo, Encabezado, Estado, Filtros, Selector, Tabla, clasesBoton } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Productos · Sistema Juan" };

const FRANJA: Readonly<Record<string, string>> = { VERDURA: "var(--etiqueta-verde)", FRUTA: "var(--etiqueta-naranja)", OTRO: "var(--etiqueta-gris)" };

function TarjetaProducto({ p }: { p: ProductoListado }) {
  const unidad = UNIDADES_CORTAS[p.unidadBase] ?? "";
  return (
    <TarjetaRegistro href={`/productos/${p.id}`} franja={FRANJA[p.grupo] ?? FRANJA.OTRO!} dibujo={dibujoDeProducto(p.nombre, p.grupo)} titulo={p.nombre} subtitulo={`${p.codigo} · se cuenta por ${unidad}`} inactivo={!p.activo}>
      <Dato icono="📦">{p.presentacionCompra ? `Se compra en ${p.presentacionCompra}` : "Sin envase de compra"}</Dato>
      {p.ofertas === 0 ? (
        <span className="flex items-center gap-2 font-semibold text-error">
          <span aria-hidden className="w-4 text-center">
            ⚠
          </span>
          Sin precio de compra
        </span>
      ) : (
        <Dato icono="💲">
          {p.mejorCosto ? `Desde ${formatearMoneda(p.mejorCosto)} el ${unidad}` : "Con precio"} · {p.ofertas === 1 ? "1 proveedor" : `${p.ofertas} proveedores`}
        </Dato>
      )}
      {p.proveedorPreferido && <Dato icono="★">Preferido: {p.proveedorPreferido}</Dato>}
    </TarjetaRegistro>
  );
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
    listarCategorias(db, sesion.authUserId),
  ]);
  const puedeEditar = sesion.permisos.includes("productos.editar");
  const grupos = new Map<string, ProductoListado[]>();
  for (const p of productos) grupos.set(p.categoria, [...(grupos.get(p.categoria) ?? []), p]);
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
        {puedeEditar && categorias.some((c) => c.activo) && (
          <Link href="/productos/nuevo" className={clasesBoton("principal")}>
            + Nuevo producto
          </Link>
        )}
        <Link href="/productos/categorias" className={clasesBoton("secundario")}>
          Categorías
        </Link>
        {sesion.permisos.includes("precios.ver_costos") && (
          <Link href="/precios/compra" className={clasesBoton("secundario")}>
            Precios de compra
          </Link>
        )}
      </Encabezado>

      {puedeEditar && !categorias.some((c) => c.activo) && (
        <Aviso>
          Para cargar productos primero creá al menos una categoría (ej. Verduras, Frutas) en{" "}
          <Link href="/productos/categorias" className="font-medium underline">
            Categorías
          </Link>
          .
        </Aviso>
      )}

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
        <p className="text-texto-suave">No hay productos {texto || categoriaId ? "con esos filtros" : "cargados todavía"}.</p>
      ) : vista === "tarjetas" ? (
        [...grupos.entries()].map(([categoria, lista]) => (
          <Grupo key={categoria} titulo={categoria} icono={dibujoDeProducto("", lista[0]!.grupo)} cantidad={lista.length}>
            {lista.map((p) => (
              <TarjetaProducto key={p.id} p={p} />
            ))}
          </Grupo>
        ))
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
                    <span aria-hidden>{dibujoDeProducto(p.nombre, p.grupo)}</span> {p.nombre}
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
