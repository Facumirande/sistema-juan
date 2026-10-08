"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useOptimistic, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";

import { formatearMoneda } from "@/dominio/dinero/formato";
import { COLUMNAS_ARRASTRABLES, PASO_SIGUIENTE, accionAlMover, porQueNoSeMueve, resumenDeSeleccion, type ClaveColumna } from "@/dominio/pedidos/tablero";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { ColumnaDelTablero, ProductoDeTarjeta, TarjetaPedido } from "@/modulos/pedidos/tablero";
import { Avatar } from "@/ui/avatar";
import { Checklist, conTildeDeCompra, motivoParaNoTildar, type Tilde } from "@/ui/checklist";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";
import { FONDO_ETIQUETA, dibujoDeCliente, etiquetasDePedido } from "@/ui/etiquetas-tablero";

import { salenAhoraAccion } from "../repartos/acciones";
import {
  armarListaConElegidosAccion,
  cerrarDiaAccion,
  separarProductoAccion,
  asignarElegidosAccion,
  moverTarjetaAccion,
  prioridadElegidosAccion,
  sacarDeListaAccion,
  tildarProductoAccion,
} from "./acciones";

// Tablero de pedidos estilo Trello: una columna de color por etapa y una tarjeta grande por pedido,
// con lo que lleva a la vista, etiquetas, plazo, notas, avance y quién se encarga. Las tarjetas se
// arrastran entre Pedidos, Lista de compras y Comprado (con el mouse o manteniendo el dedo apretado
// en el celular), soltarlas en Preparando empieza a preparar el día, y de Preparando a En camino
// salen a entregar (se termina de preparar, se hace el remito y sale el reparto). En "Lista de compras" se
// tilda en la misma tarjeta lo que ya se compró y lo que no se consiguió. En "Elegir pedidos" se
// marcan varias (o todas) para mandarlas juntas a la lista de compras o a entregar.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
type CambioALaVista = { tipo: "mover"; id: string; hacia: ClaveColumna } | { tipo: "tildar"; listaItemId: string; valor: Tilde } | { tipo: "separar"; entregaItemId: string; separado: boolean };

interface Props {
  fecha: string;
  columnas: ColumnaDelTablero[];
  cancelados: TarjetaPedido[];
  personas: PersonaVisible[];
  yo: string;
  /** "/inicio?fecha=…": las tarjetas se abren agregando `&pedido=…`. */
  base: string;
  /** `salir`: puede mandar pedidos a En camino (arma el reparto y sale). */
  puede: { crear: boolean; armar: boolean; editar: boolean; tildar: boolean; salir: boolean; preparar: boolean; entregar: boolean; cerrar: boolean };
  /** El día ya está cerrado. */
  cerrado: boolean;
  /** Destino de cada columna para ir a la pantalla de esa etapa. */
  enlaces: Partial<Record<ClaveColumna, { href: string; texto: string }>>;
}

/** El color de cada columna, el mismo de su paso en "Paso a paso" (clases de `globals.css`). */
const COLOR_COLUMNA: Record<ClaveColumna, string> = {
  pedidos: "color-azul",
  en_lista: "color-violeta",
  comprados: "color-naranja",
  preparando: "color-amarillo",
  en_camino: "color-verde",
  entregados: "color-rosa",
};

const PRODUCTOS_A_LA_VISTA = 4;
/** Cuánto hay que mantener el dedo apretado para levantar una tarjeta (si se mueve antes, es un deslizamiento). */
const ESPERA_AL_TOCAR = 260;

const PLAZO: Record<TarjetaPedido["estadoPlazo"], string> = {
  listo: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]",
  vencido: "bg-[var(--vence-fondo)] text-[var(--vence-texto)]",
  pronto: "bg-[var(--pronto-fondo)] text-[var(--pronto-texto)]",
  a_tiempo: "bg-black/5 dark:bg-white/10",
};

const sinProductos = (t: TarjetaPedido) => ({
  ok: false,
  mensaje: `${t.cliente} (${t.numero}) todavía no tiene productos: cargale lo que lleva y después mandalo a la lista de compras.`,
  enlace: { href: `/pedidos/${t.id}/cambiar`, texto: `Agregar productos a ${t.cliente}` },
});

/** Cómo se ve el tablero mientras el servidor guarda: la tarjeta ya en su columna y el producto ya tildado. */
function conElCambio(columnas: ColumnaDelTablero[], cambio: CambioALaVista): ColumnaDelTablero[] {
  const tarjetas = columnas
    .flatMap((c) => c.tarjetas)
    .map((t): TarjetaPedido => {
      if (cambio.tipo === "mover") {
        if (t.id !== cambio.id) return t;
        // Al pasar a Comprado queda todo tildado; al volver a la lista, se van los tildes puestos a mano.
        const productos = t.productos.map((p): ProductoDeTarjeta =>
          cambio.hacia === "comprados" && !p.hecha ? { ...p, hecha: true, compra: "COMPRADO", tildado: true } : cambio.hacia === "en_lista" && p.tildado ? { ...p, hecha: false, compra: "PENDIENTE", tildado: false } : p,
        );
        return { ...t, columna: cambio.hacia, productos };
      }
      if (cambio.tipo === "separar") {
        if (!t.productos.some((p) => p.entregaItemId === cambio.entregaItemId)) return t;
        const productos = t.productos.map((p): ProductoDeTarjeta => (p.entregaItemId === cambio.entregaItemId ? { ...p, hecha: cambio.separado } : p));
        return { ...t, productos, avance: t.avance ? { ...t.avance, hechos: productos.filter((p) => p.hecha).length } : t.avance };
      }
      if (!t.productos.some((p) => p.listaItemId === cambio.listaItemId)) return t;
      const productos = t.productos.map((p): ProductoDeTarjeta =>
        p.listaItemId === cambio.listaItemId ? conTildeDeCompra(p, cambio.valor) : p,
      );
      const enCompra = t.columna === "en_lista" || t.columna === "comprados";
      return {
        ...t,
        productos,
        columna: enCompra ? (productos.every((p) => p.hecha) ? "comprados" : "en_lista") : t.columna,
        avance: t.avance ? { ...t.avance, hechos: productos.filter((p) => p.hecha).length } : t.avance,
      };
    });
  return columnas.map((c) => ({ ...c, tarjetas: tarjetas.filter((t) => t.columna === c.clave) }));
}

function Insignias({ t }: { t: TarjetaPedido }) {
  const avanceCompleto = t.avance && t.avance.total > 0 && t.avance.hechos === t.avance.total;
  if (!t.plazo && t.notas.total === 0 && !(t.avance && t.avance.total > 0) && !(t.totalEstimado !== null && t.lineas > 0)) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-tarjeta-suave @[18rem]:gap-x-3">
      {t.plazo && (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${PLAZO[t.estadoPlazo]}`} title={`Plazo: ${t.plazo}`}>
          <span aria-hidden>⏰</span>
          {t.entregaHasta ? `antes ${t.entregaHasta}` : `desde ${t.entregaDesde}`}
          {t.estadoPlazo === "vencido" && <span className="font-bold">· vencido</span>}
        </span>
      )}
      {t.notas.total > 0 && (
        <span className={`inline-flex items-center gap-1 ${t.notas.sinLeer ? "font-bold text-tarjeta-texto" : ""}`} title={t.notas.sinLeer ? `${t.notas.sinLeer} sin leer` : "Notas"}>
          <span aria-hidden>💬</span>
          {t.notas.total}
          {t.notas.sinLeer > 0 && <span className="size-2.5 rounded-full bg-[var(--etiqueta-azul)]" aria-label="sin leer" />}
        </span>
      )}
      {t.avance && t.avance.total > 0 && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${avanceCompleto ? "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" : "bg-black/5 dark:bg-white/10"}`}
          title={`${t.avance.que === "comprado" ? "Comprado" : "Preparado"}: ${t.avance.hechos} de ${t.avance.total}`}
        >
          <span aria-hidden>☑</span>
          {t.avance.hechos}/{t.avance.total} {t.avance.que === "comprado" ? "comprado" : "preparado"}
        </span>
      )}
      {t.totalEstimado !== null && t.lineas > 0 && <span className="ml-auto font-semibold text-tarjeta-texto tabular-nums">{formatearMoneda(t.totalEstimado)}</span>}
    </div>
  );
}

function Tarjeta({
  t,
  href,
  eligiendo = false,
  elegida = false,
  alElegir,
  alTildar,
  alSeparar,
  siguiente,
}: {
  t: TarjetaPedido;
  href: string;
  eligiendo?: boolean;
  elegida?: boolean;
  alElegir?: () => void;
  /** Con esto, los productos se pueden tildar en la tarjeta (columnas Lista de compras y Comprado). */
  alTildar?: (p: ProductoDeTarjeta, valor: Tilde) => void;
  /** Con esto, los productos se tildan como separados en la tarjeta (columna Preparando). */
  alSeparar?: (p: ProductoDeTarjeta, separado: boolean) => void;
  /** El botón verde que la hace avanzar al paso que sigue. */
  siguiente?: { texto: string; alTocar: () => void; ocupado: boolean } | null;
}) {
  const etiquetas = etiquetasDePedido(t);
  // El mismo checklist en todas las columnas: con tildes donde se compra o se prepara, y a la vista en las demás.
  const conTildes = Boolean(alTildar || alSeparar);
  const productos = (
    <Checklist
      productos={t.productos}
      modo={alTildar ? "compra" : alSeparar ? "separar" : t.columna === "preparando" ? "visto" : "ver"}
      alTildar={alTildar}
      alSeparar={alSeparar}
      tono="columna"
      limite={conTildes || t.columna === "preparando" ? undefined : PRODUCTOS_A_LA_VISTA}
      className={conTildes || t.columna === "preparando" ? "max-h-[32rem] overflow-y-auto overscroll-contain [scrollbar-width:thin]" : ""}
      etiqueta={`Lo que lleva ${t.cliente}${alTildar ? ": tildá lo que ya se compró" : alSeparar ? ": tildá lo que ya separaste" : ""}`}
    />
  );
  const cabecera = (
    <div className="flex items-center gap-2 bg-[var(--col-fuerte)] px-2 py-2 text-[var(--col-fuerte-texto)] @[18rem]:gap-3 @[18rem]:px-3 @[18rem]:py-2.5">
      <span aria-hidden className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-2xl @[18rem]:flex">
        {dibujoDeCliente(t.tipoCliente)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight font-bold [overflow-wrap:anywhere] @[18rem]:text-xl">{t.cliente}</p>
        <p className="text-sm opacity-90">
          {t.numero}
          {t.observaciones && <span title={t.observaciones}> · 📝 con nota</span>}
        </p>
      </div>
      {t.responsable && (
        <span title={`Se encarga ${t.responsable.nombre}`} className="shrink-0">
          <Avatar persona={t.responsable} tamano="chico" />
        </span>
      )}
    </div>
  );
  const etiquetasALaVista = etiquetas.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {etiquetas.map((e) => (
        <span key={e.texto} className={`rounded-md px-2 py-0.5 text-xs leading-5 font-bold text-etiqueta-texto ${FONDO_ETIQUETA[e.color]}`}>
          {e.texto}
        </span>
      ))}
    </div>
  );
  const vacia = <p className="rounded-lg bg-[var(--pronto-fondo)] px-3 py-2 text-sm font-semibold text-[var(--pronto-texto)]">🧺 Sin productos todavía · tocá para cargarlos</p>;
  const clases = `block w-full overflow-hidden rounded-xl bg-tarjeta text-left text-tarjeta-texto shadow-tarjeta outline-offset-2 transition-[filter] hover:brightness-[1.03] focus-visible:outline-3 focus-visible:outline-white ${elegida ? "outline-4 outline-white" : ""}`;
  const destino = t.lineas === 0 && t.estado === "BORRADOR" ? `/pedidos/${t.id}/cambiar` : href;

  if (eligiendo) {
    return (
      <label className={`${clases} cursor-pointer`}>
        {cabecera}
        <span className="flex gap-1.5 p-1.5 @[18rem]:gap-3 @[18rem]:p-3">
          <input type="checkbox" checked={elegida} onChange={alElegir} className="mt-1 size-6 shrink-0" aria-label={`Elegir ${t.numero} de ${t.cliente}`} />
          <span className="flex min-w-0 flex-1 flex-col gap-2 @[18rem]:gap-3">
            {etiquetasALaVista}
            {t.productos.length > 0 ? productos : vacia}
            <Insignias t={t} />
          </span>
        </span>
      </label>
    );
  }
  const botonSiguiente = siguiente && t.productos.length > 0 && (
    <button
      type="button"
      data-sin-arrastre
      disabled={siguiente.ocupado}
      onClick={siguiente.alTocar}
      className="flex min-h-14 w-full items-center justify-center rounded-xl bg-marca px-2 py-2 text-center text-base leading-tight font-extrabold text-balance text-marca-texto shadow-sm hover:brightness-110 disabled:animate-pulse disabled:opacity-70 @[18rem]:px-3 @[18rem]:text-lg"
    >
      {siguiente.texto}
      {"\u00a0→"}
    </button>
  );
  if ((alTildar || alSeparar || botonSiguiente) && t.productos.length > 0) {
    // Los tildes y el botón verde son botones: no pueden ir dentro del enlace que abre la tarjeta.
    return (
      <article className={clases}>
        <Link href={destino} scroll={false} draggable={false} className="block" aria-label={`Abrir ${t.numero} de ${t.cliente}`}>
          {cabecera}
        </Link>
        <div className="flex flex-col gap-2 p-1.5 @[18rem]:gap-3 @[18rem]:p-3">
          {etiquetasALaVista}
          {productos}
          <Link href={destino} scroll={false} draggable={false} className="block empty:hidden">
            <Insignias t={t} />
          </Link>
          {botonSiguiente}
        </div>
      </article>
    );
  }
  return (
    <Link href={destino} scroll={false} draggable={false} className={clases}>
      {cabecera}
      <span className="flex flex-col gap-2 p-1.5 @[18rem]:gap-3 @[18rem]:p-3">
        {etiquetasALaVista}
        {t.productos.length > 0 ? productos : vacia}
        <Insignias t={t} />
      </span>
    </Link>
  );
}

function Aviso({ estado, cerrar, confirmar }: { estado: EstadoAccion; cerrar: () => void; confirmar: (() => void) | null }) {
  return (
    <div
      role={estado.ok ? "status" : "alert"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-medium shadow-tarjeta ${estado.ok ? "bg-tarjeta text-tarjeta-texto" : "bg-[var(--vence-fondo)] text-[var(--vence-texto)]"}`}
    >
      <span className="min-w-0 flex-1">{estado.mensaje}</span>
      {estado.requiereConfirmacion && confirmar && (
        <button type="button" onClick={confirmar} className="rounded-lg bg-[#172b4d] px-4 py-2 font-semibold text-white shadow-sm">
          Confirmar
        </button>
      )}
      {estado.enlace && (
        <Link href={estado.enlace.href} className="rounded-lg bg-white px-4 py-2 font-semibold text-[#172b4d] shadow-sm">
          {estado.enlace.texto}
          {"\u00a0→"}
        </Link>
      )}
      <button type="button" onClick={cerrar} aria-label="Cerrar el aviso" className="flex size-9 items-center justify-center rounded-full text-xl leading-none hover:bg-black/10">
        ×
      </button>
    </div>
  );
}

/** Una tarjeta agarrada: dónde se tocó y por dónde va el puntero. */
interface Agarre {
  id: string;
  desde: ClaveColumna;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** Dónde se agarró la tarjeta, para que no salte al levantarla. */
  dx: number;
  dy: number;
  ancho: number;
  /** Con el dedo: se levanta al mantener apretado. Con el mouse: al empezar a moverla. */
  tactil: boolean;
  levantada: boolean;
  reloj: ReturnType<typeof setTimeout> | null;
}

export function TableroTrello({ fecha, columnas: columnasGuardadas, cancelados, personas, yo, base, puede, cerrado, enlaces }: Props) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [filtroPersona, setFiltroPersona] = useState<string | null>(null);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [arrastrando, setArrastrando] = useState<{ id: string; desde: ClaveColumna; ancho: number } | null>(null);
  const [sobre, setSobre] = useState<ClaveColumna | null>(null);
  const [llegada, setLlegada] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  // Lo último que se mandó, para reenviarlo con "Confirmar" si el servidor lo pide.
  const [ultimo, setUltimo] = useState<{ accion: Accion; datos: Record<string, string | string[]>; opciones: { aLaVista?: CambioALaVista; despues?: () => void } } | null>(null);
  const [pendiente, empezar] = useTransition();
  const [verCancelados, setVerCancelados] = useState(false);
  const [columnas, mostrarCambio] = useOptimistic(columnasGuardadas, conElCambio);

  const agarre = useRef<Agarre | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cuadro = useRef<number | null>(null);
  const recienSolto = useRef(false);

  const todas = useMemo(() => columnas.flatMap((c) => c.tarjetas), [columnas]);
  const pasaFiltro = (t: TarjetaPedido) => (!filtroPersona || t.responsable?.id === filtroPersona) && (!soloUrgentes || t.prioridad === "ALTA");
  const elegidasTarjetas = todas.filter((t) => elegidas.has(t.id));
  // El día está para cerrar cuando hay pedidos y todos quedaron entregados.
  const todoEntregado = todas.length > 0 && todas.every((t) => t.columna === "entregados");
  const resumen = resumenDeSeleccion(elegidasTarjetas);

  const ejecutar = (accion: Accion, datos: Record<string, string | string[]>, opciones: { aLaVista?: CambioALaVista; despues?: () => void } = {}) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    setUltimo({ accion, datos, opciones });
    empezar(async () => {
      if (opciones.aLaVista) mostrarCambio(opciones.aLaVista);
      const r = await accion(ESTADO_INICIAL, fd);
      // Lo que sale bien se ve en el tablero y no dice nada. Solo hay cartel cuando algo no se pudo
      // hacer: ahí dice por qué y qué hay que hacer.
      setMensaje(r.ok ? ESTADO_INICIAL : r.mensaje ? r : { ok: false, mensaje: "No se pudo guardar: revisá la conexión y probá de nuevo." });
      if (r.ok) opciones.despues?.();
    });
  };
  const confirmarUltimo = ultimo ? () => ejecutar(ultimo.accion, { ...ultimo.datos, confirmarVariacion: "on" }, ultimo.opciones) : null;
  const alternar = (id: string) =>
    setElegidas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(id)) nuevas.delete(id);
      else nuevas.add(id);
      return nuevas;
    });
  const elegirColumna = (col: ColumnaDelTablero) =>
    setElegidas((previas) => {
      const visibles = col.tarjetas.filter(pasaFiltro).map((t) => t.id);
      const todasElegidas = visibles.every((id) => previas.has(id));
      const nuevas = new Set(previas);
      for (const id of visibles) {
        if (todasElegidas) nuevas.delete(id);
        else nuevas.add(id);
      }
      return nuevas;
    });
  const pendientesDeCompra = todas.filter((t) => t.columna === "pedidos" && pasaFiltro(t));
  const vacios = pendientesDeCompra.filter((t) => t.lineas === 0);
  const elegirFaltantes = () => {
    setEligiendo(true);
    setElegidas(new Set(pendientesDeCompra.filter((t) => t.lineas > 0).map((t) => t.id)));
    if (vacios.length > 0) {
      setMensaje({
        ok: false,
        mensaje:
          vacios.length === 1
            ? `${vacios[0]!.cliente} quedó afuera porque todavía no tiene productos: cargale lo que lleva.`
            : `Quedaron afuera ${vacios.length} pedidos sin productos (${vacios.map((t) => t.cliente).join(", ")}): cargales lo que llevan.`,
        enlace: { href: `/pedidos/${vacios[0]!.id}/cambiar`, texto: `Agregar productos a ${vacios[0]!.cliente}` },
      });
    }
  };
  const terminar = () => {
    setElegidas(new Set());
    setEligiendo(false);
  };

  const tildar = (p: ProductoDeTarjeta, valor: Tilde) => {
    const motivo = motivoParaNoTildar(p, valor, fecha);
    if (motivo || !p.listaItemId) {
      if (motivo) setMensaje({ ok: false, ...motivo });
      return;
    }
    ejecutar(tildarProductoAccion, { itemId: p.listaItemId, valor, desde: p.compra ?? "" }, { aLaVista: { tipo: "tildar", listaItemId: p.listaItemId, valor } });
  };

  const separar = (p: ProductoDeTarjeta, separado: boolean) => {
    if (!p.entregaItemId) return;
    ejecutar(separarProductoAccion, { itemId: p.entregaItemId, separado: separado ? "si" : "no" }, { aLaVista: { tipo: "separar", entregaItemId: p.entregaItemId, separado } });
  };
  /** Quién puede hacer avanzar una tarjeta de cada columna. */
  const puedeAvanzar: Record<ClaveColumna, boolean> = { pedidos: puede.armar, en_lista: puede.tildar, comprados: puede.preparar, preparando: puede.salir, en_camino: puede.entregar, entregados: false };

  const soltar = (id: string, desde: ClaveColumna, hacia: ClaveColumna) => {
    const tarjeta = todas.find((t) => t.id === id);
    if (!tarjeta || desde === hacia) return;
    const accion = accionAlMover(desde, hacia);
    if (!accion) {
      const r = porQueNoSeMueve(desde, hacia);
      setMensaje({ ok: false, mensaje: r.mensaje, enlace: r.ir === "viaje" ? { href: `/viaje?fecha=${fecha}`, texto: "🚚 Ir a Logística" } : { href: `/preparacion/${fecha}`, texto: "📦 Ir a preparar" } });
      return;
    }
    if (tarjeta.lineas === 0 && desde === "pedidos") {
      setMensaje(sinProductos(tarjeta));
      return;
    }
    setLlegada(id);
    setTimeout(() => setLlegada((actual) => (actual === id ? null : actual)), 500);
    ejecutar(moverTarjetaAccion, { pedido: id, desde, hacia }, { aLaVista: { tipo: "mover", id, hacia } });
  };

  // ——— Arrastrar con el mouse o con el dedo ———
  const columnaEn = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-columna]")?.dataset.columna as ClaveColumna | undefined) ?? null;
  const ubicar = () => {
    const a = agarre.current;
    if (!a?.levantada) return;
    if (fantasma.current) fantasma.current.style.transform = `translate3d(${a.x - a.dx}px, ${a.y - a.dy}px, 0)`;
    setSobre(columnaEn(a.x, a.y));
  };
  /** Cerca de los bordes, el tablero se corre solo para llegar a las otras columnas. */
  const correrTablero = () => {
    const a = agarre.current;
    const tablero = caja.current;
    if (!a?.levantada || !tablero) {
      cuadro.current = null;
      return;
    }
    const r = tablero.getBoundingClientRect();
    const borde = 72;
    const empuje = (punto: number, desde: number, hasta: number) => (punto < desde + borde ? punto - desde - borde : punto > hasta - borde ? punto - (hasta - borde) : 0);
    const paso = (e: number) => Math.max(-26, Math.min(26, e * 0.4));
    const [dx, dy] = [empuje(a.x, r.left, r.right), empuje(a.y, r.top, r.bottom)];
    if (dx !== 0 || dy !== 0) {
      tablero.scrollLeft += paso(dx);
      tablero.scrollTop += paso(dy);
      setSobre(columnaEn(a.x, a.y));
    }
    cuadro.current = requestAnimationFrame(correrTablero);
  };
  const levantar = () => {
    const a = agarre.current;
    if (!a || a.levantada) return;
    if (a.reloj) clearTimeout(a.reloj);
    a.levantada = true;
    setArrastrando({ id: a.id, desde: a.desde, ancho: a.ancho });
    if (a.tactil) navigator.vibrate?.(12);
    if (cuadro.current === null) cuadro.current = requestAnimationFrame(correrTablero);
  };
  const dejar = (x: number, y: number, soltarla: boolean) => {
    const a = agarre.current;
    if (!a) return;
    if (a.reloj) clearTimeout(a.reloj);
    agarre.current = null;
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
    if (!a.levantada) return;
    // El clic que llega al soltar no tiene que abrir la tarjeta.
    recienSolto.current = true;
    setTimeout(() => (recienSolto.current = false), 120);
    const hacia = soltarla ? columnaEn(x, y) : null;
    setArrastrando(null);
    setSobre(null);
    if (hacia) soltar(a.id, a.desde, hacia);
  };
  const seguir = (x: number, y: number) => {
    const a = agarre.current;
    if (!a) return;
    a.x = x;
    a.y = y;
    if (!a.levantada) {
      const lejos = Math.hypot(x - a.x0, y - a.y0);
      if (a.tactil) {
        // Se movió antes de tiempo: está deslizando la pantalla, no levantando la tarjeta.
        if (lejos > 10) dejar(x, y, false);
        return;
      }
      if (lejos < 6) return;
      levantar();
    }
    ubicar();
  };
  const agarrar = (e: EventoPuntero<HTMLElement>, t: TarjetaPedido, desde: ClaveColumna) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-sin-arrastre]")) return;
    // Si quedó una tarjeta agarrada (se soltó afuera de la ventana), se la deja antes de agarrar otra.
    if (agarre.current) dejar(e.clientX, e.clientY, false);
    const r = e.currentTarget.getBoundingClientRect();
    const tactil = e.pointerType !== "mouse";
    agarre.current = {
      id: t.id,
      desde,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      ancho: r.width,
      tactil,
      levantada: false,
      reloj: tactil ? setTimeout(() => manejar.current.levantar(), ESPERA_AL_TOCAR) : null,
    };
  };

  // Los avisos del documento llaman siempre a la versión de este dibujo (ven el estado de ahora).
  const manejar = useRef({ seguir, dejar, levantar });
  useEffect(() => {
    manejar.current = { seguir, dejar, levantar };
  });
  useEffect(() => {
    const alMover = (e: PointerEvent) => manejar.current.seguir(e.clientX, e.clientY);
    const alSoltar = (e: PointerEvent) => manejar.current.dejar(e.clientX, e.clientY, true);
    const alCancelar = (e: PointerEvent) => manejar.current.dejar(e.clientX, e.clientY, false);
    // Con la tarjeta levantada, mover el dedo no desliza la pantalla ni abre el menú del enlace.
    const alDeslizar = (e: TouchEvent) => {
      if (agarre.current?.levantada) e.preventDefault();
    };
    const alMenu = (e: Event) => {
      if (agarre.current) e.preventDefault();
    };
    document.addEventListener("pointermove", alMover);
    document.addEventListener("pointerup", alSoltar);
    document.addEventListener("pointercancel", alCancelar);
    document.addEventListener("touchmove", alDeslizar, { passive: false });
    document.addEventListener("contextmenu", alMenu);
    return () => {
      document.removeEventListener("pointermove", alMover);
      document.removeEventListener("pointerup", alSoltar);
      document.removeEventListener("pointercancel", alCancelar);
      document.removeEventListener("touchmove", alDeslizar);
      document.removeEventListener("contextmenu", alMenu);
      if (agarre.current?.reloj) clearTimeout(agarre.current.reloj);
      if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    };
  }, []);
  // Apenas aparece la tarjeta en el aire, va a donde está el puntero.
  useLayoutEffect(() => {
    const a = agarre.current;
    if (arrastrando && a && fantasma.current) fantasma.current.style.transform = `translate3d(${a.x - a.dx}px, ${a.y - a.dy}px, 0)`;
  }, [arrastrando]);

  const enElAire = arrastrando ? (todas.find((t) => t.id === arrastrando.id) ?? null) : null;
  const chip = (activo: boolean) => `min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${activo ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="sin-barra -mx-1 flex shrink-0 items-center gap-2 overflow-x-auto px-1 lg:overflow-visible" role="toolbar" aria-label="Filtros y selección">
        <div className="flex shrink-0 items-center gap-2 lg:flex-1 lg:shrink lg:flex-wrap">
          <span className="shrink-0 text-sm font-medium text-white/90">Ver:</span>
          <button type="button" onClick={() => setFiltroPersona(null)} aria-pressed={filtroPersona === null} className={chip(filtroPersona === null)}>
            Todos
          </button>
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFiltroPersona(filtroPersona === p.id ? null : p.id)}
              aria-pressed={filtroPersona === p.id}
              title={`Solo los de ${p.nombre}`}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full py-0.5 pr-4 pl-1 text-sm font-semibold ${filtroPersona === p.id ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
            >
              <Avatar persona={p} tamano="chico" />
              {p.id === yo ? "Míos" : p.nombre.split(" ")[0]}
            </button>
          ))}
          <button type="button" onClick={() => setSoloUrgentes(!soloUrgentes)} aria-pressed={soloUrgentes} className={chip(soloUrgentes)}>
            🔴 Urgentes
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {puede.armar && pendientesDeCompra.length > vacios.length && !eligiendo && (
            <button type="button" onClick={elegirFaltantes} className="min-h-10 rounded-lg bg-white px-4 text-sm font-semibold text-[#172b4d] hover:bg-white/90">
              🛒 Elegir todos los pedidos para la lista ({pendientesDeCompra.length - vacios.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => (eligiendo ? terminar() : setEligiendo(true))}
            aria-pressed={eligiendo}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${eligiendo ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            {eligiendo ? "Terminar de elegir" : "☑ Elegir pedidos"}
          </button>
          <Link href={`/pedidos/importar?fecha=${fecha}`} className="flex min-h-10 items-center rounded-lg bg-white/20 px-4 text-sm font-semibold text-white hover:bg-white/30" title="Subir pedidos desde una planilla o bajar los del día">
            📊 Excel
          </Link>
        </div>
      </div>

      {/* Mientras el servidor guarda no se traba nada: se puede seguir con otras tarjetas. */}
      {pendiente && (
        <p role="status" className="pointer-events-none fixed right-4 bottom-4 z-40 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white shadow-lg max-sm:bottom-20">
          ⏳ Guardando…
        </p>
      )}
      {mensaje.mensaje && <Aviso estado={mensaje} cerrar={() => setMensaje(ESTADO_INICIAL)} confirmar={pendiente ? null : confirmarUltimo} />}

      <nav aria-label="Ir a una columna" className="sin-barra -mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 md:hidden">
        {columnas.map((col) => (
          <button
            key={col.clave}
            type="button"
            onClick={() => document.getElementById(`lista-${col.clave}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
            className={`${COLOR_COLUMNA[col.clave]} flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--col)] px-4 text-sm font-bold text-[var(--col-texto)]`}
          >
            {col.titulo} <span className="rounded-full bg-black/15 px-2 text-xs">{col.tarjetas.filter(pasaFiltro).length}</span>
          </button>
        ))}
      </nav>

      {/* El tablero ocupa el alto que queda de la pantalla: la página no se desplaza, se desplaza
          adentro de cada columna. Con lugar, las seis columnas van en una fila; con menos ancho, en
          dos filas de tres (cada fila toma el alto que necesita, hasta repartirse el que hay); y en el
          celular van de costado y se deslizan con el dedo. El ancho que
          cuenta es el del tablero, no el de la ventana (consultas de contenedor). */}
      <div className="@container flex min-h-0 flex-1 flex-col gap-2" aria-busy={pendiente}>
        <div
          ref={caja}
          className={`flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-1 ${arrastrando ? "" : "snap-x snap-mandatory"} @[34rem]:grid @[34rem]:snap-none @[34rem]:grid-cols-3 @[34rem]:grid-rows-[repeat(2,minmax(10rem,auto))] @[34rem]:content-start @[34rem]:gap-2 @[34rem]:overflow-x-hidden @[34rem]:overflow-y-auto @[64rem]:grid-cols-6 @[64rem]:grid-rows-1 @[64rem]:overflow-visible`}
        >
        {columnas.map((col) => {
          const visibles = col.tarjetas.filter(pasaFiltro);
          const destino = arrastrando !== null && arrastrando.desde !== col.clave;
          const aceptaSoltar = destino && accionAlMover(arrastrando.desde, col.clave) !== null;
          const encima = destino && sobre === col.clave;
          const todasElegidas = visibles.length > 0 && visibles.every((t) => elegidas.has(t.id));
          // De Preparando se arrastra solo para que salga a entregar (quien puede armar repartos).
          const arrastrable = !eligiendo && COLUMNAS_ARRASTRABLES.includes(col.clave) && (col.clave === "preparando" ? puede.salir : col.clave === "en_camino" || col.clave === "entregados" ? puede.entregar : puede.editar);
          const paso = PASO_SIGUIENTE[col.clave];
          const sinElegir = !(eligiendo && col.seleccionable);
          const seTilda = puede.tildar && (col.clave === "en_lista" || col.clave === "comprados");
          return (
            <section
              key={col.clave}
              id={`lista-${col.clave}`}
              data-columna={col.clave}
              aria-labelledby={`col-${col.clave}`}
              className={`${COLOR_COLUMNA[col.clave]} @container flex max-h-full min-h-0 w-[86%] max-w-[22rem] shrink-0 snap-start flex-col rounded-2xl bg-[var(--col)] text-[var(--col-texto)] shadow-lg outline-offset-2 transition-transform @[34rem]:w-auto @[34rem]:max-w-none @[34rem]:min-w-0 ${
                encima ? (aceptaSoltar ? "scale-[1.02] outline-4 outline-white" : "outline-4 outline-[var(--vence-fondo)]") : aceptaSoltar ? "outline-2 outline-white/80 outline-dashed" : ""
              }`}
            >
              <header className="flex flex-col gap-0.5 px-2.5 pt-2 pb-1.5 @[18rem]:px-3">
                <div className="flex flex-wrap items-start justify-between gap-x-1.5 gap-y-1">
                  <h2 id={`col-${col.clave}`} className="flex-auto text-lg leading-tight font-extrabold @[18rem]:text-xl">
                    {col.titulo} <span className="ml-0.5 rounded-full bg-black/15 px-2 py-0.5 text-sm font-bold">{visibles.length}</span>
                  </h2>
                  {eligiendo && col.seleccionable && visibles.length > 0 ? (
                    <button type="button" onClick={() => elegirColumna(col)} className="shrink-0 rounded-lg bg-black/10 px-2 py-1 text-sm font-semibold hover:bg-black/20">
                      {todasElegidas ? "Ninguno" : "Elegir todos"}
                    </button>
                  ) : (
                    enlaces[col.clave] && (
                      <Link href={enlaces[col.clave]!.href} title={enlaces[col.clave]!.texto} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg bg-black/10 px-2 text-sm font-semibold hover:bg-black/20">
                        {enlaces[col.clave]!.texto} <span aria-hidden>›</span>
                      </Link>
                    )
                  )}
                </div>
                <p className="text-sm leading-snug font-medium opacity-95 @[18rem]:text-base">{col.ayuda}</p>
              </header>
              <ol className="flex min-h-2 flex-col gap-2 overflow-y-auto px-1.5 py-1 [scrollbar-width:thin] @[18rem]:gap-3 @[18rem]:px-3">
                {encima && (
                  <li aria-hidden className={`flex min-h-16 items-center justify-center rounded-xl border-2 border-dashed px-3 text-center font-semibold ${aceptaSoltar ? "border-current/60 bg-white/35" : "border-[var(--vence-fondo)] bg-white/70 text-[var(--vence-fondo)]"}`}>
                    {aceptaSoltar ? "Soltá acá" : "Acá no se puede soltar"}
                  </li>
                )}
                {visibles.map((t) => (
                  <li
                    key={t.id}
                    onPointerDown={arrastrable ? (e) => agarrar(e, t, col.clave) : undefined}
                    onClickCapture={(e) => {
                      if (recienSolto.current) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDragStart={(e) => e.preventDefault()}
                    className={`rounded-xl ${arrastrable ? "tarjeta-arrastrable cursor-grab active:cursor-grabbing" : ""} ${arrastrando?.id === t.id ? "opacity-35 outline-2 outline-current/60 outline-dashed" : ""} ${llegada === t.id ? "tarjeta-recien-llegada" : ""}`}
                  >
                    <Tarjeta
                      t={t}
                      href={`${base}&pedido=${t.id}`}
                      eligiendo={eligiendo && col.seleccionable}
                      elegida={elegidas.has(t.id)}
                      alElegir={() => alternar(t.id)}
                      alTildar={seTilda && sinElegir ? tildar : undefined}
                      alSeparar={col.clave === "preparando" && puede.preparar && sinElegir ? separar : undefined}
                      siguiente={paso && puedeAvanzar[col.clave] && sinElegir && !cerrado ? { texto: paso.texto, alTocar: () => soltar(t.id, col.clave, paso.hacia), ocupado: false } : null}
                    />
                  </li>
                ))}
                {visibles.length === 0 && !encima && <li className="px-1 py-3 font-medium opacity-80">{col.tarjetas.length ? "Nada con este filtro." : col.clave === "en_camino" && puede.salir ? "Acá va lo que sale a entregar." : "Sin pedidos."}</li>}
              </ol>
              <footer className="flex flex-col gap-1 px-2 pt-1.5 pb-2 empty:pb-1 @[18rem]:px-3">
                {col.clave === "entregados" && todoEntregado && (cerrado ? (
                  <p className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black/15 text-base font-bold">🔒 Día cerrado: está todo entregado</p>
                ) : (
                  puede.cerrar && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => ejecutar(cerrarDiaAccion, { fecha })}
                      className="flex min-h-14 w-full items-center justify-center rounded-xl bg-marca px-3 py-2 text-center text-lg leading-tight font-extrabold text-balance text-marca-texto shadow-sm hover:brightness-110 disabled:animate-pulse disabled:opacity-70"
                    >
                      ✓ Está todo entregado: cerrar el día
                    </button>
                  )
                ))}
              </footer>
            </section>
          );
        })}
        </div>
        {cancelados.length > 0 && (
          <section className="shrink-0 rounded-2xl bg-black/25 p-2 text-white">
            <button type="button" onClick={() => setVerCancelados(!verCancelados)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 font-semibold hover:bg-white/10">
              Cancelados ({cancelados.length}) <span aria-hidden>{verCancelados ? "▾" : "▸"}</span>
            </button>
            {verCancelados && (
              <ul className="mt-2 flex flex-wrap gap-2 opacity-80">
                {cancelados.map((t) => (
                  <li key={t.id}>
                    <Link href={`${base}&pedido=${t.id}`} scroll={false} className="block rounded-lg bg-tarjeta px-3 py-2 text-tarjeta-texto line-through shadow-tarjeta">
                      {t.cliente} · {t.numero}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {arrastrando && enElAire && (
        <div ref={fantasma} aria-hidden className={`${COLOR_COLUMNA[arrastrando.desde]} @container pointer-events-none fixed top-0 left-0 z-50 will-change-transform`} style={{ width: arrastrando.ancho }}>
          <div className="tarjeta-en-el-aire">
            <Tarjeta t={enElAire} href="#" />
          </div>
        </div>
      )}

      {puede.crear && !eligiendo && !arrastrando && (
        <Link
          href={`/pedidos/nuevo?fecha=${fecha}`}
          className="fixed right-4 bottom-5 z-40 flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-semibold text-[#172b4d] shadow-xl ring-1 ring-black/10 sm:hidden"
        >
          <span aria-hidden className="text-2xl leading-none">
            ＋
          </span>
          Nuevo pedido
        </Link>
      )}

      {eligiendo && elegidas.size > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-2xl bg-tarjeta p-4 text-tarjeta-texto shadow-lg ring-1 ring-black/10">
          <span className="text-lg font-semibold">
            {elegidas.size} {elegidas.size === 1 ? "elegido" : "elegidos"}
          </span>
          <span className="flex-1" />
          {puede.armar && resumen.paraLista > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(armarListaConElegidosAccion, { pedido: [...elegidas] }, { despues: terminar })} className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60">
              🛒 Mandar a la lista de compras ({resumen.paraLista})
            </button>
          )}
          {puede.salir && resumen.paraSalir > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(salenAhoraAccion, { pedido: elegidasTarjetas.filter((t) => t.columna === "preparando").map((t) => t.id) }, { despues: terminar })}
              className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60"
            >
              🚚 Salen ahora ({resumen.paraSalir})
            </button>
          )}
          {puede.armar && resumen.paraSacar > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(sacarDeListaAccion, { pedido: [...elegidas].filter((id) => todas.find((t) => t.id === id)?.estado === "EN_COMPRA") }, { despues: terminar })}
              className="min-h-12 rounded-xl border-2 border-borde px-4 font-semibold disabled:opacity-60"
            >
              Sacar de la lista ({resumen.paraSacar})
            </button>
          )}
          {puede.editar && (
            <>
              <label className="flex items-center gap-2">
                Prioridad
                <select
                  defaultValue=""
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value) ejecutar(prioridadElegidosAccion, { pedido: [...elegidas], prioridad: e.target.value });
                    e.target.value = "";
                  }}
                  className="h-12 rounded-xl border-2 border-borde bg-tarjeta px-2"
                >
                  <option value="">Elegir…</option>
                  <option value="ALTA">🔴 Urgente</option>
                  <option value="NORMAL">⚪ Normal</option>
                  <option value="BAJA">🔵 Sin apuro</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Se encarga
                <select
                  defaultValue="-"
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value !== "-") ejecutar(asignarElegidosAccion, { pedido: [...elegidas], usuarioId: e.target.value });
                    e.target.value = "-";
                  }}
                  className="h-12 rounded-xl border-2 border-borde bg-tarjeta px-2"
                >
                  <option value="-">Elegir…</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === yo ? `Yo (${p.nombre.split(" ")[0]})` : p.nombre}
                    </option>
                  ))}
                  <option value="">Nadie</option>
                </select>
              </label>
            </>
          )}
          <button type="button" onClick={terminar} className="min-h-12 rounded-xl px-4 text-tarjeta-suave hover:bg-black/5">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
