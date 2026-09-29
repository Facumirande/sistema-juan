import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { presentacionesNecesarias } from "@/dominio/unidades/unidades";
import { listarPresentacionesDeCompra } from "@/modulos/catalogo/productos";
import { obtenerListaCompra, ofertasParaLinea, type LineaDeLista } from "@/modulos/compras/lista-compra";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { cambiarCantidadAccion, generarListaAccion, noConseguidoAccion } from "./acciones";
import { ComprarLinea, type OfertaDeCompra } from "./comprar-linea";

export const metadata: Metadata = { title: "Lista de compras · Sistema Juan" };

const ALERTAS: Readonly<Record<string, string>> = {
  SIN_PROVEEDOR: "Ningún puesto tiene precio cargado: elegí el puesto al anotar la compra.",
  CREDITO_INSUFICIENTE: "El puesto más barato no tiene crédito suficiente: se sugiere otro.",
  PRECIO_DESACTUALIZADO: "El precio es viejo: confirmalo en el puesto.",
};

const cant = (v: string, unidad: string) => formatearCantidad(v, unidad as UnidadMedida);
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });
const hecha = (l: LineaDeLista) => l.estado === "COMPRADO" || l.estado === "NO_CONSEGUIDO";

/** Cuántos bultos faltan comprar (si ya se compró una parte, solo lo que falta). */
function bultosQueFaltan(l: LineaDeLista): string {
  if (l.estado === "PARCIAL" && l.presentacion) return presentacionesNecesarias(l.pendienteBase, l.factor).cantidad.toString();
  return l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero() ? dec(l.cantidadPresentaciones).toString() : "1";
}

interface DatosParaComprar {
  ofertas: (OfertaDeCompra & { productoId: string })[];
  proveedores: { id: string; nombre: string; condicionHabitual: string }[];
  envases: { productoId: string; id: string; nombre: string }[];
  puedeComprar: boolean;
  puedeEditar: boolean;
  puedeExceder: boolean;
}

function Producto({ l, datos }: { l: LineaDeLista; datos: DatosParaComprar }) {
  const lista = hecha(l);
  const ofertaSugerida = datos.ofertas.find((o) => o.productoId === l.productoId && o.proveedorId === l.proveedorId && o.presentacionId === l.presentacionId);
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${lista ? "border-borde bg-fondo" : l.estado === "PARCIAL" ? "border-amber-500 bg-superficie" : "border-borde bg-superficie"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-4xl leading-none">
          {dibujoDeProducto(l.producto)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xl font-semibold ${lista ? "text-texto-suave line-through" : ""}`}>{l.producto}</p>
          {l.estado === "COMPRADO" ? (
            <p className="font-semibold text-marca">✓ Comprado: {cant(l.compradoBase, l.unidadBase)}</p>
          ) : l.estado === "NO_CONSEGUIDO" ? (
            <p className="font-semibold text-error">✕ No se consiguió{l.motivoNoConseguido && `: ${l.motivoNoConseguido}`}</p>
          ) : (
            <>
              <p className="text-lg">
                Hay que comprar{" "}
                <b>
                  {l.presentacion ? `${num(bultosQueFaltan(l))} × ${l.presentacion}` : cant(l.pendienteBase, l.unidadBase)}
                </b>
              </p>
              <p className="text-texto-suave">
                Se necesitan {cant(l.necesidadBase, l.unidadBase)}
                {dec(l.compradoBase).gt(0) && ` · ya se compró ${cant(l.compradoBase, l.unidadBase)}`}
                {dec(l.sobrantePrevistoBase).gt(0) && l.estado === "PENDIENTE" && ` · sobran ${cant(l.sobrantePrevistoBase, l.unidadBase)}`}
              </p>
              {l.proveedor && (
                <p className="text-texto-suave">
                  🏪 Conviene en <b className="text-texto">{l.proveedor}</b>
                  {l.ubicacion && ` (${l.ubicacion})`}
                  {l.precioSugerido && ` · ${formatearMoneda(l.precioSugerido)} c/u`}
                </p>
              )}
            </>
          )}
          {l.observaciones && <p className="text-sm">“{l.observaciones}”</p>}
          {l.necesidadModificada && <p className="text-sm font-medium text-error">⚠ Cambió un pedido después de comprar: revisá si alcanza.</p>}
          {!lista &&
            l.alertas.map((a) => (
              <p key={a} className="text-sm text-amber-700 dark:text-amber-400">
                ⚠ {ALERTAS[a]}
              </p>
            ))}
        </div>
      </div>
      {!lista && datos.puedeComprar && (
        <div className="flex flex-wrap items-start gap-2">
          <ComprarLinea
            itemId={l.id}
            producto={l.producto}
            cantidadSugerida={num(bultosQueFaltan(l))}
            ofertas={datos.ofertas.filter((o) => o.productoId === l.productoId)}
            ofertaSugeridaId={ofertaSugerida?.ofertaId ?? null}
            proveedores={datos.proveedores}
            envases={datos.envases.filter((e) => e.productoId === l.productoId)}
            puedeExceder={datos.puedeExceder}
          />
        </div>
      )}
      {datos.puedeEditar && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-texto-suave">{l.estado === "NO_CONSEGUIDO" ? "Volver a buscarlo" : "No lo conseguí / cambiar la cantidad"}</summary>
          <div className="mt-3 flex flex-col gap-3">
            {l.estado === "NO_CONSEGUIDO" ? (
              <FormularioAccion accion={noConseguidoAccion} boton="Volver a la lista" variante="secundario">
                <input type="hidden" name="itemId" value={l.id} />
                <input type="hidden" name="quitar" value="true" />
              </FormularioAccion>
            ) : (
              <>
                {l.estado !== "COMPRADO" && (
                  <FormularioAccion accion={noConseguidoAccion} boton="No lo conseguí" variante="peligro" enLinea>
                    <input type="hidden" name="itemId" value={l.id} />
                    <Campo etiqueta="Por qué (opcional)" name="motivo" placeholder="Ej. no había en el mercado" />
                  </FormularioAccion>
                )}
                {l.estado === "PENDIENTE" && l.presentacion && (
                  <FormularioAccion accion={cambiarCantidadAccion} boton="Cambiar la cantidad" variante="secundario" enLinea>
                    <input type="hidden" name="itemId" value={l.id} />
                    <CampoNumero etiqueta={`Cuántos ${l.presentacion.toLowerCase()}`} name="cantidad" defaultValue={l.cantidadPresentaciones ? num(l.cantidadPresentaciones) : ""} className="w-28" />
                    <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. uno de más por las dudas" />
                  </FormularioAccion>
                )}
              </>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

/** P-50 Lista de compras del día: todo lo que hay que comprar junto, para ir tildando en el mercado. */
export default async function PaginaListaCompra({ searchParams }: PageProps<"/lista-compra">) {
  const sesion = await sesionParaPantalla("lista_compra.ver");
  const db = obtenerBaseDatos();
  const sp = await searchParams;
  const pedida = parametro(sp.fecha);
  const porPuesto = parametro(sp.vista) === "puesto";
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : (await fechasDeTrabajo(db, sesion.authUserId)).sugerida;
  const lista = await obtenerListaCompra(db, sesion.authUserId, fecha);
  const lineas = lista ? lista.plan.flatMap((p) => p.lineas) : [];
  const puedeComprar = sesion.permisos.includes("compras.registrar");
  const [ofertas, proveedores, envases] = await Promise.all([
    lista ? ofertasParaLinea(db, sesion.authUserId, lineas.map((l) => l.productoId)) : Promise.resolve([]),
    lista && puedeComprar ? listarProveedores(db, sesion.authUserId) : Promise.resolve([]),
    lista && puedeComprar ? listarPresentacionesDeCompra(db, sesion.authUserId) : Promise.resolve([]),
  ]);
  const datos: DatosParaComprar = {
    ofertas,
    proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre, condicionHabitual: p.condicionPagoHabitual })),
    envases: envases.map((e) => ({ productoId: e.productoId, id: e.presentacionId, nombre: e.presentacion })),
    puedeComprar,
    puedeEditar: sesion.permisos.includes("lista_compra.editar"),
    puedeExceder: sesion.permisos.includes("compras.exceder_limite"),
  };
  const faltan = lineas.filter((l) => !hecha(l));
  const listas = lineas.filter(hecha);
  const avance = lineas.length ? Math.round((listas.length / lineas.length) * 100) : 0;
  const puedeGenerar = sesion.permisos.includes("lista_compra.generar");

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <Encabezado
        titulo="Lista de compras"
        descripcion={`Todo lo que hay que comprar en el mercado para la entrega del ${fechaConDia(fecha)}, junto. Cuando compres algo, tocá “✓ Lo compré”: queda anotado en ese puesto y se tacha de la lista.`}
      >
        {lista && sesion.permisos.includes("documentos.imprimir_compra") && (
          <Link href={`/lista-compra/imprimir?fecha=${fecha}`} className={clasesBoton("secundario")}>
            🖨️ Imprimir
          </Link>
        )}
        {lista && (
          <Link href={`/compras?fecha=${fecha}`} className={clasesBoton("secundario")}>
            Compras anotadas
          </Link>
        )}
      </Encabezado>

      <nav aria-label="Día" className="flex flex-wrap items-center gap-2">
        <Link href={`/lista-compra?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ← Día anterior
        </Link>
        <Link href={`/lista-compra?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          Día siguiente →
        </Link>
      </nav>

      {!lista ? (
        <Tarjeta>
          <p className="text-lg">Todavía no hay lista para este día.</p>
          <p className="text-texto-suave">
            Se arma desde el tablero: elegí los pedidos (o “Elegir todo lo que falta comprar”) y tocá “Armar la lista de compras”. También podés armarla acá con todos los pedidos del día.
          </p>
          {puedeGenerar && (
            <FormularioAccion accion={generarListaAccion} boton="Armar la lista con todos los pedidos">
              <input type="hidden" name="fecha" value={fecha} />
            </FormularioAccion>
          )}
        </Tarjeta>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">
                {faltan.length === 0 ? "✓ Ya está todo comprado" : `${faltan.length === 1 ? "Falta" : "Faltan"} ${faltan.length} de ${lineas.length} productos`}
              </p>
              {lista.costoEstimadoTotal && <p className="text-texto-suave">Se calcula gastar {formatearMoneda(lista.costoEstimadoTotal)}</p>}
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuemin={0} aria-valuemax={lineas.length} aria-valuenow={listas.length} aria-label="Productos comprados">
              <div className="h-3 rounded-full bg-marca" style={{ width: `${avance}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-texto-suave">
              <span>Armada el {formatearFechaHora(lista.generadaEn, sesion.zonaHoraria)}</span>
              <span className="flex gap-2">
                <Link href={`/lista-compra?fecha=${fecha}`} className={`rounded-lg px-3 py-1.5 font-semibold ${porPuesto ? "" : "bg-marca text-marca-texto"}`}>
                  Todo junto
                </Link>
                <Link href={`/lista-compra?fecha=${fecha}&vista=puesto`} className={`rounded-lg px-3 py-1.5 font-semibold ${porPuesto ? "bg-marca text-marca-texto" : ""}`}>
                  Por puesto
                </Link>
              </span>
            </div>
          </div>

          {lista.desactualizada && (
            <Aviso>
              Cambió un pedido después de armar la lista. Actualizala para comprar lo justo (lo ya comprado no se pierde).
              {puedeGenerar && (
                <span className="mt-2 block">
                  <FormularioAccion accion={generarListaAccion} boton="Actualizar la lista" enLinea>
                    <input type="hidden" name="fecha" value={fecha} />
                  </FormularioAccion>
                </span>
              )}
            </Aviso>
          )}

          {porPuesto ? (
            lista.plan.map((p) => (
              <section key={p.proveedorId ?? "sin"} className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">
                  🏪 {p.proveedor}
                  {p.ubicacion && <span className="text-base font-normal text-texto-suave"> · {p.ubicacion}</span>}
                </h2>
                <ul className="flex flex-col gap-3">
                  {p.lineas.map((l) => (
                    <Producto key={l.id} l={l} datos={datos} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <>
              {faltan.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {faltan.map((l) => (
                    <Producto key={l.id} l={l} datos={datos} />
                  ))}
                </ul>
              )}
              {listas.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-texto-suave">Ya resuelto ({listas.length})</h2>
                  <ul className="flex flex-col gap-2">
                    {listas.map((l) => (
                      <Producto key={l.id} l={l} datos={datos} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {puedeGenerar && !lista.desactualizada && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-texto-suave">Volver a calcular la lista con los pedidos de ahora</summary>
              <div className="mt-2">
                <FormularioAccion accion={generarListaAccion} boton="Recalcular la lista" variante="secundario">
                  <input type="hidden" name="fecha" value={fecha} />
                </FormularioAccion>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
