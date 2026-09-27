import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearNumero } from "@/dominio/dinero/formato";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { obtenerProducto } from "@/modulos/catalogo/productos";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { UNIDADES, UNIDADES_CORTAS, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Campo, CampoNumero, Casilla, Encabezado, Estado, Selector, Tabla, Tarjeta } from "@/ui/formularios";

import { crearOfertaAccion } from "../../precios/compra/acciones";
import { TablaOfertas, permisosOfertas } from "../../precios/compra/tabla-ofertas";
import {
  agregarPresentacionAccion,
  cambiarEstadoPresentacionAccion,
  cambiarEstadoProductoAccion,
  editarPresentacionAccion,
  editarProductoAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Producto · Sistema Juan" };

/** P-11 Ficha de producto: datos, presentaciones y proveedores con sus precios (08 §5.2). */
export default async function FichaDeProducto({ params }: PageProps<"/productos/[id]">) {
  const sesion = await sesionParaPantalla("productos.ver");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const p = await cargarFicha(obtenerProducto(db, sesion.authUserId, id));

  const puedeEditar = sesion.permisos.includes("productos.editar");
  const verCostos = sesion.permisos.includes("precios.ver_costos");
  const puedeCrearOferta = sesion.permisos.includes("proveedores.editar") && sesion.permisos.includes("precios.editar_compra");
  const [categorias, ofertas, proveedores] = await Promise.all([
    puedeEditar ? listarCategorias(db, sesion.authUserId) : Promise.resolve([]),
    verCostos ? listaGeneralPreciosCompra(db, sesion.authUserId, { productoId: id }).then((r) => r.ofertas) : Promise.resolve([]),
    puedeCrearOferta ? listarProveedores(db, sesion.authUserId) : Promise.resolve([]),
  ]);

  const unidad = UNIDADES_CORTAS[p.unidadBase] ?? "";
  const activas = p.presentaciones.filter((pr) => pr.activo);
  const deCompra = activas.filter((pr) => pr.usableEnCompra).map((pr) => ({ valor: pr.id, etiqueta: pr.nombre }));
  const deVenta = activas.filter((pr) => pr.usableEnVenta).map((pr) => ({ valor: pr.id, etiqueta: pr.nombre }));

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo={p.nombre} volver={{ ruta: "/productos", texto: "Productos" }} descripcion={`${p.codigo} · ${p.categoria} · se cuenta en ${UNIDADES[p.unidadBase]?.toLowerCase()}`}>
        <Estado activo={p.activo} />
      </Encabezado>

      {verCostos && (
        <Tarjeta titulo="Proveedores y precios de compra">
          {ofertas.length === 0 ? (
            <p className="text-texto-suave">Ningún proveedor tiene precio para este producto todavía.</p>
          ) : (
            <TablaOfertas ofertas={ofertas} mostrar="proveedor" permisos={permisosOfertas(sesion.permisos)} />
          )}
          {p.proveedorPreferido && <p className="text-texto-suave">★ Proveedor preferido: {p.proveedorPreferido}</p>}
          {puedeCrearOferta && p.activo && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">+ Agregar un proveedor</summary>
              {deCompra.length === 0 ? (
                <p className="text-texto-suave">Primero agregá una presentación de compra (ej. Cajón 18 kg).</p>
              ) : (
                <FormularioAccion accion={crearOfertaAccion} boton="Agregar oferta">
                  <input type="hidden" name="productoId" value={p.id} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Selector etiqueta="Proveedor" name="proveedorId" opciones={proveedores.map((pv) => ({ valor: pv.id, etiqueta: pv.nombre }))} />
                    <Selector etiqueta="Presentación" name="presentacionId" opciones={deCompra} defaultValue={p.presentacionCompraDefaultId ?? undefined} />
                    <CampoNumero etiqueta="Precio de la presentación" name="precio" placeholder="Ej. 21.600" />
                  </div>
                </FormularioAccion>
              )}
            </details>
          )}
        </Tarjeta>
      )}

      <Tarjeta titulo="Presentaciones">
        <p className="text-texto-suave">Cómo se compra o se vende. El factor es cuántos {unidad} trae cada una.</p>
        <Tabla>
          <thead>
            <tr>
              <th>Presentación</th>
              <th>Trae</th>
              <th>Uso</th>
              <th>Estado</th>
              {puedeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {p.presentaciones.map((pr) => (
              <tr key={pr.id}>
                <td className="font-medium">
                  {pr.nombre}
                  {pr.esUnidadBase && <span className="block text-sm font-normal text-texto-suave">unidad base</span>}
                </td>
                <td>
                  {formatearNumero(pr.factorABase, { decimales: 3, recortarCeros: true })} {unidad}
                </td>
                <td>{[pr.usableEnCompra && "compra", pr.usableEnVenta && "venta"].filter(Boolean).join(" y ")}</td>
                <td>
                  <Estado activo={pr.activo} />
                </td>
                {puedeEditar && (
                  <td>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Editar</summary>
                      <div className="flex flex-col gap-3 py-2">
                        <FormularioAccion accion={editarPresentacionAccion} boton="Guardar" variante="secundario">
                          <input type="hidden" name="id" value={pr.id} />
                          <Campo etiqueta="Nombre" name="nombre" defaultValue={pr.nombre} />
                          <CampoNumero
                            etiqueta={`Cuántos ${unidad} trae`}
                            name="factorABase"
                            defaultValue={formatearNumero(pr.factorABase, { decimales: 3, recortarCeros: true })}
                            readOnly={pr.enUso || pr.esUnidadBase}
                            ayuda={pr.enUso ? "Ya tiene precios cargados: para otro tamaño creá una presentación nueva." : undefined}
                          />
                          <Casilla etiqueta="Se usa para comprar" name="usableEnCompra" defaultChecked={pr.usableEnCompra} />
                          <Casilla etiqueta="Se usa para vender" name="usableEnVenta" defaultChecked={pr.usableEnVenta} />
                        </FormularioAccion>
                        {!pr.esUnidadBase && (
                          <FormularioAccion
                            accion={cambiarEstadoPresentacionAccion}
                            boton={pr.activo ? "Desactivar" : "Reactivar"}
                            variante={pr.activo ? "peligro" : "secundario"}
                          >
                            <input type="hidden" name="id" value={pr.id} />
                            <input type="hidden" name="activo" value={String(!pr.activo)} />
                          </FormularioAccion>
                        )}
                      </div>
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
        {puedeEditar && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">+ Agregar presentación</summary>
            <FormularioAccion accion={agregarPresentacionAccion} boton="Agregar">
              <input type="hidden" name="productoId" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Nombre" name="nombre" placeholder="Ej. Bolsa 20 kg" />
                <CampoNumero etiqueta={`Cuántos ${unidad} trae`} name="factorABase" placeholder="Ej. 20" />
              </div>
              <Casilla etiqueta="Se usa para comprar" name="usableEnCompra" defaultChecked />
              <Casilla etiqueta="Se usa para vender" name="usableEnVenta" defaultChecked />
            </FormularioAccion>
          </details>
        )}
      </Tarjeta>

      {puedeEditar && (
        <Tarjeta titulo="Datos del producto">
          <FormularioAccion accion={editarProductoAccion} boton="Guardar cambios">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Código" name="codigo" defaultValue={p.codigo} />
              <Campo etiqueta="Nombre" name="nombre" defaultValue={p.nombre} />
              <Selector
                etiqueta="Categoría"
                name="categoriaId"
                opciones={categorias.filter((c) => c.activo || c.id === p.categoriaId).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
                defaultValue={p.categoriaId}
              />
              {p.unidadBaseEditable ? (
                <Selector etiqueta="Unidad base" name="unidadBase" opciones={opciones(UNIDADES)} defaultValue={p.unidadBase} />
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Unidad base</span>
                  <input type="hidden" name="unidadBase" value={p.unidadBase} />
                  <p className="flex h-12 items-center text-texto-suave">{UNIDADES[p.unidadBase]} (ya no se cambia)</p>
                </div>
              )}
              <Campo etiqueta="Nombre corto (opcional)" name="nombreCorto" defaultValue={p.nombreCorto ?? ""} />
              <Selector etiqueta="Presentación de venta por defecto" name="presentacionVentaDefaultId" opciones={deVenta} vacia="—" defaultValue={p.presentacionVentaDefaultId ?? ""} />
              <Selector etiqueta="Presentación de compra por defecto" name="presentacionCompraDefaultId" opciones={deCompra} vacia="—" defaultValue={p.presentacionCompraDefaultId ?? ""} />
            </div>
            <Casilla etiqueta="Admite fracción" name="admiteFraccion" defaultChecked={p.admiteFraccion} />
            <AreaTexto etiqueta="Observaciones" name="observaciones" defaultValue={p.observaciones ?? ""} />
          </FormularioAccion>
          <FormularioAccion
            accion={cambiarEstadoProductoAccion}
            boton={p.activo ? "Desactivar producto" : "Reactivar producto"}
            variante={p.activo ? "peligro" : "secundario"}
            confirmar={p.activo ? `¿Desactivar ${p.nombre}? No se va a poder usar en pedidos ni compras nuevas; su historia queda.` : undefined}
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="activo" value={String(!p.activo)} />
          </FormularioAccion>
        </Tarjeta>
      )}
    </section>
  );
}
