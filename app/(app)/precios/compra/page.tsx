import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Campo, Casilla, Encabezado, Filtros, Selector, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { TablaOfertas, permisosOfertas } from "./tabla-ofertas";

export const metadata: Metadata = { title: "Precios de compra · Sistema Juan" };

/** P-25 Lista general de precios de compra (05 §2.1, 08 §5.5). */
export default async function PaginaPreciosCompra({ searchParams }: PageProps<"/precios/compra">) {
  const sesion = await sesionParaPantalla("precios.ver_costos");
  const f = await searchParams;
  const filtros = {
    texto: parametro(f.texto),
    categoriaId: parametro(f.categoria),
    proveedorId: parametro(f.proveedor),
    soloDesactualizadas: parametro(f.desactualizadas) === "on",
    soloMejor: parametro(f.mejor) === "on",
  };

  const db = obtenerBaseDatos();
  const [{ ofertas, parametros }, categorias, proveedores] = await Promise.all([
    listaGeneralPreciosCompra(db, sesion.authUserId, filtros),
    listarCategorias(db, sesion.authUserId),
    sesion.permisos.includes("proveedores.ver") ? listarProveedores(db, sesion.authUserId) : Promise.resolve([]),
  ]);
  const desactualizadas = ofertas.filter((o) => o.desactualizada).length;
  const consulta = new URLSearchParams(Object.entries({ proveedor: filtros.proveedorId, categoria: filtros.categoriaId }).filter((e): e is [string, string] => Boolean(e[1])));

  return (
    <section className="flex flex-col gap-6">
      <Encabezado
        titulo="Precios de compra"
        descripcion={`Qué cuesta cada producto en cada proveedor. El costo es por unidad base, para comparar presentaciones distintas. Un precio sin actualizar hace más de ${parametros.diasAlertaDesactualizado} días se marca con ⚠.`}
      >
        {sesion.permisos.includes("precios.editar_compra") && (
          <Link href="/precios/compra/rapida" className={clasesBoton("principal")}>
            Actualizar en el puesto
          </Link>
        )}
        {sesion.permisos.includes("documentos.imprimir_compra") && (
          <Link href={`/precios/compra/imprimir?${consulta}`} className={clasesBoton("secundario")}>
            Imprimir lista
          </Link>
        )}
      </Encabezado>

      <Filtros>
        <Campo etiqueta="Buscar" name="texto" defaultValue={filtros.texto} placeholder="Producto o código" />
        <Selector etiqueta="Categoría" name="categoria" opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} vacia="Todas" defaultValue={filtros.categoriaId} />
        {proveedores.length > 0 && (
          <Selector etiqueta="Proveedor" name="proveedor" opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} vacia="Todos" defaultValue={filtros.proveedorId} />
        )}
        <Casilla etiqueta="Solo desactualizados" name="desactualizadas" defaultChecked={filtros.soloDesactualizadas} />
        <Casilla etiqueta="Solo el mejor precio" name="mejor" defaultChecked={filtros.soloMejor} />
      </Filtros>

      {desactualizadas > 0 && !filtros.soloDesactualizadas && (
        <p className="font-medium text-error">
          ⚠ {desactualizadas} precio(s) sin actualizar hace más de {parametros.diasAlertaDesactualizado} días.
        </p>
      )}

      {ofertas.length === 0 ? (
        <p className="text-texto-suave">
          No hay precios {Object.values(filtros).some(Boolean) ? "con esos filtros" : "cargados todavía: se cargan desde la ficha de cada producto o proveedor"}.
        </p>
      ) : (
        <TablaOfertas ofertas={ofertas} mostrar="ambos" permisos={permisosOfertas(sesion.permisos)} />
      )}
    </section>
  );
}
