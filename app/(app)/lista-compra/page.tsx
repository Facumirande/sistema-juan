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
import { diasParaElegir } from "@/modulos/jornadas/dia";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SelectorDeDia } from "@/ui/selector-de-dia";

import { cambiarCantidadAccion, generarListaAccion, noConseguidoAccion, tildarLineaAccion } from "./acciones";
import { ComprarLinea, type OfertaDeCompra } from "./comprar-linea";

export const metadata: Metadata = { title: "Lista de compras · Sistema Repartos" };

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

/**
 * De qué día es la lista, dicho bien claro: la de hoy, la de mañana, una que ya pasó o una para
 * más adelante. Cada una con su color, para no confundir la lista de hoy con la de otro día.
 */
function queListaEs(fecha: string, hoy: string): { cartel: string; titulo: string; color: string; aclaracion: string | null } {
  const dia = fechaConDia(fecha);
  if (fecha === hoy) return { cartel: "HOY", titulo: `Lista de hoy, ${dia}`, color: "color-verde", aclaracion: null };
  if (fecha === sumarDias(hoy, 1)) return { cartel: "MAÑANA", titulo: `Lista de mañana, ${dia}`, color: "color-azul", aclaracion: "Todavía no es la de hoy: es para lo que se entrega mañana." };
  if (fecha < hoy) return { cartel: "YA PASÓ", titulo: `Lista del ${dia}`, color: "color-amarillo", aclaracion: "Es de un día que ya pasó. Para comprar ahora, elegí “Hoy” arriba." };
  return { cartel: "MÁS ADELANTE", titulo: `Lista del ${dia}`, color: "color-violeta", aclaracion: "Es para un día que todavía no llegó." };
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
  const cuanto = l.presentacion ? `${num(bultosQueFaltan(l))} × ${l.presentacion}` : cant(l.pendienteBase, l.unidadBase);
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${lista ? "border-borde bg-fondo" : l.estado === "PARCIAL" ? "border-amber-500 bg-superficie" : "border-borde bg-superficie"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-4xl leading-none">
          {dibujoDeProducto(l.producto)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xl font-semibold ${lista ? "text-texto-suave line-through" : ""}`}>{l.producto}</p>
          {l.estado === "COMPRADO" && l.tildado ? (
            <p className="font-semibold text-marca">
              ✓ Tildado como comprado <span className="font-normal text-texto-suave">· {l.presentacion && l.cantidadPresentaciones ? `${num(l.cantidadPresentaciones)} × ${l.presentacion}` : cant(l.necesidadBase, l.unidadBase)} · sin anotar puesto ni precio</span>
            </p>
          ) : l.estado === "COMPRADO" ? (
            <p className="font-semibold text-marca">✓ Comprado: {cant(l.compradoBase, l.unidadBase)}</p>
          ) : l.estado === "NO_CONSEGUIDO" ? (
            <p className="font-semibold text-error">✕ No se consiguió{l.motivoNoConseguido && `: ${l.motivoNoConseguido}`}</p>
          ) : (
            <>
              <p className="text-lg">
                {l.estado === "PARCIAL" ? "Falta comprar " : "Hay que comprar "}
                <b className="text-xl">{cuanto}</b>
              </p>
              {l.proveedor && (
                <p className="text-texto-suave">
                  🏪 Conviene en <b className="text-texto">{l.proveedor}</b>
                  {l.ubicacion && ` (${l.ubicacion})`}
                  {l.precioSugerido && ` · ${formatearMoneda(l.precioSugerido)} cada uno`}
                </p>
              )}
            </>
          )}
          {l.paraQuien.length > 0 && (
            <p className="text-sm text-texto-suave">
              👥 Para: {l.paraQuien.map((q) => `${q.cliente} (${cant(q.cantidadBase, l.unidadBase)})`).join(" · ")}
              {!lista && dec(l.compradoBase).gt(0) && ` · ya se compró ${cant(l.compradoBase, l.unidadBase)}`}
              {!lista && dec(l.sobrantePrevistoBase).gt(0) && l.estado === "PENDIENTE" && ` · van a sobrar ${cant(l.sobrantePrevistoBase, l.unidadBase)}`}
            </p>
          )}
          {l.observaciones && <p className="text-sm">📝 “{l.observaciones}”</p>}
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
          {datos.puedeEditar && (
            <BotonAccion
              accion={tildarLineaAccion}
              datos={{ itemId: l.id, tildado: "true" }}
              titulo="Marcarlo como comprado sin anotar en qué puesto ni a cuánto"
              className="min-h-12 rounded-xl border-2 border-borde bg-superficie px-4 font-semibold hover:border-marca/60"
            >
              ☑ Solo tildar
            </BotonAccion>
          )}
        </div>
      )}
      {datos.puedeEditar && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-texto-suave">
            {l.estado === "NO_CONSEGUIDO" ? "Volver a buscarlo" : l.tildado ? "Otras opciones: destildar, anotar puesto y precio" : l.estado === "COMPRADO" ? "Más datos" : "Otras opciones: no lo conseguí, cambiar la cantidad"}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {l.tildado ? (
              <div className="flex flex-wrap items-start gap-2">
                <BotonAccion accion={tildarLineaAccion} datos={{ itemId: l.id, tildado: "false" }} titulo="Volver a dejarlo por comprar" className="min-h-11 rounded-xl border-2 border-borde bg-superficie px-4 font-semibold hover:border-marca/60">
                  ↩ Destildar
                </BotonAccion>
                {datos.puedeComprar && (
                  <ComprarLinea
                    secundario
                    itemId={l.id}
                    producto={l.producto}
                    cantidadSugerida={num(bultosQueFaltan(l))}
                    ofertas={datos.ofertas.filter((o) => o.productoId === l.productoId)}
                    ofertaSugeridaId={ofertaSugerida?.ofertaId ?? null}
                    proveedores={datos.proveedores}
                    envases={datos.envases.filter((e) => e.productoId === l.productoId)}
                    puedeExceder={datos.puedeExceder}
                  />
                )}
              </div>
            ) : l.estado === "NO_CONSEGUIDO" ? (
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
                <p className="text-texto-suave">Se necesitan {cant(l.necesidadBase, l.unidadBase)} en total entre todos los pedidos.</p>
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
  const porPuesto = parametro(sp.vista) === "puesto";
  const { fecha, hoy, dias } = await diasParaElegir(db, sesion.authUserId, parametro(sp.fecha));
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
  const cual = queListaEs(fecha, hoy);
  const descarga = (formato: "xlsx" | "csv") => `/lista-compra/planilla?fecha=${fecha}${formato === "csv" ? "&formato=csv" : ""}`;
  const chico = "flex min-h-11 items-center gap-2 rounded-xl border border-borde bg-superficie px-4 font-semibold hover:border-marca/60";

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <Encabezado titulo="Lista de compras" descripcion="Todo lo que hay que comprar en el mercado para los pedidos de un día, junto. Elegí el día y andá marcando lo que ya compraste." />

      <div className="flex flex-col gap-2">
        <p className="font-semibold">¿De qué día querés ver la lista?</p>
        <SelectorDeDia dias={dias} fecha={fecha} hoy={hoy} enlace={(f) => `/lista-compra?fecha=${f}${porPuesto ? "&vista=puesto" : ""}`} />
      </div>

      <div className={`${cual.color} flex flex-col gap-3 rounded-2xl bg-[var(--col)] p-4 text-[var(--col-texto)] shadow-sm`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-[var(--col-fuerte)] px-3 py-1 text-sm font-extrabold tracking-wide text-[var(--col-fuerte-texto)]">{cual.cartel}</span>
          <h2 className="text-2xl font-extrabold first-letter:uppercase">{cual.titulo}</h2>
        </div>
        <p className="font-medium">
          {lista
            ? `Es lo que hay que comprar para lo que se entrega el ${fechaConDia(fecha)}: ${lista.pedidos === 1 ? "1 pedido" : `${lista.pedidos} pedidos`}, ${lineas.length === 1 ? "1 producto" : `${lineas.length} productos`}.`
            : `Todavía no hay lista para lo que se entrega el ${fechaConDia(fecha)}.`}
          {cual.aclaracion && ` ${cual.aclaracion}`}
        </p>
        {lista && (
          <div className="flex flex-col gap-1.5">
            <p className="text-lg font-bold">
              {faltan.length === 0 ? "✓ Ya está todo comprado" : `${faltan.length === 1 ? "Falta comprar 1 producto" : `Faltan comprar ${faltan.length} productos`} de ${lineas.length}`}
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-black/15" role="progressbar" aria-valuemin={0} aria-valuemax={lineas.length} aria-valuenow={listas.length} aria-label="Productos ya resueltos">
              <div className="h-3 rounded-full bg-[var(--col-fuerte)]" style={{ width: `${avance}%` }} />
            </div>
            {lista.costoEstimadoTotal && <p className="text-sm font-medium opacity-90">Se calcula gastar {formatearMoneda(lista.costoEstimadoTotal)} en total.</p>}
          </div>
        )}
        {lista && lineas.length > 0 && (
          <details className="rounded-xl bg-superficie text-texto shadow-sm">
            <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-lg font-bold">👀 Ver la lista completa ({lineas.length})</summary>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <p className="text-sm text-texto-suave">Solo para leerla de un vistazo. Para marcar lo que compraste, usá los productos de más abajo.</p>
              <ul className="divide-y divide-borde">
                {[...faltan, ...listas].map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <span aria-hidden className="text-2xl leading-none">
                      {dibujoDeProducto(l.producto)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${hecha(l) ? "text-texto-suave line-through" : ""}`}>{l.producto}</span>
                      <span className="block text-sm text-texto-suave">
                        {l.proveedor ? `🏪 ${l.proveedor}` : "Sin puesto sugerido"}
                        {l.paraQuien.length > 0 && ` · para ${l.paraQuien.map((q) => q.cliente).join(", ")}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="block whitespace-nowrap">{l.presentacion && l.cantidadPresentaciones ? `${num(l.cantidadPresentaciones)} × ${l.presentacion}` : cant(l.necesidadBase, l.unidadBase)}</b>
                      <span className={`block text-sm font-semibold ${l.estado === "COMPRADO" ? "text-marca" : l.estado === "NO_CONSEGUIDO" ? "text-error" : "text-texto-suave"}`}>
                        {l.estado === "COMPRADO" ? "✓ Comprado" : l.estado === "NO_CONSEGUIDO" ? "✕ No se consiguió" : l.estado === "PARCIAL" ? "Falta una parte" : "Falta comprar"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>

      {!lista ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <p className="text-lg font-semibold">¿Cómo se arma?</p>
          <p className="text-texto-suave">
            En el tablero, arrastrá los pedidos de la columna “Pedidos” a “Lista de compras” (o elegí varios y tocá “🛒 Mandar a la lista de compras”). También podés armarla acá, con todos los pedidos de ese día.
          </p>
          <div className="flex flex-wrap gap-2">
            {puedeGenerar && (
              <FormularioAccion accion={generarListaAccion} boton="Armar la lista con todos los pedidos del día">
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            <Link href={`/inicio?fecha=${fecha}`} className={clasesBoton("secundario")}>
              Ir al tablero de ese día
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {sesion.permisos.includes("documentos.imprimir_compra") && (
              <Link href={`/lista-compra/imprimir?fecha=${fecha}&ya=1`} className={chico}>
                🖨️ Imprimir
              </Link>
            )}
            <a href={descarga("xlsx")} className={chico}>
              📊 Bajar a Excel
            </a>
            <span className="ml-auto flex rounded-xl border border-borde bg-superficie p-1 text-sm" role="group" aria-label="Cómo ordenar la lista">
              <Link href={`/lista-compra?fecha=${fecha}`} aria-current={porPuesto ? undefined : "true"} className={`rounded-lg px-3 py-1.5 font-semibold ${porPuesto ? "" : "bg-marca text-marca-texto"}`}>
                Todo junto
              </Link>
              <Link href={`/lista-compra?fecha=${fecha}&vista=puesto`} aria-current={porPuesto ? "true" : undefined} className={`rounded-lg px-3 py-1.5 font-semibold ${porPuesto ? "bg-marca text-marca-texto" : ""}`}>
                Por puesto
              </Link>
            </span>
          </div>

          <details className="rounded-2xl border border-borde bg-superficie p-4" open={listas.length === 0}>
            <summary className="cursor-pointer text-lg font-semibold">❓ Cómo se usa esta lista</summary>
            <ol className="mt-3 flex flex-col gap-2">
              <li>
                <b>1. Mirá lo que falta.</b> Cada producto dice cuánto hay que comprar, para qué clientes es y en qué puesto conviene.
              </li>
              <li>
                <b>2. Cuando lo compraste, marcalo.</b> “✓ Lo compré” anota la compra con su puesto y su precio (queda en la cuenta del proveedor). “☑ Solo tildar” lo marca como comprado sin anotar nada más.
              </li>
              <li>
                <b>3. Si no había,</b> abrí “Otras opciones” y tocá “No lo conseguí”: al preparar se reparte lo que haya.
              </li>
              <li className="text-texto-suave">Cuando está todo lo de un pedido, su tarjeta pasa sola a “Comprado” en el tablero. También podés tildar desde las tarjetas del tablero, o imprimir la lista y pasar las tarjetas a “Comprado” al volver.</li>
            </ol>
          </details>

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
                <section className="flex flex-col gap-3">
                  <h2 className="text-xl font-semibold">🛒 Falta comprar ({faltan.length})</h2>
                  <ul className="flex flex-col gap-3">
                    {faltan.map((l) => (
                      <Producto key={l.id} l={l} datos={datos} />
                    ))}
                  </ul>
                </section>
              )}
              {listas.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-texto-suave">✓ Ya resuelto ({listas.length})</h2>
                  <ul className="flex flex-col gap-2">
                    {listas.map((l) => (
                      <Producto key={l.id} l={l} datos={datos} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <details className="rounded-2xl border border-borde bg-superficie p-4 print:hidden">
            <summary className="cursor-pointer font-semibold">⚙️ Más opciones</summary>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Link href={`/compras?fecha=${fecha}`} className={chico}>
                  🧾 Compras anotadas de ese día
                </Link>
                {puedeComprar && (
                  <Link href={`/compras/nueva?fecha=${fecha}`} className={chico}>
                    ＋ Anotar otra compra (varias cosas de un puesto)
                  </Link>
                )}
                <a href={descarga("csv")} className={chico}>
                  📄 Bajar como CSV
                </a>
              </div>
              {puedeGenerar && !lista.desactualizada && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-texto-suave">Si cambiaste pedidos y querés que la lista vuelva a sumar todo (lo ya comprado y lo tildado se conservan):</p>
                  <FormularioAccion accion={generarListaAccion} boton="Volver a calcular la lista" variante="secundario">
                    <input type="hidden" name="fecha" value={fecha} />
                  </FormularioAccion>
                </div>
              )}
              <p className="text-sm text-texto-suave">Armada el {formatearFechaHora(lista.generadaEn, sesion.zonaHoraria)}.</p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
