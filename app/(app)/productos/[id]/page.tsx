import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { CATEGORIAS_PREELEGIDAS, SIN_CATEGORIA } from "@/dominio/catalogo/categorias";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { obtenerProducto } from "@/modulos/catalogo/productos";
import { notasDe } from "@/modulos/colaboracion/notas";
import { historialDeOferta, listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { UNIDADES, UNIDADES_CORTAS, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Campo, CampoNumero, Casilla, Encabezado, Estado, Selector, Tarjeta } from "@/ui/formularios";

import { HiloDeNotas } from "../../actividad/notas";
import { crearOfertaAccion } from "../../precios/compra/acciones";
import { permisosOfertas } from "../../precios/compra/tabla-ofertas";
import { TarjetasDeOfertas, type PrecioAnterior } from "../../precios/compra/tarjetas-ofertas";
import { recargoAccion } from "../../precios/venta/acciones";
import {
  agregarPresentacionAccion,
  cambiarEstadoPresentacionAccion,
  cambiarEstadoProductoAccion,
  editarPresentacionAccion,
  editarProductoAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Producto · Sistema Repartos" };

/** P-11 Ficha de producto: datos, presentaciones y proveedores con sus precios (08 §5.2). */
export default async function FichaDeProducto({ params }: PageProps<"/productos/[id]">) {
  const sesion = await sesionParaPantalla("productos.ver");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const p = await cargarFicha(obtenerProducto(db, sesion.authUserId, id));

  const puedeEditar = sesion.permisos.includes("productos.editar");
  const verCostos = sesion.permisos.includes("precios.ver_costos");
  const puedeCrearOferta = sesion.permisos.includes("proveedores.editar") && sesion.permisos.includes("precios.editar_compra");
  const [categorias, ofertas, proveedores, notas] = await Promise.all([
    puedeEditar ? listarCategorias(db, sesion.authUserId) : Promise.resolve([]),
    verCostos ? listaGeneralPreciosCompra(db, sesion.authUserId, { productoId: id }).then((r) => r.ofertas) : Promise.resolve([]),
    puedeCrearOferta ? listarProveedores(db, sesion.authUserId) : Promise.resolve([]),
    notasDe(db, sesion.authUserId, { tipo: "PRODUCTO", id }),
  ]);

  const unidad = UNIDADES_CORTAS[p.unidadBase] ?? "";
  // El historial de precios de cada puesto (para el desplegable): los últimos cambios.
  const COMO: Readonly<Record<string, string>> = { COMPRA: "al anotar una compra", MANUAL: "cargado a mano", IMPORTACION: "desde una planilla" };
  const historiales: Record<string, PrecioAnterior[]> = Object.fromEntries(
    await Promise.all(
      ofertas.map(async (o) => {
        const movimientos = await historialDeOferta(db, sesion.authUserId, o.id);
        const dia = (v: Date | string) => (typeof v === "string" ? v : v.toISOString()).slice(0, 10);
        return [o.id, movimientos.slice(0, 30).map((m): PrecioAnterior => ({ desde: dia(m.vigenteDesde), precio: m.precio, variacionPct: m.variacionPct, como: COMO[m.origen] ?? "cambio de precio", quien: m.usuario }))] as const;
      }),
    ),
  );
  // A cuánto se vende: lo que cuesta (el puesto preferido o el más barato) más la ganancia que le toca.
  const verVenta = verCostos && sesion.permisos.includes("precios.ver_margenes");
  const referencia = ofertas.find((o) => o.esPreferido && o.disponible) ?? ofertas.find((o) => o.esMejor) ?? ofertas[0] ?? null;
  const gananciaPct = p.ganancia.propia ?? p.ganancia.categoria ?? p.ganancia.general;
  const deDonde = p.ganancia.propia !== null ? "la propia de este producto" : p.ganancia.categoria !== null ? `la de su categoría (${p.categoria})` : "la general del negocio";
  const venta = referencia ? dec(referencia.costoBase).times(dec(1).plus(dec(gananciaPct).div(100))) : null;
  const enPorcentaje = (v: string) => formatearNumero(v, { decimales: 2, recortarCeros: true });
  const activas = p.presentaciones.filter((pr) => pr.activo);
  const deCompra = activas.filter((pr) => pr.usableEnCompra).map((pr) => ({ valor: pr.id, etiqueta: pr.nombre }));
  const deVenta = activas.filter((pr) => pr.usableEnVenta).map((pr) => ({ valor: pr.id, etiqueta: pr.nombre }));

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo={`${dibujoDeProducto(p.nombre, p.grupo)} ${p.nombre}`} volver={{ ruta: "/productos", texto: "Productos" }} descripcion={`Código ${p.codigo} · ${p.categoria} · se cuenta en ${UNIDADES[p.unidadBase]?.toLowerCase()}`}>
        <Estado activo={p.activo} />
      </Encabezado>

      {verCostos && (
        <Tarjeta titulo="🏪 ¿Dónde se compra y a cuánto?">
          <p className="text-texto-suave">
            Los puestos del mercado que venden {p.nombre.toLowerCase()} y el precio de cada uno. Con esto la lista de compras te dice dónde conviene y se calcula el precio de venta. El precio también se actualiza solo cada vez que anotás una compra.
          </p>
          {ofertas.length === 0 ? (
            <p className="rounded-xl bg-fondo p-3">Todavía no cargaste ningún puesto para este producto. Agregalo acá abajo, o se carga solo la primera vez que anotes su compra (en la lista de compras, con “💲 Precio y puesto”).</p>
          ) : (
            <TarjetasDeOfertas ofertas={ofertas} permisos={permisosOfertas(sesion.permisos)} historiales={historiales} />
          )}
          {puedeCrearOferta && p.activo && (
            <details open={ofertas.length === 0}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">{ofertas.length === 0 ? "＋ Agregar puesto que lo vende" : "＋ Agregar otro puesto que lo vende"}</summary>
              {deCompra.length === 0 ? (
                <p className="text-texto-suave">Primero agregá, más abajo, el envase en que se compra (por ejemplo Cajón 18 kg).</p>
              ) : (
                <FormularioAccion accion={crearOfertaAccion} boton="Agregar el puesto">
                  <input type="hidden" name="productoId" value={p.id} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Selector etiqueta="¿Qué puesto?" name="proveedorId" opciones={proveedores.map((pv) => ({ valor: pv.id, etiqueta: pv.nombre }))} vacia="Elegí el puesto…" required />
                    <Selector etiqueta="¿En qué envase lo vende?" name="presentacionId" opciones={deCompra} defaultValue={p.presentacionCompraDefaultId ?? undefined} required />
                    <CampoNumero etiqueta="¿A cuánto cada envase?" name="precio" placeholder="Ej. 21.600" required />
                  </div>
                </FormularioAccion>
              )}
            </details>
          )}
        </Tarjeta>
      )}

      {verVenta && (
        <Tarjeta titulo="💰 ¿A cuánto se vende?">
          {referencia && venta ? (
            <>
              <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1.2fr]">
                <p className="flex flex-col rounded-xl bg-fondo p-3">
                  <span className="text-sm text-texto-suave">Cuesta (en {referencia.proveedor})</span>
                  <b className="text-2xl tabular-nums">{formatearMoneda(referencia.costoBase)}</b>
                  <span className="text-sm text-texto-suave">el {unidad}</span>
                </p>
                <span aria-hidden className="self-center text-center text-2xl font-bold text-texto-suave">
                  +
                </span>
                <p className="flex flex-col rounded-xl bg-fondo p-3">
                  <span className="text-sm text-texto-suave">Ganancia</span>
                  <b className="text-2xl tabular-nums">{enPorcentaje(gananciaPct)} %</b>
                  <span className="text-sm text-texto-suave">{deDonde}</span>
                </p>
                <span aria-hidden className="self-center text-center text-2xl font-bold text-texto-suave">
                  =
                </span>
                <p className={`flex flex-col rounded-xl p-3 ${dec(gananciaPct).lt(0) ? "bg-error/15 text-error" : "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]"}`}>
                  <span className="text-sm font-semibold">Se vende a</span>
                  <b className="text-3xl tabular-nums">{formatearMoneda(venta.toString())}</b>
                  <span className="text-sm">el {unidad}</span>
                </p>
              </div>
              {dec(gananciaPct).lt(0) && <p className="rounded-xl bg-error/15 p-3 font-bold text-error">⚠ Con una ganancia negativa se vende por debajo de lo que cuesta: se pierde plata en cada venta.</p>}
            </>
          ) : (
            <p className="rounded-xl border-2 border-amber-500 p-3 font-semibold">⚠ Todavía no tiene precio de compra. Cargalo arriba (en “¿Dónde se compra y a cuánto?”) y acá vas a ver a cuánto se vende.</p>
          )}
          <p className="text-sm text-texto-suave">
            El precio de venta se calcula solo: cada vez que cambia el precio de compra, cambia el de venta. Si a un cliente se le cobra un precio pactado, se carga en{" "}
            <Link href="/precios/venta" className="font-medium underline underline-offset-2">
              Precios de venta
            </Link>
            .
          </p>
          {sesion.permisos.includes("precios.editar_reglas") && p.activo && (
            <FormularioAccion accion={recargoAccion} boton="Guardar la ganancia" enLinea>
              <input type="hidden" name="ambito" value="PRODUCTO" />
              <input type="hidden" name="id" value={p.id} />
              <CampoNumero
                etiqueta="Ganancia de este producto (%)"
                name="valor"
                defaultValue={p.ganancia.propia !== null ? enPorcentaje(p.ganancia.propia) : ""}
                placeholder={`Vacío = ${enPorcentaje(p.ganancia.categoria ?? p.ganancia.general)} % (${p.ganancia.categoria !== null ? "la de su categoría" : "la general"})`}
                ayuda="Escribí solo el número: 30 quiere decir que se le suma un 30 % a lo que cuesta. Dejalo vacío para usar la de su categoría o la general."
              />
            </FormularioAccion>
          )}
        </Tarjeta>
      )}

      <Tarjeta titulo="📦 ¿En qué envases viene?">
        <p className="text-texto-suave">
          Se cuenta por {unidad}. Cada envase (cajón, bolsa…) dice cuántos {unidad} trae: con eso el sistema pasa el precio del envase a precio por {unidad} y sabe cuántos envases comprar.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {p.presentaciones.map((pr) => {
            const trae = formatearNumero(pr.factorABase, { decimales: 3, recortarCeros: true });
            return (
              <li key={pr.id} className={`flex flex-col gap-2 rounded-lg border border-borde p-3 ${pr.activo ? "" : "opacity-60"}`}>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span aria-hidden>{pr.esUnidadBase ? "⚖️" : "📦"}</span>
                  {pr.nombre}
                  {pr.esUnidadBase && <span className="rounded bg-fondo px-2 text-xs font-semibold text-texto-suave">en lo que se cuenta</span>}
                  {!pr.activo && <span className="rounded bg-fondo px-2 text-xs font-semibold text-texto-suave">desactivado</span>}
                </p>
                <p className="text-lg">{pr.esUnidadBase ? `Se cuenta y se pide por ${unidad}` : `1 ${pr.nombre.toLowerCase()} = ${trae} ${unidad}`}</p>
                <p className="flex flex-wrap gap-2 text-sm">
                  <span className={`rounded-full border px-2 py-0.5 ${pr.usableEnCompra ? "border-marca text-marca" : "border-borde text-texto-suave line-through"}`}>🛒 Para comprar</span>
                  <span className={`rounded-full border px-2 py-0.5 ${pr.usableEnVenta ? "border-marca text-marca" : "border-borde text-texto-suave line-through"}`}>🧾 Para vender</span>
                </p>
                {puedeEditar && (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Cambiar</summary>
                    <div className="flex flex-col gap-3 py-2">
                      <FormularioAccion accion={editarPresentacionAccion} boton="Guardar" variante="secundario">
                        <input type="hidden" name="id" value={pr.id} />
                        <Campo etiqueta="Nombre del envase" name="nombre" defaultValue={pr.nombre} />
                        <CampoNumero
                          etiqueta={`¿Cuántos ${unidad} trae?`}
                          name="factorABase"
                          defaultValue={trae}
                          readOnly={pr.enUso || pr.esUnidadBase}
                          ayuda={pr.enUso ? "Ya tiene precios cargados: para otro tamaño agregá un envase nuevo." : undefined}
                        />
                        <Casilla etiqueta="Se usa para comprar" name="usableEnCompra" defaultChecked={pr.usableEnCompra} />
                        <Casilla etiqueta="Se usa para vender" name="usableEnVenta" defaultChecked={pr.usableEnVenta} />
                      </FormularioAccion>
                      {!pr.esUnidadBase && (
                        <FormularioAccion accion={cambiarEstadoPresentacionAccion} boton={pr.activo ? "Desactivar" : "Reactivar"} variante={pr.activo ? "peligro" : "secundario"}>
                          <input type="hidden" name="id" value={pr.id} />
                          <input type="hidden" name="activo" value={String(!pr.activo)} />
                        </FormularioAccion>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {puedeEditar && (
          <details className="rounded-lg border border-dashed border-borde p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">+ Agregar otro envase</summary>
            <FormularioAccion accion={agregarPresentacionAccion} boton="Agregar">
              <input type="hidden" name="productoId" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Nombre del envase" name="nombre" placeholder={`Ej. Bolsa 20 ${unidad}`} ayuda="Con el tamaño en el nombre, así se distingue de los otros." />
                <CampoNumero etiqueta={`¿Cuántos ${unidad} trae?`} name="factorABase" placeholder="Ej. 20" />
              </div>
              <Casilla etiqueta="Se usa para comprar" name="usableEnCompra" defaultChecked />
              <Casilla etiqueta="Se usa para vender" name="usableEnVenta" defaultChecked />
            </FormularioAccion>
          </details>
        )}
      </Tarjeta>

      <Tarjeta titulo="💬 Notas">
        <HiloDeNotas entidadTipo="PRODUCTO" entidadId={p.id} notas={notas.notas} personas={notas.personas} yo={notas.yo} zonaHoraria={sesion.zonaHoraria} />
      </Tarjeta>

      {puedeEditar && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer text-lg font-semibold">✏️ Editar los datos del producto (o darlo de baja)</summary>
          <div className="mt-4 flex flex-col gap-3">
          <FormularioAccion accion={editarProductoAccion} boton="Guardar cambios">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Código" name="codigo" defaultValue={p.codigo} />
              <Campo etiqueta="Nombre" name="nombre" defaultValue={p.nombre} />
              <Selector
                etiqueta="Categoría"
                name="categoria"
                ayuda="Las preelegidas y “Ninguna” se crean al usarlas. Para mover muchos, arrastrá las tarjetas en Productos."
                opciones={[
                  ...categorias.filter((c) => c.productosActivos > 0 || c.id === p.categoriaId).map((c) => ({ valor: `id:${c.id}`, etiqueta: c.nombre })),
                  ...CATEGORIAS_PREELEGIDAS.filter((pre) => !categorias.some((c) => (c.productosActivos > 0 || c.id === p.categoriaId) && c.nombre.toLowerCase() === pre.nombre.toLowerCase())).map((pre) => ({
                    valor: `nombre:${pre.nombre}`,
                    etiqueta: `${pre.nombre} (preelegida)`,
                  })),
                  ...(p.categoria === SIN_CATEGORIA.nombre ? [] : [{ valor: "ninguna", etiqueta: "Ninguna" }]),
                ]}
                defaultValue={`id:${p.categoriaId}`}
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
          </div>
        </details>
      )}
    </section>
  );
}
