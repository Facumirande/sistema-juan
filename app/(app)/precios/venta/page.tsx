import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { listaDePreciosCliente, recargosActuales, type AmbitoRecargo } from "@/modulos/precios-venta/reglas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ALERTAS_PRECIO, ORIGENES_COSTO, ORIGENES_VENTA, UNIDADES_CORTAS } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { recargoAccion } from "./acciones";

export const metadata: Metadata = { title: "Precios de venta · Sistema Juan" };

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
        descripcion="El precio sale del costo más un recargo. Gana el primero que exista: precio pactado con el cliente, recargo del cliente para el producto o la categoría, recargo del cliente, del producto, de la categoría y, si no hay ninguno, el general."
      />

      {lista && (
        <Tarjeta titulo="Lista de precios de un cliente">
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

      <Tarjeta titulo="Recargo general">
        <p className="text-texto-suave">Se usa cuando no hay otro recargo para el cliente, el producto o la categoría.</p>
        <FormRecargo ambito="GLOBAL" valor={recargos.global} editable={editable} />
      </Tarjeta>

      <Tarjeta titulo="Por cliente">
        <p className="text-texto-suave">Vacío = usa el del producto o la categoría. Los precios pactados y excepciones se cargan en la ficha del cliente.</p>
        <Tabla>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Recargo</th>
              <th>Excepciones</th>
            </tr>
          </thead>
          <tbody>
            {recargos.clientes.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.nombre}</td>
                <td>
                  <FormRecargo ambito="CLIENTE" id={c.id} valor={c.recargo} editable={editable} />
                </td>
                <td>
                  <Link href={`/clientes/${c.id}#precios`} className="underline">
                    {c.reglas === 0 ? "Agregar" : `${c.reglas} vigente(s)`}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      <Tarjeta titulo="Por producto">
        <Tabla>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Recargo</th>
            </tr>
          </thead>
          <tbody>
            {recargos.productos.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nombre}
                  <span className="block text-sm text-texto-suave">{p.categoria}</span>
                </td>
                <td>
                  <FormRecargo ambito="PRODUCTO" id={p.id} valor={p.recargo} editable={editable} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      <Tarjeta titulo="Por categoría">
        <Tabla>
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Recargo</th>
            </tr>
          </thead>
          <tbody>
            {recargos.categorias.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>
                  <FormRecargo ambito="CATEGORIA" id={c.id} valor={c.recargo} editable={editable} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>
    </section>
  );
}
