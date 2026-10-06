import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { listaDePreciosCliente, recargosActuales, type AmbitoRecargo } from "@/modulos/precios-venta/reglas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { ALERTAS_PRECIO, ORIGENES_COSTO, ORIGENES_VENTA, UNIDADES_CORTAS } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { recargoAccion } from "./acciones";

export const metadata: Metadata = { title: "Precios de venta · Sistema Repartos" };

const pct = (v: string | null) => (v === null ? "" : formatearNumero(v, { decimales: 3, recortarCeros: true }));

function FormRecargo({ ambito, id, valor, editable }: { ambito: AmbitoRecargo; id?: string; valor: string | null; editable: boolean }) {
  if (!editable) return <span>{valor === null ? "—" : `${pct(valor)} %`}</span>;
  return (
    <FormularioAccion accion={recargoAccion} boton="Guardar" variante="secundario" enLinea>
      <input type="hidden" name="ambito" value={ambito} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex items-center gap-1">
        <input
          name="valor"
          inputMode="decimal"
          defaultValue={pct(valor)}
          placeholder={ambito === "GLOBAL" ? "30" : "—"}
          aria-label="Recargo en %"
          className="h-11 w-20 rounded-lg border border-borde bg-superficie px-2 text-right text-base"
        />
        %
      </label>
    </FormularioAccion>
  );
}

const NOMBRE_AMBITO: Readonly<Record<string, string>> = { CLIENTE: "un cliente", PRODUCTO: "un producto", CATEGORIA: "una categoría" };
const SINGULAR: Readonly<Record<string, string>> = { CLIENTE: "Cliente", PRODUCTO: "Producto", CATEGORIA: "Categoría" };

/** Los que tienen una ganancia propia (para cambiarla o quitarla) y el botón para agregarle a otro. */
function Especiales({
  titulo,
  ambito,
  editable,
  conPropia,
  sinPropia,
}: {
  titulo: string;
  ambito: AmbitoRecargo;
  editable: boolean;
  conPropia: { id: string; nombre: string; detalle?: string; recargo: string | null; extra?: number }[];
  sinPropia: { valor: string; etiqueta: string }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borde p-3">
      <h3 className="font-semibold">{titulo}</h3>
      {conPropia.length === 0 ? (
        <p className="text-sm text-texto-suave">Ninguno con ganancia propia: usan la general.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {conPropia.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">{x.nombre}</span>
                {x.detalle && <span className="block text-sm text-texto-suave">{x.detalle}</span>}
                {ambito === "CLIENTE" && (
                  <Link href={`/clientes/${x.id}#precios`} className="block text-sm underline underline-offset-2">
                    {x.extra ? `${x.extra} precio(s) pactado(s)` : "Pactar un precio"}
                  </Link>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {x.recargo === null ? <span className="text-sm text-texto-suave">Usa la general</span> : <FormRecargo ambito={ambito} id={x.id} valor={x.recargo} editable={editable} />}
                {editable && x.recargo !== null && (
                  <BotonAccion accion={recargoAccion} datos={{ ambito, id: x.id, valor: "" }} className="min-h-11 rounded-lg px-3 text-sm font-medium text-texto-suave underline underline-offset-2">
                    Quitar
                  </BotonAccion>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && sinPropia.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">＋ Darle una ganancia propia a {NOMBRE_AMBITO[ambito]}</summary>
          <FormularioAccion accion={recargoAccion} boton="Guardar" enLinea>
            <input type="hidden" name="ambito" value={ambito} />
            <Selector etiqueta={SINGULAR[ambito] ?? titulo} name="id" opciones={sinPropia} />
            <label className="flex flex-col gap-1">
              <span className="font-medium">Ganancia</span>
              <span className="flex items-center gap-1">
                <input name="valor" inputMode="decimal" placeholder="Ej. 35" aria-label="Ganancia en %" className="h-11 w-24 rounded-lg border border-borde bg-superficie px-2 text-right text-base" />%
              </span>
            </label>
          </FormularioAccion>
        </details>
      )}
    </div>
  );
}

/**
 * Precios de venta (P-32 simplificada): los recargos por nivel y la lista de precios de un
 * cliente, con el origen de cada precio (RN-077).
 */
export default async function PaginaPreciosVenta({ searchParams }: PageProps<"/precios/venta">) {
  const sesion = await sesionParaPantalla("precios.ver_margenes");
  const f = await searchParams;
  const db = obtenerBaseDatos();
  const recargos = await recargosActuales(db, sesion.authUserId);
  const clienteId = parametro(f.cliente) ?? recargos.clientes[0]?.id;
  const fecha = parametro(f.fecha);
  const lista = clienteId ? await listaDePreciosCliente(db, sesion.authUserId, { clienteId, fecha: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined }) : null;
  const editable = sesion.permisos.includes("precios.editar_reglas");
  const verCostos = sesion.permisos.includes("precios.ver_costos");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo="Precios de venta"
        descripcion="Cada producto se vende a lo que cuesta más un porcentaje de ganancia. Si no hacés nada, se usa la ganancia general; si a un producto, una categoría o un cliente le querés cobrar distinto, dale su propio porcentaje."
      />

      <Tarjeta titulo="1. Ganancia general">
        <p className="text-texto-suave">La que se usa para todo lo que no tenga una propia.</p>
        <FormRecargo ambito="GLOBAL" valor={recargos.global} editable={editable} />
      </Tarjeta>

      <Tarjeta titulo="2. Ganancias especiales">
        <p className="text-texto-suave">
          Solo si a algo le querés cobrar distinto que la general. Si hay varias, gana la más específica: la del cliente, después la del producto y después la de la categoría. Los precios fijos pactados con un cliente se cargan en su ficha y le ganan a todo.
        </p>
        <Especiales
          titulo="Clientes"
          ambito="CLIENTE"
          editable={editable}
          conPropia={recargos.clientes.filter((c) => c.recargo !== null || c.reglas > 0).map((c) => ({ id: c.id, nombre: c.nombre, recargo: c.recargo, extra: c.reglas }))}
          sinPropia={recargos.clientes.filter((c) => c.recargo === null).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        />
        <Especiales
          titulo="Productos"
          ambito="PRODUCTO"
          editable={editable}
          conPropia={recargos.productos.filter((p) => p.recargo !== null).map((p) => ({ id: p.id, nombre: p.nombre, detalle: p.categoria, recargo: p.recargo }))}
          sinPropia={recargos.productos.filter((p) => p.recargo === null).map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
        />
        <Especiales
          titulo="Categorías"
          ambito="CATEGORIA"
          editable={editable}
          conPropia={recargos.categorias.filter((c) => c.recargo !== null).map((c) => ({ id: c.id, nombre: c.nombre, recargo: c.recargo }))}
          sinPropia={recargos.categorias.filter((c) => c.recargo === null).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        />
      </Tarjeta>

      {lista && (
        <Tarjeta titulo="Consultar los precios de un cliente">
          <p className="text-texto-suave">Elegí un cliente para ver a cuánto le queda cada producto y de dónde sale ese precio.</p>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Selector etiqueta="Cliente" name="cliente" opciones={recargos.clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} defaultValue={clienteId} />
            <Campo etiqueta="Para el día" name="fecha" type="date" defaultValue={lista.fecha} />
            <button type="submit" className={clasesBoton("secundario")}>
              Ver
            </button>
          </form>
          {lista.precios.length === 0 ? (
            <p className="text-texto-suave">No hay productos cargados.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>De dónde sale</th>
                  {verCostos && <th>Costo</th>}
                  <th className="text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {lista.precios.map((p) => {
                  const r = p.resultado;
                  const unidad = UNIDADES_CORTAS[p.unidadBase];
                  return (
                    <tr key={p.productoId}>
                      <td>
                        <span className="font-medium">{p.producto}</span>
                        <span className="block text-sm text-texto-suave">{p.categoria}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.precioUnitario === null ? (
                          <span className="text-error">Sin precio</span>
                        ) : (
                          <>
                            {formatearMoneda(r.precioUnitario)}/{unidad}
                            {p.presentacion && r.precioPresentacion && (
                              <span className="block text-sm text-texto-suave">
                                {formatearMoneda(r.precioPresentacion)} {p.presentacion}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {ORIGENES_VENTA[r.origen]}
                        {r.recargoAplicado && ` ${pct(r.recargoAplicado.toString())} %`}
                        {r.alertas.map((a) => (
                          <span key={a} className="block text-sm text-error">
                            ⚠ {ALERTAS_PRECIO[a]}
                          </span>
                        ))}
                      </td>
                      {verCostos && (
                        <td className="whitespace-nowrap">
                          {r.costoUnitario ? `${formatearMoneda(r.costoUnitario)}/${unidad}` : "—"}
                          <span className="block text-sm text-texto-suave">{ORIGENES_COSTO[r.origenCosto]}</span>
                        </td>
                      )}
                      <td className={`text-right ${r.margenPct && dec(r.margenPct.toString()).lt(0) ? "text-error" : ""}`}>
                        {r.margenPct ? `${formatearNumero(r.margenPct.toString(), { decimales: 1 })} %` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      )}

    </section>
  );
}
