import Link from "next/link";
import type { ReactNode } from "react";

import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import type { ClavePaso, EstadoPaso } from "@/dominio/jornadas/pasos";
import { datosDelPanel, type DiaDeTrabajo } from "@/modulos/jornadas/dia";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { clasesBoton } from "@/ui/formularios";

import { emitirRemitosDelDiaAccion } from "../entregas/acciones";
import { generarListaAccion } from "../lista-compra/acciones";
import { iniciarPreparacionAccion } from "../preparacion/acciones";

// Vista "Paso a paso" de la pantalla Hoy: los siete pasos del día en orden, con el que toca abierto.

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

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

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
function contenidoDelPaso(clave: ClavePaso, dia: DiaDeTrabajo, puede: (p: Permiso) => boolean, actual: boolean): { resumen: ReactNode; acciones: ReactNode } {
  const { fecha, panel, plata, hoy } = dia;
  const d = datosDelPanel(panel);
  const e = d.entregas;
  const cerrada = panel.estado === "CERRADA";
  const abierta = !cerrada;

  switch (clave) {
    case "pedidos": {
      const puedeCargar = abierta && fecha >= hoy && puede("pedidos.crear");
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
              <Link href={`/pedidos/nuevo?fecha=${fecha}`} className={clasesBoton(actual ? "principal" : "secundario")}>
                ＋ Cargar un pedido
              </Link>
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
        resumen: !d.lista.armada ? (
          "Sin armar"
        ) : d.lista.desactualizada ? (
          <b>Cambiaron los pedidos: hay que actualizarla</b>
        ) : d.lista.fueraDeLista > 0 ? (
          <b>{plural(d.lista.fueraDeLista, "pedido confirmado quedó afuera", "pedidos confirmados quedaron afuera")}</b>
        ) : (
          plural(d.lista.lineas, "producto", "productos")
        ),
        acciones: (
          <div className="flex flex-wrap items-start gap-2">
            {abierta && puede("lista_compra.generar") && d.pedidos.confirmados > 0 && (!d.lista.armada || d.lista.desactualizada || d.lista.fueraDeLista > 0) && (
              <FormularioAccion accion={generarListaAccion} boton={d.lista.armada ? (d.lista.fueraDeLista > 0 && !d.lista.desactualizada ? "Agregar todos a la lista" : "Actualizar la lista") : "Armar la lista con todos"} variante={actual ? "principal" : "secundario"}>
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
            {puede("repartos.ver") && e.total > 0 && e.entregadas < e.total && <Enlace href={`/viaje?fecha=${fecha}`}>🧭 Planear el viaje</Enlace>}
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
  const { fecha, hoy, pasos, panel } = dia;
  const avance = Math.round((pasos.hechos / pasos.pasos.length) * 100);

  return (
    <>

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
          const { resumen, acciones } = contenidoDelPaso(p.clave, dia, puede, actual);
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
