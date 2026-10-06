import Link from "next/link";
import type { ReactNode } from "react";

import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import type { ClavePaso, EstadoPaso } from "@/dominio/jornadas/pasos";
import { datosDelPanel, type DiaDeTrabajo } from "@/modulos/jornadas/dia";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { FlechaNavegacion } from "@/ui/iconos";

import { emitirRemitosDelDiaAccion } from "../entregas/acciones";
import { generarListaAccion } from "../lista-compra/acciones";
import { iniciarPreparacionAccion } from "../preparacion/acciones";

// Vista "Paso a paso": los seis pasos del día en orden, cada uno en una tarjeta de color pastel
// (como las de Trello). El que toca está abierto con sus botones; lo que quedó a medias en un paso
// anterior se avisa ahí mismo, para resolverlo sin frenar el día.

export const TITULOS: Record<ClavePaso, string> = {
  pedidos: "Pedidos",
  lista: "Lista de compras",
  compras: "Compras en el mercado",
  preparacion: "Preparación y remitos",
  entregas: "Reparto y entrega",
  cierre: "Cierre del día",
};

const ICONO: Record<ClavePaso, string> = { pedidos: "📝", lista: "🛒", compras: "🧺", preparacion: "📦", entregas: "🚚", cierre: "🔒" };

/** Cada paso con su color pastel (fondo y texto, del tema claro y oscuro). */
const COLOR: Record<ClavePaso, string> = {
  pedidos: "bg-[var(--pastel-azul)] text-[var(--pastel-azul-texto)]",
  lista: "bg-[var(--pastel-violeta)] text-[var(--pastel-violeta-texto)]",
  compras: "bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]",
  preparacion: "bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]",
  entregas: "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]",
  cierre: "bg-[var(--pastel-rosa)] text-[var(--pastel-rosa-texto)]",
};

/** Qué hay que hacer en cada paso, dicho como una indicación. */
const QUE_HACER: Record<ClavePaso, string> = {
  pedidos: "Cargá lo que pidió cada cliente para este día. Cada pedido guardado queda en la columna “Pedidos” del tablero.",
  lista: "Mandá los pedidos a la lista de compras (desde el tablero o con el botón de acá): el sistema suma cuánto comprar de cada producto y en qué puesto conviene.",
  compras: "En el mercado, abrí la lista de compras y tocá “✓ Lo compré” en cada producto: queda anotado en ese puesto y se tacha de la lista.",
  preparacion: "Separá lo de cada cliente: en cada producto tocá “Está todo” o anotá lo que faltó y por qué. Al marcarlo preparado, su remito se hace solo.",
  entregas: "Imprimí los remitos, armá el reparto con el mejor orden (el viaje calcula el recorrido) y, al entregar, confirmá cada entrega: completa, con diferencias o no recibida.",
  cierre: "Cuando esté todo entregado, revisá el resumen y cerrá el día: queda guardado lo vendido, lo comprado y la ganancia.",
};

const ESTADO_TEXTO: Record<EstadoPaso, string> = { hecho: "✓ Listo", en_curso: "En curso", pendiente: "Todavía no", salteado: "Salteado" };

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const boton = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold";
const principal = `${boton} bg-[#172b4d] text-white hover:bg-[#0c1a33] dark:bg-white dark:text-[#172b4d]`;
const secundario = `${boton} bg-white/70 hover:bg-white dark:bg-black/25 dark:hover:bg-black/40`;

function Enlace({ href, children, destacado }: { href: string; children: ReactNode; destacado?: boolean }) {
  return (
    <Link href={href} className={destacado ? principal : secundario}>
      {children}
    </Link>
  );
}

/** Resumen de una línea y botones de cada paso. */
function contenidoDelPaso(clave: ClavePaso, dia: DiaDeTrabajo, puede: (p: Permiso) => boolean, actual: boolean): { resumen: ReactNode; acciones: ReactNode } {
  const { fecha, panel, plata, hoy } = dia;
  const d = datosDelPanel(panel);
  const e = d.entregas;
  const abierta = panel.estado !== "CERRADA";
  const faltanRemitos = e.preparadas - e.conDocumentos;

  switch (clave) {
    case "pedidos":
      return {
        resumen:
          d.pedidos.confirmados + d.pedidos.borradores === 0 ? (
            "Sin pedidos todavía"
          ) : (
            <>
              {plural(d.pedidos.confirmados + d.pedidos.borradores, "pedido cargado", "pedidos cargados")}
              {d.pedidos.borradores > 0 && <b> · {plural(d.pedidos.borradores, "sin terminar", "sin terminar")}</b>}
              {plata.pedido && dec(plata.pedido).gt(0) && ` · ${formatearMoneda(plata.pedido)}`}
            </>
          ),
        acciones: (
          <>
            {abierta && fecha >= hoy && puede("pedidos.crear") && (
              <Enlace href={`/pedidos/nuevo?fecha=${fecha}`} destacado={actual}>
                ＋ Cargar un pedido
              </Enlace>
            )}
            <Enlace href={`/inicio?fecha=${fecha}`}>Ver en el tablero</Enlace>
          </>
        ),
      };
    case "lista":
      return {
        resumen: !d.lista.armada ? (
          "Sin armar"
        ) : d.lista.desactualizada ? (
          <b>Cambió un pedido: hay que actualizarla</b>
        ) : d.lista.fueraDeLista > 0 ? (
          <b>{plural(d.lista.fueraDeLista, "pedido quedó afuera", "pedidos quedaron afuera")}</b>
        ) : (
          plural(d.lista.lineas, "producto para comprar", "productos para comprar")
        ),
        acciones: (
          <>
            {abierta && puede("lista_compra.generar") && d.pedidos.confirmados + d.pedidos.borradores > 0 && (!d.lista.armada || d.lista.desactualizada || d.lista.fueraDeLista > 0) && (
              <FormularioAccion
                accion={generarListaAccion}
                boton={d.lista.armada ? (d.lista.fueraDeLista > 0 && !d.lista.desactualizada ? "Agregar los que faltan a la lista" : "Actualizar la lista") : "Armar la lista con todos los pedidos"}
                variante={actual ? "principal" : "secundario"}
              >
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {d.lista.armada && (
              <>
                <Enlace href={`/lista-compra?fecha=${fecha}`}>Ver la lista</Enlace>
                <Enlace href={`/lista-compra/imprimir?fecha=${fecha}`}>🖨️ Imprimir</Enlace>
              </>
            )}
          </>
        ),
      };
    case "compras":
      return {
        resumen: (
          <>
            {d.lista.armada ? `${d.lista.resueltas} de ${plural(d.lista.lineas, "producto comprado", "productos comprados")}` : "Todavía sin lista"}
            {d.compras > 0 && ` · ${plural(d.compras, "compra", "compras")}`}
            {plata.comprado && dec(plata.comprado).gt(0) && ` · ${formatearMoneda(plata.comprado)}`}
          </>
        ),
        acciones: (
          <>
            {abierta && puede("compras.registrar") && (
              <Enlace href={`/lista-compra?fecha=${fecha}`} destacado={actual}>
                🛒 Abrir la lista de compras
              </Enlace>
            )}
            {abierta && puede("compras.registrar") && <Enlace href={`/compras/nueva?fecha=${fecha}`}>Anotar otra compra</Enlace>}
          </>
        ),
      };
    case "preparacion":
      return {
        resumen:
          e.total === 0 ? (
            "Sin empezar"
          ) : (
            <>
              {e.preparadas} de {plural(e.total, "cliente preparado", "clientes preparados")}
              {faltanRemitos > 0 && <b> · {plural(faltanRemitos, "remito sin hacer", "remitos sin hacer")}</b>}
            </>
          ),
        acciones: (
          <>
            {abierta && e.total === 0 && puede("preparacion.registrar") && d.pedidos.confirmados + d.pedidos.borradores > 0 && (
              <FormularioAccion accion={iniciarPreparacionAccion} boton="📦 Empezar a preparar" variante={actual ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {e.total > 0 && (
              <Enlace href={`/preparacion/${fecha}`} destacado={actual && e.preparadas < e.total}>
                {e.preparadas < e.total ? "Seguir preparando" : "Ver la preparación"}
              </Enlace>
            )}
            {abierta && faltanRemitos > 0 && puede("entregas.emitir_documentos") && (
              <FormularioAccion accion={emitirRemitosDelDiaAccion} boton={`Hacer ${plural(faltanRemitos, "el remito que falta", "los remitos que faltan")}`} variante={actual ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            {e.total > 0 && <Enlace href={`/preparacion/${fecha}/imprimir`}>🖨️ Imprimir para separar</Enlace>}
          </>
        ),
      };
    case "entregas":
      return {
        resumen: (
          <>
            {e.total === 0 ? "Sin entregas todavía" : `${e.entregadas} de ${plural(e.total, "entregada", "entregadas")}`}
            {d.repartos > 0 && ` · ${plural(d.repartos, "reparto", "repartos")}`}
            {panel.sinReparto > 0 && e.preparadas > 0 && e.enCamino < e.total && <b> · {plural(panel.sinReparto, "sin reparto", "sin reparto")}</b>}
            {plata.entregado && dec(plata.entregado).gt(0) && ` · ${formatearMoneda(plata.entregado)}`}
          </>
        ),
        acciones: (
          <>
            {e.conDocumentos > 0 && <Enlace href={`/entregas/remitos?fecha=${fecha}`}>🧾 Ver e imprimir los remitos</Enlace>}
            {puede("repartos.ver") && e.total > 0 && e.enCamino < e.total && (
              <Enlace href={`/viaje?fecha=${fecha}`} destacado={actual}>
                <FlechaNavegacion className="" /> Armar el reparto y el viaje
              </Enlace>
            )}
            {puede("entregas.ver") && e.enCamino > 0 && (
              <Enlace href={`/viaje?fecha=${fecha}`} destacado={actual && e.enCamino === e.total}>
                ✅ Confirmar entregas
              </Enlace>
            )}
          </>
        ),
      };
    case "cierre":
      return {
        resumen: abierta ? "Falta cerrar" : "Día cerrado: el resumen quedó guardado",
        acciones: puede("jornada.cerrar") && panel.estado && (
          <Enlace href={`/jornadas/${fecha}/cierre`} destacado={actual}>
            {abierta ? "🔒 Revisar y cerrar el día" : "Ver el resumen del día"}
          </Enlace>
        ),
      };
  }
}

/** Qué quedó a medias en un paso anterior y cómo resolverlo. */
function pendienteDeAtras(clave: ClavePaso, dia: DiaDeTrabajo): { texto: string; href: string; boton: string } {
  const d = datosDelPanel(dia.panel);
  switch (clave) {
    case "pedidos":
      return { texto: `${plural(d.pedidos.borradores, "pedido quedó sin terminar de cargar", "pedidos quedaron sin terminar de cargar")}: revisalos y mandalos a la lista.`, href: `/inicio?fecha=${dia.fecha}`, boton: "Ver en el tablero" };
    case "lista":
      return {
        texto: d.lista.desactualizada ? "Cambió un pedido después de armar la lista: actualizala para comprar lo justo." : `${plural(d.lista.fueraDeLista, "pedido quedó afuera de la lista de compras", "pedidos quedaron afuera de la lista de compras")}.`,
        href: `/lista-compra?fecha=${dia.fecha}`,
        boton: "Ir a la lista",
      };
    case "compras":
      return { texto: `Faltan comprar ${d.lista.lineas - d.lista.resueltas} de ${plural(d.lista.lineas, "producto", "productos")} de la lista (o marcarlos como no conseguidos).`, href: `/lista-compra?fecha=${dia.fecha}`, boton: "Ver qué falta" };
    case "preparacion":
      return { texto: "Quedan clientes sin preparar o sin remito.", href: `/preparacion/${dia.fecha}`, boton: "Ir a preparación" };
    default:
      return { texto: "Quedó algo a medias en este paso.", href: `/inicio?fecha=${dia.fecha}&vista=pasos`, boton: "Revisar" };
  }
}

export function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  if (fecha === sumarDias(hoy, -1)) return "Ayer";
  return fechaConDia(fecha).split(" ")[0]!.slice(0, 3);
}

/** "Mañana, martes 29/09" o "Jueves 24/09". */
export function tituloDelDia(fecha: string, hoy: string): string {
  const conDia = fechaConDia(fecha);
  if (fecha === hoy) return `Hoy, ${conDia}`;
  if (fecha === sumarDias(hoy, 1)) return `Mañana, ${conDia}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer, ${conDia}`;
  return conDia.charAt(0).toUpperCase() + conDia.slice(1);
}

export function DiaPasoAPaso({ dia, puede }: { dia: DiaDeTrabajo; puede: (p: Permiso) => boolean }) {
  const { pasos } = dia;
  const avance = Math.round((pasos.hechos / pasos.pasos.length) * 100);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-white">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={pasos.pasos.length} aria-valuenow={pasos.hechos} aria-label="Pasos hechos">
          <div className="h-2.5 rounded-full bg-white" style={{ width: `${avance}%` }} />
        </div>
        <p className="text-sm font-medium text-white/90">{pasos.actual ? `${pasos.hechos} de ${pasos.pasos.length} pasos listos` : "¡Día terminado!"}</p>
      </div>

      <ol className="flex flex-col">
        {pasos.pasos.map((p, i) => {
          const actual = p.clave === pasos.actual;
          const { resumen, acciones } = contenidoDelPaso(p.clave, dia, puede, actual);
          const ultimo = i === pasos.pasos.length - 1;
          const atrasado = pasos.atrasados.includes(p.clave);
          return (
            <li key={p.clave} className="relative flex gap-3 pb-4">
              {!ultimo && <span aria-hidden className="absolute top-11 bottom-0 left-[19px] w-1 rounded-full bg-white/35" />}
              <span
                aria-hidden
                className={`relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow ${p.estado === "hecho" ? "bg-[#1f845a] text-white" : actual ? "bg-white text-[#172b4d] ring-4 ring-white/40" : "bg-white/85 text-[#172b4d]"}`}
              >
                {p.estado === "hecho" ? "✓" : i + 1}
              </span>
              {actual ? (
                <section className={`flex min-w-0 flex-1 flex-col gap-4 rounded-2xl p-5 shadow-lg ring-4 ring-white/70 ${COLOR[p.clave]}`} aria-label={`Ahora: ${TITULOS[p.clave]}`}>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="text-4xl leading-none">
                      {ICONO[p.clave]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold tracking-wider uppercase opacity-80">Ahora toca</p>
                      <h3 className="text-2xl leading-tight font-bold">{TITULOS[p.clave]}</h3>
                      <p className="mt-1 font-medium">{resumen}</p>
                    </div>
                  </div>
                  <p className="text-base leading-relaxed">{QUE_HACER[p.clave]}</p>
                  <div className="flex flex-wrap items-start gap-2">{acciones}</div>
                  {pasos.atrasados.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-xl bg-white/60 p-3 dark:bg-black/25">
                      <p className="font-semibold">⚠️ Quedó pendiente de antes</p>
                      {pasos.atrasados.map((clave) => {
                        const a = pendienteDeAtras(clave, dia);
                        return (
                          <div key={clave} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="min-w-0 flex-1">
                              <b>{TITULOS[clave]}:</b> {a.texto}
                            </p>
                            <Link href={a.href} className="self-start rounded-lg bg-white px-3 py-2 text-sm font-semibold whitespace-nowrap text-[#172b4d] shadow-sm sm:self-auto dark:bg-white/90">
                              {a.boton} →
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : (
                <details className={`group min-w-0 flex-1 rounded-2xl shadow-sm ${COLOR[p.clave]} ${p.estado === "salteado" || p.estado === "pendiente" ? "opacity-85" : ""}`}>
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span aria-hidden className="text-2xl leading-none">
                      {ICONO[p.clave]}
                    </span>
                    <span className="flex-1 text-lg font-bold">{TITULOS[p.clave]}</span>
                    <span className="text-sm font-medium">
                      {atrasado ? "⚠️ Quedó algo pendiente" : ESTADO_TEXTO[p.estado]} · {resumen}
                    </span>
                    <span aria-hidden className="text-lg transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-black/10 px-4 py-4 dark:border-white/15">
                    <p>{QUE_HACER[p.clave]}</p>
                    <div className="flex flex-wrap items-start gap-2">{acciones}</div>
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
