import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, sumarDias } from "@/dominio/fechas/fechas";
import type { ClavePaso, EstadoPaso } from "@/dominio/jornadas/pasos";
import { listarClientes } from "@/modulos/clientes/clientes";
import { listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { diaDeTrabajo, datosDelPanel, type DiaDeTrabajo } from "@/modulos/jornadas/dia";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { contarPedidosPendientes } from "@/modulos/usuarios/acceso";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { emitirRemitosDelDiaAccion } from "../entregas/acciones";
import { generarListaAccion } from "../lista-compra/acciones";
import { crearPedidoAccion } from "../pedidos/acciones";
import { iniciarPreparacionAccion } from "../preparacion/acciones";

export const metadata: Metadata = { title: "Hoy · Sistema Juan" };

const TITULOS: Record<ClavePaso, string> = {
  pedidos: "Pedidos",
  lista: "Lista de compra",
  compras: "Compras en el mercado",
  preparacion: "Preparación",
  remitos: "Remitos",
  entregas: "Reparto y entrega",
  cierre: "Cierre del día",
};

const EXPLICACION: Record<ClavePaso, string> = {
  pedidos: "Cargá lo que pidió cada cliente para este día. Cuando estén todos confirmados, seguí con la lista de compra.",
  lista: "La lista junta lo que pidieron todos: cuánto comprar de cada cosa y en qué puesto conviene.",
  compras: "En el mercado, anotá cada compra: qué, cuánto, a qué precio y cómo se pagó. La lista se va tachando sola.",
  preparacion: "Armá el pedido de cada cliente con lo que se compró. Si algo no alcanza, el sistema propone cómo repartirlo.",
  remitos: "Los remitos se hacen solos al marcar preparado cada cliente: la lista de entrega sin precios y la lista contable con precios.",
  entregas: "Armá el reparto (quién lleva qué y en qué orden), salí, y confirmá cada entrega: completa, con diferencias o no recibida.",
  cierre: "Revisá que no quede nada pendiente y cerrá el día: queda guardado el resumen con lo vendido, lo comprado y la ganancia.",
};

const ESTADO_TEXTO: Record<EstadoPaso, string> = { hecho: "Listo", en_curso: "En curso", pendiente: "Falta", salteado: "Salteado" };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Marcador({ n, estado, actual }: { n: number; estado: EstadoPaso; actual: boolean }) {
  const base = "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold";
  if (estado === "hecho") return <span className={`${base} bg-marca text-marca-texto`}>✓</span>;
  if (actual) return <span className={`${base} border-2 border-marca bg-superficie text-marca`}>{n}</span>;
  if (estado === "salteado") return <span className={`${base} border border-dashed border-borde bg-superficie text-texto-suave`}>–</span>;
  return <span className={`${base} border border-borde bg-superficie text-texto-suave`}>{n}</span>;
}

function Enlace({ href, children, principal }: { href: string; children: ReactNode; principal?: boolean }) {
  return (
    <Link href={href} className={clasesBoton(principal ? "principal" : "secundario")}>
      {children}
    </Link>
  );
}

/** Resumen de una línea y acciones de cada paso. */
function contenidoDelPaso(clave: ClavePaso, dia: DiaDeTrabajo, puede: (p: Permiso) => boolean, clientes: { id: string; nombre: string }[], actual: boolean): { resumen: ReactNode; acciones: ReactNode } {
  const { fecha, panel, plata, hoy } = dia;
  const d = datosDelPanel(panel);
  const e = d.entregas;
  const cerrada = panel.estado === "CERRADA";
  const abierta = !cerrada;

  switch (clave) {
    case "pedidos": {
      const puedeCargar = abierta && fecha >= hoy && puede("pedidos.crear") && clientes.length > 0;
      return {
        resumen:
          d.pedidos.confirmados + d.pedidos.borradores === 0 ? (
            "Sin pedidos todavía"
          ) : (
            <>
              {plural(d.pedidos.confirmados, "confirmado", "confirmados")}
              {d.pedidos.borradores > 0 && <b> · {plural(d.pedidos.borradores, "sin confirmar", "sin confirmar")}</b>}
              {plata.pedido && dec(plata.pedido).gt(0) && ` · ${formatearMoneda(plata.pedido)}`}
            </>
          ),
        acciones: (
          <>
            {puedeCargar && (
              <FormularioAccion accion={crearPedidoAccion} boton="Cargar pedido" variante={actual ? "principal" : "secundario"} enLinea>
                <input type="hidden" name="fecha" value={fecha} />
                <input type="hidden" name="canal" value="WHATSAPP" />
                <select name="clienteId" aria-label="Cliente" required defaultValue="" className="h-11 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3">
                  <option value="" disabled>
                    Elegí el cliente…
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </FormularioAccion>
            )}
            {puede("pedidos.crear") && clientes.length === 0 && (
              <p className="text-sm">
                Primero cargá los clientes en{" "}
                <Link href="/clientes" className="underline">
                  Registros → Clientes
                </Link>
                .
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Enlace href={`/pedidos?fecha=${fecha}`}>Ver los pedidos</Enlace>
            </div>
          </>
        ),
      };
    }
    case "lista":
      return {
        resumen: !d.lista.armada ? "Sin armar" : d.lista.desactualizada ? <b>Cambiaron los pedidos: hay que actualizarla</b> : plural(d.lista.lineas, "producto", "productos"),
        acciones: (
          <div className="flex flex-wrap items-start gap-2">
            {abierta && puede("lista_compra.generar") && d.pedidos.confirmados > 0 && (!d.lista.armada || d.lista.desactualizada) && (
              <FormularioAccion accion={generarListaAccion} boton={d.lista.armada ? "Actualizar la lista" : "Armar la lista de compra"} variante={actual ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {d.lista.armada && (
              <>
                <Enlace href={`/lista-compra?fecha=${fecha}`}>Ver la lista</Enlace>
                <Enlace href={`/lista-compra/imprimir?fecha=${fecha}`}>Imprimir</Enlace>
              </>
            )}
          </div>
        ),
      };
    case "compras":
      return {
        resumen: (
          <>
            {d.lista.armada ? `${d.lista.resueltas} de ${plural(d.lista.lineas, "producto resuelto", "productos resueltos")}` : "Sin lista"}
            {` · ${plural(d.compras, "compra", "compras")}`}
            {plata.comprado && dec(plata.comprado).gt(0) && ` · ${formatearMoneda(plata.comprado)}`}
          </>
        ),
        acciones: (
          <div className="flex flex-wrap gap-2">
            {abierta && puede("compras.registrar") && (
              <Enlace href={`/compras/nueva?fecha=${fecha}`} principal={actual}>
                Registrar una compra
              </Enlace>
            )}
            {d.lista.armada && <Enlace href={`/lista-compra?fecha=${fecha}`}>Lista por puesto</Enlace>}
            {puede("precios.editar_compra") && <Enlace href="/precios/compra/rapida">Precios en el puesto</Enlace>}
          </div>
        ),
      };
    case "preparacion":
      return {
        resumen: e.total === 0 ? "Sin empezar" : `${e.preparadas} de ${plural(e.total, "cliente listo", "clientes listos")}`,
        acciones: (
          <div className="flex flex-wrap items-start gap-2">
            {abierta && e.total === 0 && puede("preparacion.registrar") && d.pedidos.confirmados > 0 && (
              <FormularioAccion accion={iniciarPreparacionAccion} boton="Empezar a preparar" variante={actual ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {e.total > 0 && (
              <>
                <Enlace href={`/preparacion/${fecha}`} principal={actual}>
                  {e.preparadas < e.total ? "Seguir preparando" : "Ver la preparación"}
                </Enlace>
                <Enlace href={`/preparacion/${fecha}/imprimir`}>Hoja de preparación</Enlace>
              </>
            )}
          </div>
        ),
      };
    case "remitos": {
      const faltan = e.preparadas - e.conDocumentos;
      return {
        resumen: e.total === 0 ? "Se hacen al preparar" : `${e.conDocumentos} de ${plural(e.total, "cliente con remito", "clientes con remito")}`,
        acciones: (
          <div className="flex flex-wrap items-start gap-2">
            {abierta && faltan > 0 && puede("entregas.emitir_documentos") && (
              <FormularioAccion accion={emitirRemitosDelDiaAccion} boton={`Hacer ${plural(faltan, "remito que falta", "remitos que faltan")}`} variante={actual ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {e.conDocumentos > 0 && (
              <>
                <Enlace href={`/entregas/remitos?fecha=${fecha}`} principal={actual && faltan <= 0}>
                  Imprimir los remitos
                </Enlace>
                {puede("documentos.imprimir_contable") && <Enlace href={`/entregas/remitos?fecha=${fecha}&tipo=contable`}>Listas contables</Enlace>}
              </>
            )}
          </div>
        ),
      };
    }
    case "entregas":
      return {
        resumen: (
          <>
            {e.total === 0 ? "Sin entregas" : `${e.entregadas} de ${plural(e.total, "entregada", "entregadas")}`}
            {d.repartos > 0 && ` · ${plural(d.repartos, "reparto", "repartos")}`}
            {panel.sinReparto > 0 && e.preparadas > 0 && e.enCamino < e.total && <b> · {plural(panel.sinReparto, "sin reparto", "sin reparto")}</b>}
            {plata.entregado && dec(plata.entregado).gt(0) && ` · ${formatearMoneda(plata.entregado)}`}
          </>
        ),
        acciones: (
          <div className="flex flex-wrap gap-2">
            {puede("repartos.ver") && (
              <Enlace href={`/repartos?fecha=${fecha}`} principal={actual && e.enCamino < e.total}>
                {d.repartos === 0 ? "Armar el reparto" : "Ver los repartos"}
              </Enlace>
            )}
            {puede("entregas.ver") && (
              <Enlace href={`/entregas?fecha=${fecha}`} principal={actual && e.enCamino === e.total && e.total > 0}>
                Confirmar entregas
              </Enlace>
            )}
          </div>
        ),
      };
    case "cierre":
      return {
        resumen: cerrada ? "Día cerrado: el resumen quedó guardado" : "Falta cerrar",
        acciones: puede("jornada.cerrar") && panel.estado && (
          <div className="flex flex-wrap gap-2">
            <Enlace href={`/jornadas/${fecha}/cierre`} principal={actual}>
              {cerrada ? "Ver el resumen del día" : "Revisar y cerrar el día"}
            </Enlace>
          </div>
        ),
      };
  }
}

function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  if (fecha === sumarDias(hoy, -1)) return "Ayer";
  return fechaConDia(fecha).split(" ")[0]!.slice(0, 3);
}

/** "Mañana, martes 29/09" o "Jueves 24/09". */
function tituloDelDia(fecha: string, hoy: string): string {
  const conDia = fechaConDia(fecha);
  if (fecha === hoy) return `Hoy, ${conDia}`;
  if (fecha === sumarDias(hoy, 1)) return `Mañana, ${conDia}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer, ${conDia}`;
  return conDia.charAt(0).toUpperCase() + conDia.slice(1);
}

/** P-02 "Hoy": el día de trabajo paso a paso. Lo demás (registros, balance, cuentas) va por el menú. */
export default async function Inicio({ searchParams }: PageProps<"/inicio">) {
  const sesion = await sesionParaPantalla(null);
  const puede = (p: Permiso) => sesion.permisos.includes(p);
  const db = obtenerBaseDatos();
  const pedidosDeAcceso = puede("usuarios.administrar") ? await contarPedidosPendientes(db, sesion.authUserId) : 0;
  // Alertas de deuda con proveedores (RN-107): vencida en rojo, por vencer en ámbar.
  const cuentas = puede("pagos.ver") && puede("proveedores.ver_credito") ? (await listarCuentasProveedores(db, sesion.authUserId)).cuentas : [];
  const vencidas = cuentas.filter((c) => dec(c.vencimientos.vencida).gt(0));
  const porVencer = cuentas.filter((c) => dec(c.vencimientos.vencida).isZero() && dec(c.vencimientos.porVencer).gt(0));

  const dia = puede("jornada.ver") ? await diaDeTrabajo(db, sesion.authUserId, parametro((await searchParams).fecha)) : null;
  const clientes = dia && puede("pedidos.crear") ? (await listarClientes(db, sesion.authUserId)).map((c) => ({ id: c.id, nombre: c.nombre })) : [];

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Hola, {sesion.nombre.split(" ")[0]}</h1>
        {dia && <p className="text-texto-suave capitalize">{fechaConDia(dia.hoy)}</p>}
      </header>

      {pedidosDeAcceso > 0 && (
        <Link href="/usuarios" className="rounded-lg border border-marca bg-superficie p-4 font-semibold">
          {pedidosDeAcceso === 1 ? "Hay 1 persona esperando que la habilites" : `Hay ${pedidosDeAcceso} personas esperando que las habilites`} →
        </Link>
      )}
      {vencidas.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-error bg-superficie p-4">
          <p className="font-semibold text-error">⏰ Deuda vencida con proveedores</p>
          {vencidas.map((c) => (
            <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
              {c.proveedor}: {formatearMoneda(c.vencimientos.vencida)} ({c.vencimientos.maxDiasAtraso} {c.vencimientos.maxDiasAtraso === 1 ? "día" : "días"} de atraso)
            </Link>
          ))}
        </div>
      )}
      {porVencer.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-500 bg-superficie p-4">
          <p className="font-semibold text-amber-600 dark:text-amber-400">Vence en los próximos días</p>
          {porVencer.map((c) => (
            <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
              {c.proveedor}: {formatearMoneda(c.vencimientos.porVencer)}
              {c.vencimientos.proximo && ` (el ${formatearFecha(c.vencimientos.proximo.fecha).slice(0, 5)})`}
            </Link>
          ))}
        </div>
      )}

      {dia && <DiaPasoAPaso dia={dia} puede={puede} clientes={clientes} />}
    </section>
  );
}

function DiaPasoAPaso({ dia, puede, clientes }: { dia: DiaDeTrabajo; puede: (p: Permiso) => boolean; clientes: { id: string; nombre: string }[] }) {
  const { fecha, hoy, pasos, panel } = dia;
  const avance = Math.round((pasos.hechos / pasos.pasos.length) * 100);

  return (
    <>
      <nav aria-label="Elegir el día" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {dia.dias.map((x) => {
          const elegido = x.fecha === fecha;
          return (
            <Link
              key={x.fecha}
              href={`/inicio?fecha=${x.fecha}`}
              aria-current={elegido ? "date" : undefined}
              className={`flex min-h-14 min-w-20 shrink-0 flex-col items-center justify-center rounded-lg border px-3 py-1 text-center ${elegido ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}
            >
              <span className="text-sm font-semibold capitalize">
                {nombreDelDia(x.fecha, hoy)} {x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}
              </span>
              <span className={`text-xs ${elegido ? "" : "text-texto-suave"}`}>{x.estado === "CERRADA" ? "Cerrado" : x.pedidos > 0 ? plural(x.pedidos, "pedido", "pedidos") : "Sin pedidos"}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{tituloDelDia(fecha, hoy)}</h2>
          <span className="text-sm text-texto-suave">{panel.estado ? `Jornada ${ESTADOS_JORNADA[panel.estado]?.toLowerCase()}` : "Todavía sin pedidos"}</span>
        </div>
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuemin={0} aria-valuemax={pasos.pasos.length} aria-valuenow={pasos.hechos} aria-label="Pasos hechos">
            <div className="h-2 rounded-full bg-marca" style={{ width: `${avance}%` }} />
          </div>
          <p className="mt-1 text-sm text-texto-suave">
            {pasos.actual ? `${pasos.hechos} de ${pasos.pasos.length} pasos listos · ahora: ${TITULOS[pasos.actual].toLowerCase()}` : "¡Día terminado!"}
          </p>
        </div>
      </div>

      <ol className="flex flex-col">
        {pasos.pasos.map((p, i) => {
          const actual = p.clave === pasos.actual;
          const { resumen, acciones } = contenidoDelPaso(p.clave, dia, puede, clientes, actual);
          const ultimo = i === pasos.pasos.length - 1;
          return (
            <li key={p.clave} className="relative flex gap-3 pb-3">
              {!ultimo && <span aria-hidden className={`absolute top-10 bottom-0 left-[17px] w-0.5 ${p.estado === "hecho" ? "bg-marca" : "bg-borde"}`} />}
              <Marcador n={i + 1} estado={p.estado} actual={actual} />
              {actual ? (
                <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border-2 border-marca bg-superficie p-4 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-marca uppercase">Ahora</p>
                    <h3 className="text-lg font-semibold">{TITULOS[p.clave]}</h3>
                    <p className="text-texto-suave">{resumen}</p>
                  </div>
                  <p className="text-sm">{EXPLICACION[p.clave]}</p>
                  <div className="flex flex-col gap-2">{acciones}</div>
                </div>
              ) : (
                <details className="group min-w-0 flex-1 rounded-lg border border-borde bg-superficie">
                  <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2 hover:bg-fondo">
                    <span className="font-semibold">{TITULOS[p.clave]}</span>
                    <span className="text-sm text-texto-suave">
                      {ESTADO_TEXTO[p.estado]} · {resumen}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-borde px-4 py-3">
                    <p className="text-sm text-texto-suave">{EXPLICACION[p.clave]}</p>
                    {acciones}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
