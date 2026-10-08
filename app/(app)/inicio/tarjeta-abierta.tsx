import Link from "next/link";
import type { ReactNode } from "react";

import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { enlaceWaze, enlacesGoogleMaps } from "@/dominio/entregas/navegacion";
import { COLUMNAS, PASO_ANTERIOR, PASO_SIGUIENTE, columnaDeTarjeta, textoPlazo, type ClaveColumna } from "@/dominio/pedidos/tablero";
import type { EntradaActividad } from "@/modulos/colaboracion/actividad";
import type { NotaVisible } from "@/modulos/colaboracion/notas";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { DetallePedido } from "@/modulos/pedidos/pedidos";
import type { avanceDeTarjeta } from "@/modulos/pedidos/tablero";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { Checklist, type ProductoDeChecklist } from "@/ui/checklist";
import { ESTADOS_PEDIDO, fechaConDia } from "@/ui/etiquetas";
import { FONDO_ETIQUETA, dibujoDeCliente, etiquetasDePedido } from "@/ui/etiquetas-tablero";
import { FormularioAccion } from "@/ui/formulario-accion";
import { FlechaNavegacion } from "@/ui/iconos";

import { HiloDeNotas } from "../actividad/notas";
import { asignarElegidosAccion, moverTarjetaAccion, plazoAccion, prioridadElegidosAccion, sacarDeListaAccion } from "./acciones";
import { ChecklistVivo, type ParaComprar } from "./checklist-vivo";

// La tarjeta abierta (como en Trello), grande y despejada: primero lo que lleva el pedido, con el
// mismo checklist de la tarjeta cerrada (se tilda ahí mismo lo comprado o lo separado) y el botón
// para cambiarlo; después dónde se entrega, las notas entre las personas y el historial. Al
// costado, el botón verde del paso que sigue y lo demás que se puede hacer. En el celular, donde
// todo va en una columna, el botón verde queda fijo abajo: siempre a mano, sin bajar hasta el final.

type Avance = Awaited<ReturnType<typeof avanceDeTarjeta>>;

const PLAZO: Record<Avance["estadoPlazo"], string> = {
  listo: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]",
  vencido: "bg-[var(--vence-fondo)] text-[var(--vence-texto)]",
  pronto: "bg-[var(--pronto-fondo)] text-[var(--pronto-texto)]",
  a_tiempo: "bg-black/10 dark:bg-white/10",
};
const EN_PALABRAS_PLAZO: Record<Avance["estadoPlazo"], string> = { listo: "entregado", vencido: "vencido", pronto: "por vencer", a_tiempo: "a tiempo" };
const SE_CAMBIA = ["BORRADOR", "CONFIRMADO", "EN_COMPRA"];

function Seccion({ icono, titulo, derecha, children }: { icono: string; titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {icono}
        </span>
        <h3 className="flex-1 text-xl font-semibold">{titulo}</h3>
        {derecha}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:pl-10">{children}</div>
    </section>
  );
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-tarjeta-suave">{titulo}</p>
      {children}
    </div>
  );
}

const botonLateral = "flex min-h-12 w-full items-center gap-2 rounded-xl bg-black/5 px-4 text-left text-base font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15";
const botonVerde = "flex min-h-16 w-full items-center justify-center rounded-xl bg-marca px-3 py-2 text-center text-xl leading-tight font-extrabold text-balance text-marca-texto shadow-sm hover:brightness-110";
/** Qué permiso hace falta para volver atrás una tarjeta que ya se está preparando, salió o se entregó. */
const PERMISO_PARA_VOLVER: Readonly<Record<ClaveColumna, Permiso | null>> = {
  pedidos: null,
  en_lista: null,
  comprados: null,
  preparando: "preparacion.registrar",
  en_camino: "repartos.gestionar",
  entregados: "entregas.confirmar",
};
/** Qué permiso hace falta para hacer avanzar una tarjeta de cada columna (el mismo criterio que el tablero). */
const PERMISO_PARA_AVANZAR: Readonly<Record<ClaveColumna, Permiso | null>> = {
  pedidos: "lista_compra.generar",
  en_lista: "lista_compra.editar",
  comprados: "preparacion.registrar",
  preparando: "repartos.gestionar",
  en_camino: "entregas.confirmar",
  entregados: null,
};

export function TarjetaAbierta({
  pedido: p,
  avance,
  notas,
  historial,
  yo,
  zonaHoraria,
  puede,
  paraComprar,
}: {
  pedido: DetallePedido;
  avance: Avance;
  notas: { notas: NotaVisible[]; personas: PersonaVisible[] };
  historial: EntradaActividad[];
  yo: string;
  zonaHoraria: string;
  puede: (permiso: Permiso) => boolean;
  /** Con esto, cada producto tiene su "$" para anotar el precio y el proveedor (mientras se compra). */
  paraComprar?: ParaComprar | null;
}) {
  const ahora = new Date();
  const columna = COLUMNAS.find((c) => c.clave === columnaDeTarjeta(p.estado, avance.que === "comprado" && avance.lineas.length > 0 && avance.lineas.every((l) => l.hecha), avance.entregaId !== null));
  const etiquetas = etiquetasDePedido({ tipoCliente: p.tipoCliente, prioridad: p.prioridad, esTardio: p.esTardio });
  const plazo = textoPlazo(p.entregaDesde, p.entregaHasta);
  const abierto = p.estado !== "CANCELADO" && p.estado !== "ENTREGADO";
  const editable = abierto && puede("pedidos.editar");
  const cambiable = SE_CAMBIA.includes(p.estado) && puede("pedidos.editar") && (p.estado !== "EN_COMPRA" || puede("pedidos.editar_en_curso"));
  const hechos = avance.lineas.filter((l) => l.hecha).length;
  const vacio = avance.lineas.length === 0;
  const destino = { coordenada: p.coordenada, direccion: p.direccion, localidad: p.localidad };
  const productos: ProductoDeChecklist[] = avance.lineas.map((l) => ({ nombre: l.producto, cantidad: l.cantidad, grupo: l.grupo, hecha: l.hecha, aviso: l.aviso, listaItemId: l.listaItemId, compra: l.compra, tildado: l.tildado, entregaItemId: l.entregaItemId }));
  // Se tilda en la misma tarjeta: la compra mientras está en la lista, lo separado mientras se prepara.
  const seTilda =
    !abierto || vacio
      ? null
      : avance.que === "comprado" && puede("lista_compra.editar")
        ? ("compra" as const)
        : avance.que === "preparado" && puede("preparacion.registrar") && productos.some((x) => x.entregaItemId)
          ? ("separar" as const)
          : null;
  const paso = columna ? PASO_SIGUIENTE[columna.clave] : null;
  const permisoDelPaso = columna ? PERMISO_PARA_AVANZAR[columna.clave] : null;
  const puedeAvanzar = Boolean(paso && columna && !vacio && permisoDelPaso && puede(permisoDelPaso));
  // Un paso atrás, por si la tarjeta se pasó por accidente (de la lista de compras se vuelve con "sacar de la lista").
  const anterior = columna ? PASO_ANTERIOR[columna.clave] : null;
  const permisoParaVolver = columna ? PERMISO_PARA_VOLVER[columna.clave] : null;
  const puedeVolver = Boolean(anterior && permisoParaVolver && puede(permisoParaVolver) && p.estadoJornada !== "CERRADA");

  return (
    <div className="flex flex-col gap-6 p-4 sm:gap-8 sm:p-8">
      <header className="flex items-start gap-3 sm:gap-4 sm:pr-12">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-black/5 text-3xl sm:size-16 sm:text-4xl dark:bg-white/10">
          {dibujoDeCliente(p.tipoCliente)}
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl leading-tight font-semibold sm:text-3xl">{p.cliente}</h2>
          <p className="mt-1 text-base text-tarjeta-suave">
            En <b>{columna?.titulo ?? ESTADOS_PEDIDO[p.estado]}</b> · {p.numero} · se entrega el <b className="text-xl text-tarjeta-texto">{fechaConDia(p.fecha)}</b>
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-wrap gap-x-10 gap-y-4 sm:pl-10">
            <Dato titulo="Se encarga">
              {avance.responsable ? (
                <span className="flex items-center gap-2 text-base">
                  <Avatar persona={avance.responsable} /> {avance.responsable.id === yo ? "Vos" : avance.responsable.nombre}
                </span>
              ) : (
                <span className="text-tarjeta-suave">Nadie</span>
              )}
            </Dato>
            {etiquetas.length > 0 && (
              <Dato titulo="Etiquetas">
                <div className="flex flex-wrap gap-1.5">
                  {etiquetas.map((e) => (
                    <span key={e.texto} className={`rounded-md px-3 py-1 text-sm font-bold text-etiqueta-texto ${FONDO_ETIQUETA[e.color]}`}>
                      {e.texto}
                    </span>
                  ))}
                </div>
              </Dato>
            )}
            <Dato titulo="Plazo">
              {plazo ? (
                <span className={`inline-flex items-center gap-1 rounded-md px-3 py-1 font-medium ${PLAZO[avance.estadoPlazo]}`}>
                  ⏰ {plazo} · {EN_PALABRAS_PLAZO[avance.estadoPlazo]}
                </span>
              ) : (
                <span className="text-tarjeta-suave">Sin horario{p.horarioLugar && ` (el lugar recibe ${p.horarioLugar})`}</span>
              )}
            </Dato>
          </div>

          <Seccion
            icono="🧺"
            titulo={avance.que ? `Lo que lleva · ${hechos} de ${avance.lineas.length} ${avance.que === "comprado" ? "comprados" : "preparados"}` : "Lo que lleva"}
            derecha={
              cambiable && !vacio ? (
                <Link href={`/pedidos/${p.id}/cambiar`} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--etiqueta-azul)] px-4 font-semibold text-etiqueta-texto">
                  ✏️ Cambiar productos
                </Link>
              ) : null
            }
          >
            {avance.que && !vacio && (
              <div className="flex items-center gap-3 text-sm text-tarjeta-suave">
                <span className="shrink-0 whitespace-nowrap tabular-nums">{Math.round((hechos / avance.lineas.length) * 100)} %</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className={`h-2.5 rounded-full ${hechos === avance.lineas.length ? "bg-[var(--listo-fondo)]" : "bg-[var(--etiqueta-azul)]"}`} style={{ width: `${(hechos / avance.lineas.length) * 100}%` }} />
                </div>
              </div>
            )}
            {vacio ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-black/20 p-6 text-center dark:border-white/25">
                <p className="text-lg font-semibold">Este pedido todavía no tiene productos.</p>
                <p className="text-tarjeta-suave">Cargale lo que lleva; después se manda a la lista de compras.</p>
                {cambiable && (
                  <Link href={`/pedidos/${p.id}/cambiar`} className="flex min-h-12 items-center rounded-xl bg-marca px-5 text-lg font-semibold text-marca-texto">
                    ＋ Agregar productos
                  </Link>
                )}
              </div>
            ) : (
              <>
                {seTilda ? (
                  <ChecklistVivo productos={productos} modo={seTilda} fecha={p.fecha} etiqueta={`Lo que lleva ${p.cliente}`} paraComprar={seTilda === "compra" ? paraComprar : null} />
                ) : (
                  <Checklist productos={productos} modo={avance.que ? "visto" : "ver"} tamano="amplio" etiqueta={`Lo que lleva ${p.cliente}`} />
                )}
                {seTilda && <p className="text-sm text-tarjeta-suave">{seTilda === "compra" ? (paraComprar ? "Tildá ✓ lo que ya compraste, o ✕ si no se consiguió. Con el $ anotás a quién se lo compraste y a cuánto: ese precio queda guardado para ese proveedor." : "Tildá ✓ lo que ya compraste, o ✕ si no se consiguió.") : "Tildá ✓ lo que ya separaste para el cliente. Si falta algo, anotalo desde “Anotar lo que falta”."}</p>}
              </>
            )}
            {p.totalEstimado !== null && !vacio && (
              <p className="text-lg">
                Total estimado <b>{formatearMoneda(p.totalEstimado)}</b>
              </p>
            )}
          </Seccion>

          <Seccion icono="📍" titulo="Dónde se entrega">
            <p className="text-base">
              <b>{p.puntoEntrega}</b> · {p.direccion}
              {p.localidad && `, ${p.localidad}`}
              {p.horarioLugar && <span className="block text-tarjeta-suave">Recibe {p.horarioLugar}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={enlacesGoogleMaps([destino])[0]} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl bg-black/5 px-4 font-medium hover:bg-black/10 dark:bg-white/10">
                <FlechaNavegacion /> Cómo llegar (Google Maps)
              </a>
              <a href={enlaceWaze(destino)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-xl bg-black/5 px-4 font-medium hover:bg-black/10 dark:bg-white/10">
                Waze
              </a>
            </div>
          </Seccion>

          {(p.observaciones || p.observacionesInternas) && (
            <Seccion icono="📝" titulo="Nota del pedido">
              {p.observaciones && <p className="text-base whitespace-pre-line">{p.observaciones}</p>}
              {p.observacionesInternas && <p className="whitespace-pre-line text-tarjeta-suave">Internas: {p.observacionesInternas}</p>}
            </Seccion>
          )}

          <Seccion icono="💬" titulo="Notas entre ustedes">
            <HiloDeNotas entidadTipo="PEDIDO" entidadId={p.id} notas={notas.notas} personas={notas.personas} yo={yo} zonaHoraria={zonaHoraria} />
          </Seccion>

          <Seccion icono="🕘" titulo="Historial">
            <ul className="flex flex-col gap-3">
              {historial.map((h) => (
                <li key={h.id} className="flex items-start gap-3">
                  <Avatar persona={h.persona} tamano="chico" />
                  <span>
                    <b>{h.persona.nombre.split(" ")[0]}</b> {h.resumen} <span className="text-sm text-tarjeta-suave">· {tiempoRelativo(h.en, ahora, zonaHoraria)}</span>
                  </span>
                </li>
              ))}
              {historial.length === 0 && <li className="text-tarjeta-suave">Sin movimientos todavía.</li>}
            </ul>
          </Seccion>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            {puedeAvanzar && paso && columna && (
              // En pantallas angostas este mismo botón va fijo abajo (al final de la tarjeta).
              <span className="hidden flex-col lg:flex">
                <BotonAccion accion={moverTarjetaAccion} datos={{ pedido: p.id, desde: columna.clave, hacia: paso.hacia }} className={botonVerde}>
                  {paso.texto}
                  {"\u00a0→"}
                </BotonAccion>
              </span>
            )}
            <p className="text-sm font-semibold text-tarjeta-suave">Otras acciones</p>
            {columna?.clave === "preparando" && avance.entregaId && puede("preparacion.ver") && (
              <Link href={`/preparacion/${p.fecha}/entrega/${avance.entregaId}`} className={botonLateral}>
                ✏️ Anotar lo que falta (o un reemplazo)
              </Link>
            )}
            {(columna?.clave === "en_lista" || columna?.clave === "comprados") && puede("lista_compra.generar") && (
              <BotonAccion accion={sacarDeListaAccion} datos={{ pedido: p.id }} className={botonLateral} confirmar="¿Sacar este pedido de la lista de compras? Vuelve a la columna Pedidos; lo ya comprado queda.">
                ↩ Volver a Pedidos
              </BotonAccion>
            )}
            {puedeVolver && anterior && columna && (
              <BotonAccion accion={moverTarjetaAccion} datos={{ pedido: p.id, desde: columna.clave, hacia: anterior.hacia }} className={botonLateral} titulo="Por si se pasó de columna sin querer">
                {anterior.texto}
              </BotonAccion>
            )}
            {avance.entregaId && ["PREPARADO", "EN_REPARTO", "ENTREGADO"].includes(p.estado) && puede("documentos.imprimir_entrega") && (
              <Link href={`/entregas/${avance.entregaId}/documento/lista-entrega`} className={botonLateral}>
                🧾 Ver o imprimir el remito
              </Link>
            )}
            <Link href={`/pedidos/${p.id}`} className={botonLateral}>
              🗒️ Ver el pedido completo
            </Link>
          </div>
          {editable && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-tarjeta-suave">¿Es urgente?</p>
              {(["ALTA", "NORMAL", "BAJA"] as const).map((pr) => (
                <BotonAccion
                  key={pr}
                  accion={prioridadElegidosAccion}
                  datos={{ pedido: p.id, prioridad: pr }}
                  className={`${botonLateral} ${p.prioridad === pr ? "ring-2 ring-[var(--etiqueta-azul)]" : ""}`}
                >
                  {pr === "ALTA" ? "🔴 Urgente" : pr === "NORMAL" ? "⚪ Normal" : "🔵 Sin apuro"}
                </BotonAccion>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-tarjeta-suave">Se encarga</p>
              {avance.personas.map((persona) => (
                <BotonAccion
                  key={persona.id}
                  accion={asignarElegidosAccion}
                  datos={{ pedido: p.id, usuarioId: persona.id }}
                  className={`${botonLateral} ${avance.responsable?.id === persona.id ? "ring-2 ring-[var(--etiqueta-azul)]" : ""}`}
                >
                  <Avatar persona={persona} tamano="chico" /> {persona.id === yo ? "Yo" : persona.nombre.split(" ")[0]}
                </BotonAccion>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-tarjeta-suave">Horario de entrega</p>
              <FormularioAccion accion={plazoAccion} boton="Guardar horario" variante="secundario" className="flex flex-col gap-3">
                <input type="hidden" name="pedidoId" value={p.id} />
                <label className="flex items-center justify-between gap-2">
                  Desde
                  <input type="time" name="desde" defaultValue={p.entregaDesde ?? ""} className="h-11 rounded-lg border border-borde bg-tarjeta px-2" />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Antes de
                  <input type="time" name="hasta" defaultValue={p.entregaHasta ?? ""} className="h-11 rounded-lg border border-borde bg-tarjeta px-2" />
                </label>
              </FormularioAccion>
            </div>
          )}
        </aside>
      </div>

      {/* En el celular (y en ventanas angostas): el paso que sigue, fijo abajo. */}
      {puedeAvanzar && paso && columna && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col border-t border-black/10 bg-modal px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:-mb-8 sm:px-8 lg:hidden dark:border-white/10">
          <BotonAccion accion={moverTarjetaAccion} datos={{ pedido: p.id, desde: columna.clave, hacia: paso.hacia }} className={botonVerde}>
            {paso.texto}
            {"\u00a0→"}
          </BotonAccion>
        </div>
      )}
    </div>
  );
}
