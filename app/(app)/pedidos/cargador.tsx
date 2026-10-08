"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { ABREVIATURA_UNIDAD, formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import {
  cantidadPermitida,
  coincideBusqueda,
  leerCantidad,
  presentacionInicial,
  sumarCantidad,
  type LineaElegida,
} from "@/dominio/pedidos/carga";
import type { PrioridadPedido } from "@/dominio/pedidos/tablero";
import type { ClienteParaCargar, DatosDeCarga, PedidoDelHistorial, ProductoParaCargar } from "@/modulos/pedidos/carga";
import type { PedidoCargado } from "@/modulos/pedidos/pedidos";
import { NombreDeProducto } from "@/ui/checklist";
import { fechaConDia } from "@/ui/etiquetas";
import { dibujoDeCliente } from "@/ui/etiquetas-tablero";

import { guardarPedidoVisualAccion, historialDeClienteAccion, marcarFrecuenteAccion } from "./acciones";

// Carga visual de pedidos (28/09/2026; compacta desde el 07/10): el cliente y el día van a la misma
// altura y los productos quedan a la vista en un solo recuadro, sin categorías: arriba los
// frecuentes del cliente (la única división) y después todos los demás, del más reciente al menos.
// Cada producto se agrega con su ＋; la cantidad se ajusta con − y + o escribiéndola, y en qué se
// pide (kg, cajón…) se elige con botones solo si el producto tiene varias formas. A la derecha
// (abajo en el celular) queda el resumen con la prioridad, el horario y la nota, y el botón para guardar.

interface Entrada {
  clave: string;
  productoId: string;
  presentacionId: string | null;
  /** Como la escribe la persona, con coma ("2,5"). */
  cantidad: string;
  nota: string;
}

interface Problema {
  mensaje: string;
  enlace?: { href: string; texto: string };
  /** Producto a marcar en rojo. */
  producto?: string;
  /** Sección a la que llevar la vista. */
  seccion?: "cliente" | "dia" | "productos" | "resumen";
}

const PRIORIDADES: readonly { valor: PrioridadPedido; texto: string; icono: string }[] = [
  { valor: "ALTA", texto: "Urgente", icono: "🔴" },
  { valor: "NORMAL", texto: "Normal", icono: "⚪" },
  { valor: "BAJA", texto: "Sin apuro", icono: "🔵" },
];

const HORARIOS: readonly { texto: string; desde: string; hasta: string }[] = [
  { texto: "Sin horario", desde: "", hasta: "" },
  { texto: "Antes de las 8", desde: "", hasta: "08:00" },
  { texto: "Antes de las 10", desde: "", hasta: "10:00" },
  { texto: "Antes de las 12", desde: "", hasta: "12:00" },
];

const ETAPA: Readonly<Record<string, string>> = {
  BORRADOR: "en Pedidos",
  CONFIRMADO: "en Pedidos",
  EN_COMPRA: "en la lista de compras",
  EN_PREPARACION: "preparándose",
  PREPARADO: "preparado",
  EN_REPARTO: "en camino",
};

const DIAS_VISIBLES = 7;
const conComa = (numero: string) => numero.replace(".", ",");
const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
let siguienteClave = 0;
const nuevaClave = () => `e${++siguienteClave}`;

function Paso({ id, n, titulo, ayuda, derecha, children }: { id: string; n: number; titulo: string; ayuda?: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-4 flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-marca-texto">
          {n}
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <h2 id={`${id}-titulo`} className="text-xl leading-tight font-semibold">
            {titulo}
          </h2>
          {ayuda && <p className="text-sm text-texto-suave">{ayuda}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  const dia = fechaConDia(fecha).split(" ")[0] ?? "";
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}

function RecuadroCliente({ c, alElegir }: { c: ClienteParaCargar; alElegir: () => void }) {
  return (
    <button type="button" onClick={alElegir} className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-borde bg-superficie px-3 py-1.5 text-left transition-colors hover:border-marca hover:bg-marca/5">
      <span aria-hidden className="text-lg">
        {dibujoDeCliente(c.tipo)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base leading-tight font-bold">{c.nombre}</span>
        {c.direccion && <span className="block truncate text-xs text-texto-suave">{c.direccion}</span>}
      </span>
    </button>
  );
}

/**
 * La cantidad de un producto del pedido, fácil de cambiar: − y + grandes y el número para escribirlo
 * (al tocarlo queda todo seleccionado: se escribe encima). En qué se pide (kg, cajón, bolsa…) se
 * elige con botones solo si el producto tiene más de una forma; si no, va su única medida.
 */
function Cantidad({ p, entrada, invalida = false, alCambiar, alQuitar }: { p: ProductoParaCargar; entrada: Entrada; invalida?: boolean; alCambiar: (cambios: Partial<Entrada>) => void; alQuitar: () => void }) {
  const unidad = ABREVIATURA_UNIDAD[p.unidadBase];
  const cantidad = leerCantidad(entrada.cantidad);
  const sumar = (paso: string) => {
    const nueva = sumarCantidad(cantidad ?? "0", paso);
    if (nueva === "0") alQuitar();
    else alCambiar({ cantidad: conComa(nueva) });
  };
  const baseId = p.presentaciones.find((x) => x.esUnidadBase)?.id ?? null;
  const otras = p.presentaciones.filter((x) => !x.esUnidadBase);
  const elegida = entrada.presentacionId && entrada.presentacionId !== baseId ? entrada.presentacionId : null;
  const boton = "flex size-12 shrink-0 items-center justify-center rounded-xl bg-marca text-3xl leading-none font-bold text-marca-texto active:scale-95";
  const medida = (activa: boolean) => `min-h-10 rounded-full border-2 px-3 text-sm font-bold ${activa ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca/60"}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className={`flex items-center gap-1 rounded-2xl border-2 bg-superficie p-1 ${invalida ? "border-error" : "border-borde"}`}>
          <button type="button" onClick={() => sumar("-1")} aria-label={`Uno menos de ${p.nombre}`} className={boton}>
            −
          </button>
          <input
            value={entrada.cantidad}
            onChange={(e) => alCambiar({ cantidad: e.target.value })}
            onFocus={(e) => e.target.select()}
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`Cantidad de ${p.nombre}`}
            aria-invalid={invalida}
            className="h-12 w-16 min-w-0 rounded-lg bg-transparent text-center text-2xl font-extrabold tabular-nums focus:bg-marca/10"
          />
          <button type="button" onClick={() => sumar("1")} aria-label={`Uno más de ${p.nombre}`} className={boton}>
            +
          </button>
        </div>
        {otras.length === 0 && <span className="text-lg font-bold text-texto-suave">{unidad}</span>}
      </div>
      {otras.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`En qué se pide ${p.nombre}`}>
          <button type="button" onClick={() => alCambiar({ presentacionId: null })} aria-pressed={elegida === null} className={medida(elegida === null)}>
            {unidad}
          </button>
          {otras.map((x) => (
            <button key={x.id} type="button" onClick={() => alCambiar({ presentacionId: x.id })} aria-pressed={elegida === x.id} className={medida(elegida === x.id)}>
              {x.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Un producto para agregar al pedido: su dibujo y su nombre bien visibles (del mismo tamaño) y su
 * ＋. Una vez agregado queda resaltado en el mismo lugar, con su cantidad para ajustarla ahí mismo.
 */
function RecuadroProducto({
  p,
  entrada,
  marcado,
  alAgregar,
  alCambiar,
  alQuitar,
}: {
  p: ProductoParaCargar;
  entrada: Entrada | undefined;
  marcado: string | null;
  alAgregar: () => void;
  alCambiar: (cambios: Partial<Entrada>) => void;
  alQuitar: () => void;
}) {
  const unidad = ABREVIATURA_UNIDAD[p.unidadBase];
  const inicial = presentacionInicial(p.presentaciones, p.presentacionDefectoId);
  if (!entrada) {
    return (
      <button
        type="button"
        onClick={alAgregar}
        id={`producto-${p.id}`}
        title={`Agregar ${p.nombre} al pedido`}
        className="flex min-h-16 items-center gap-2 rounded-xl border-2 border-borde bg-superficie px-2.5 py-2 text-left transition-colors hover:border-marca hover:bg-marca/5"
      >
        <span className="min-w-0 flex-1">
          <NombreDeProducto nombre={p.nombre} grupo={p.grupo} className="text-xl" />
          <span className="block truncate text-xs text-texto-suave">{inicial && !inicial.esUnidadBase ? inicial.nombre : `por ${unidad}`}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-marca/15 px-2 py-1.5 text-sm font-bold text-marca">
          <span aria-hidden className="text-lg leading-none">
            ＋
          </span>
          <span className="max-sm:sr-only">Agregar</span>
        </span>
      </button>
    );
  }
  return (
    <div id={`producto-${p.id}`} className={`flex flex-col gap-2 rounded-xl border-2 px-2.5 py-2 ${marcado ? "border-error bg-error/5" : "border-marca bg-marca/10"}`}>
      <div className="flex items-center gap-1">
        <span aria-hidden className="text-lg font-bold text-marca">
          ✓
        </span>
        <NombreDeProducto nombre={p.nombre} grupo={p.grupo} className="flex-1 text-xl" />
        <button type="button" onClick={alQuitar} aria-label={`Sacar ${p.nombre} del pedido`} title="Sacarlo del pedido" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
          ✕
        </button>
      </div>
      <Cantidad p={p} entrada={entrada} invalida={Boolean(marcado)} alCambiar={alCambiar} alQuitar={alQuitar} />
      {marcado && (
        <p role="alert" className="text-xs font-medium text-error">
          {marcado}
        </p>
      )}
    </div>
  );
}

export function CargadorDePedido({
  datos,
  fechaInicial,
  clienteInicial,
  puedeConfirmar,
}: {
  datos: DatosDeCarga;
  fechaInicial: string;
  clienteInicial: string | null;
  puedeConfirmar: boolean;
}) {
  const pedido = datos.pedido;
  const editando = pedido !== null;
  const productoPorId = useMemo(() => new Map(datos.productos.map((p) => [p.id, p])), [datos.productos]);

  const inicioEntradas = (): Entrada[] =>
    (pedido?.lineas ?? [])
      .filter((l) => productoPorId.has(l.productoId))
      .map((l) => ({ clave: nuevaClave(), productoId: l.productoId, presentacionId: l.presentacionId, cantidad: conComa(l.cantidad), nota: l.observaciones ?? "" }));

  const [clienteId, setClienteId] = useState<string | null>(pedido?.clienteId ?? (clienteInicial && datos.clientes.some((c) => c.id === clienteInicial) ? clienteInicial : null));
  const [puntoId, setPuntoId] = useState<string | null>(pedido?.puntoEntregaId ?? null);
  const [fecha, setFecha] = useState(pedido?.fecha ?? fechaInicial);
  const [entradas, setEntradas] = useState<Entrada[]>(inicioEntradas);
  const [prioridad, setPrioridad] = useState<PrioridadPedido>(pedido?.prioridad ?? "NORMAL");
  const [desde, setDesde] = useState(pedido?.entregaDesde ?? "");
  const [hasta, setHasta] = useState(pedido?.entregaHasta ?? "");
  const [otroHorario, setOtroHorario] = useState(Boolean(pedido?.entregaDesde) || (pedido?.entregaHasta ? !HORARIOS.some((h) => h.hasta === pedido.entregaHasta && !h.desde) : false));
  const [nota, setNota] = useState(pedido?.observaciones ?? "");
  const [buscarCliente, setBuscarCliente] = useState("");
  const [buscarProducto, setBuscarProducto] = useState("");
  const [problema, setProblema] = useState<Problema | null>(null);
  const [listo, setListo] = useState<PedidoCargado | null>(null);
  const [guardando, empezar] = useTransition();
  // El historial de pedidos del cliente (se pide al abrir el panel) y qué panel está abierto.
  const [panel, setPanel] = useState<"historial" | "frecuentes" | null>(null);
  const [historial, setHistorial] = useState<{ clienteId: string; pedidos: PedidoDelHistorial[]; mensaje: string | null } | null>(null);
  const [, pedirHistorial] = useTransition();

  const cliente = datos.clientes.find((c) => c.id === clienteId) ?? null;
  const punto = cliente?.puntos.find((p) => p.id === puntoId) ?? cliente?.puntos[0] ?? null;
  const dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(datos.hoy, i));
  const yaTiene = !editando && cliente ? cliente.abiertos.filter((a) => a.fecha === fecha) : [];
  const porProducto = new Map(entradas.map((e) => [e.productoId, e]));
  const habituales = (cliente?.habituales ?? []).map((id) => productoPorId.get(id)).filter((p): p is ProductoParaCargar => Boolean(p));
  const clientesVisibles = datos.clientes.filter((c) => coincideBusqueda(`${c.nombre} ${c.direccion ?? ""}`, buscarCliente));
  const productosVisibles = datos.productos.filter((p) => coincideBusqueda(`${p.nombre} ${p.codigo} ${p.categoria ?? ""}`, buscarProducto));
  const buscando = buscarProducto.trim() !== "";
  // Una sola lista, sin categorías: primero lo que se pidió hace menos. Sin búsqueda, lo sugerido va arriba y no se repite abajo.
  const porReciente = [...productosVisibles].sort((a, b) => (b.ultimaVez ?? "").localeCompare(a.ultimaVez ?? "") || a.nombre.localeCompare(b.nombre, "es"));
  const frecuentes = buscando ? [] : habituales;
  const listados = porReciente.filter((p) => !frecuentes.includes(p));
  // Los clientes a los que se les cargó un pedido hace menos, primero.
  const recientes = datos.clientes
    .filter((c) => c.ultimo)
    .sort((a, b) => b.ultimo!.fecha.localeCompare(a.ultimo!.fecha))
    .slice(0, 6);
  const suHistorial = cliente && historial?.clienteId === cliente.id ? historial : null;
  const pedidosDelPanel = (suHistorial?.pedidos ?? []).filter((h) => panel === "historial" || h.frecuente);

  const abrirPanel = (cual: "historial" | "frecuentes") => {
    if (panel === cual) {
      setPanel(null);
      return;
    }
    setPanel(cual);
    if (cliente && historial?.clienteId !== cliente.id) {
      const id = cliente.id;
      pedirHistorial(async () => {
        const r = await historialDeClienteAccion(id);
        setHistorial({ clienteId: id, ...r });
      });
    }
  };
  const alternarEstrella = (h: PedidoDelHistorial) => {
    const frecuente = !h.frecuente;
    const poner = (valor: boolean, mensaje: string | null) => setHistorial((actual) => (actual ? { ...actual, mensaje, pedidos: actual.pedidos.map((x) => (x.id === h.id ? { ...x, frecuente: valor } : x)) } : actual));
    poner(frecuente, null);
    pedirHistorial(async () => {
      const r = await marcarFrecuenteAccion(h.id, frecuente);
      if (!r.ok) poner(!frecuente, r.mensaje ?? "No se pudo guardar la estrella: probá de nuevo.");
    });
  };
  /** Suma al pedido los productos de otro pedido (los que ya están elegidos quedan como están). */
  const sumarLineas = (lineas: readonly LineaElegida[]) => {
    setEntradas((previas) => [
      ...previas,
      ...lineas
        .filter((l) => productoPorId.has(l.productoId) && !previas.some((e) => e.productoId === l.productoId))
        .map((l) => ({ clave: nuevaClave(), productoId: l.productoId, presentacionId: l.presentacionId, cantidad: conComa(l.cantidad), nota: l.observaciones ?? "" })),
    ]);
    setProblema(null);
    setPanel(null);
  };

  const marcar = (p: Problema | null) => {
    setProblema(p);
    if (p?.producto) irA(`producto-${p.producto}`);
    else if (p?.seccion) irA(p.seccion);
  };
  const elegirCliente = (c: ClienteParaCargar) => {
    setClienteId(c.id);
    setPuntoId(c.puntos[0]?.id ?? null);
    setBuscarCliente("");
    setProblema(null);
    setPanel(null);
  };
  const agregar = (p: ProductoParaCargar) => {
    const inicial = presentacionInicial(p.presentaciones, p.presentacionDefectoId);
    setEntradas((previas) => [...previas, { clave: nuevaClave(), productoId: p.id, presentacionId: inicial && !inicial.esUnidadBase ? inicial.id : null, cantidad: "1", nota: "" }]);
    setProblema(null);
  };
  const cambiar = (productoId: string, cambios: Partial<Entrada>) => {
    setEntradas((previas) => previas.map((e) => (e.productoId === productoId ? { ...e, ...cambios } : e)));
    if (problema?.producto === productoId) setProblema(null);
  };
  const quitar = (clave: string) => setEntradas((previas) => previas.filter((e) => e.clave !== clave));
  const recuadro = (p: ProductoParaCargar) => (
    <RecuadroProducto
      key={p.id}
      p={p}
      entrada={porProducto.get(p.id)}
      marcado={problema?.producto === p.id ? problema.mensaje : null}
      alAgregar={() => agregar(p)}
      alCambiar={(c) => cambiar(p.id, c)}
      alQuitar={() => quitar(porProducto.get(p.id)!.clave)}
    />
  );
  const revisar = (): Problema | null => {
    if (!cliente) return { mensaje: "Falta elegir el cliente: tocá su recuadro (o buscalo por el nombre).", seccion: "cliente" };
    if (!punto) {
      return {
        mensaje: `${cliente.nombre} no tiene cargado dónde se le entrega: agregale una dirección en su ficha y volvé.`,
        enlace: { href: `/clientes/${cliente.id}`, texto: "Cargar la dirección" },
        seccion: "cliente",
      };
    }
    if (datos.cerrados.includes(fecha)) return { mensaje: "Ese día ya está cerrado: elegí otro día.", seccion: "dia" };
    if (fecha < datos.hoy) return { mensaje: "Ese día ya pasó: elegí hoy o un día siguiente.", seccion: "dia" };
    if (entradas.length === 0) return { mensaje: "Falta elegir lo que lleva: tocá los recuadros de los productos.", seccion: "productos" };
    for (const e of entradas) {
      const p = productoPorId.get(e.productoId)!;
      const cantidad = leerCantidad(e.cantidad);
      if (!cantidad) return { mensaje: `${p.nombre}: escribí cuánto lleva (por ejemplo 2 o 2,5).`, producto: p.id };
      const factor = p.presentaciones.find((x) => x.id === e.presentacionId)?.factor ?? "1";
      if (!cantidadPermitida(cantidad, factor, p.admiteFraccion)) return { mensaje: `${p.nombre} se pide en unidades enteras: poné una cantidad sin coma.`, producto: p.id };
    }
    if (desde && hasta && desde >= hasta) return { mensaje: "El horario termina antes de empezar: revisá las horas.", seccion: "resumen" };
    return null;
  };

  const guardar = (confirmar: boolean) => {
    const encontrado = revisar();
    if (encontrado) {
      marcar(encontrado);
      return;
    }
    setProblema(null);
    empezar(async () => {
      const r = await guardarPedidoVisualAccion({
        pedidoId: pedido?.id ?? null,
        fecha,
        clienteId: cliente!.id,
        puntoEntregaId: punto?.id ?? null,
        lineas: entradas.map((e) => ({ productoId: e.productoId, presentacionId: e.presentacionId, cantidad: leerCantidad(e.cantidad)!, observaciones: e.nota.trim() || null })),
        prioridad,
        entregaDesde: desde,
        entregaHasta: hasta,
        observaciones: nota,
        confirmar,
      });
      if (r.ok && r.pedido) {
        setListo(r.pedido);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setProblema({ mensaje: r.mensaje ?? "No se pudo guardar. Probá de nuevo.", enlace: r.enlace });
      }
    });
  };
  const cargarOtro = () => {
    setListo(null);
    setClienteId(null);
    setPuntoId(null);
    setEntradas([]);
    setPrioridad("NORMAL");
    setDesde("");
    setHasta("");
    setOtroHorario(false);
    setNota("");
    setProblema(null);
    window.scrollTo({ top: 0 });
  };

  if (listo) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-2xl border border-borde bg-superficie p-6 text-center sm:p-10" role="status">
        <span aria-hidden className="text-7xl leading-none">
          ✅
        </span>
        <h1 className="text-3xl font-semibold">{editando ? "Cambios guardados" : "Pedido guardado"}</h1>
        <p className="text-xl">
          {listo.numero} de <b>{listo.cliente}</b> para el {fechaConDia(listo.fecha)}.
        </p>
        {listo.estado === "CONFIRMADO" && <p className="text-lg text-texto-suave">Quedó en la columna “Pedidos” del tablero: desde ahí se manda a la lista de compras.</p>}
        {listo.totalEstimado !== null && (
          <p className="text-lg">
            Total estimado: <b>{formatearMoneda(listo.totalEstimado)}</b>
          </p>
        )}
        {listo.duplicadoDe && (
          <p className="rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-left text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Ojo: {listo.cliente} ya tenía el pedido {listo.duplicadoDe} para ese día. Si era el mismo pedido, cancelá uno de los dos desde el tablero.
          </p>
        )}
        <div className="flex flex-col items-center gap-3">
          <Link href={`/inicio?fecha=${listo.fecha}`} className="flex min-h-16 items-center rounded-xl bg-marca px-8 text-xl font-bold text-marca-texto shadow-sm hover:opacity-90">
            ← Volver al tablero
          </Link>
          <div className="flex flex-wrap justify-center gap-3">
            {!editando && (
              <button type="button" onClick={cargarOtro} className="min-h-12 rounded-xl border-2 border-marca bg-marca/15 px-5 text-lg font-semibold hover:bg-marca/25">
                ＋ Cargar otro pedido
              </button>
            )}
            {!editando && (
              <Link href={`/pedidos/${listo.pedidoId}/cambiar`} className="flex min-h-12 items-center rounded-xl px-4 text-lg font-medium underline underline-offset-4">
                Cambiar algo de este pedido
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const botonPrincipal = editando ? "✓ Guardar los cambios" : "✓ Guardar el pedido";
  // No hay confirmación a la vista: un pedido guardado ya queda listo para mandarse a la lista de compras.
  const confirmaAlGuardar = puedeConfirmar && (!editando || pedido.estado === "BORRADOR");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{editando ? `Cambiar el pedido ${pedido.numero}` : "Nuevo pedido"}</h1>
          <p className="text-texto-suave">
            {editando
              ? pedido.estado === "EN_COMPRA"
                ? "Ya está en la lista de compras: al guardar, la lista se marca para actualizarla con lo nuevo."
                : "Sumá, cambiá o sacá productos y guardá."
              : "Elegí el cliente y el día, agregá los productos con su ＋ y guardalo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editando && (
            <Link href={`/pedidos/importar?fecha=${fecha}`} className="flex min-h-11 items-center rounded-lg border border-borde px-4 font-semibold">
              📥 Cargar desde Excel
            </Link>
          )}
          <Link href={`/inicio?fecha=${fecha}`} className="flex min-h-12 items-center rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto shadow-sm hover:opacity-90">
            ← Volver al tablero
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="@container flex min-w-0 flex-col gap-4">
          {/* El cliente y el día van a la misma altura apenas hay lugar para los dos. */}
          <div className="grid gap-4 @xl:grid-cols-2">
            <Paso
              id="cliente"
              n={1}
              titulo={cliente ? "Cliente" : "¿Para quién es?"}
              derecha={
                cliente && !editando ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClienteId(null);
                      setPanel(null);
                    }}
                    className="min-h-10 rounded-lg border border-borde px-3 text-sm font-semibold"
                  >
                    Cambiar
                  </button>
                ) : null
              }
            >
              {cliente ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 rounded-xl bg-marca/10 p-3">
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-superficie text-xl">
                      {dibujoDeCliente(cliente.tipo)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xl leading-tight font-bold">{cliente.nombre}</p>
                      {punto ? <p className="truncate text-sm text-texto-suave">📍 {punto.direccion}</p> : <p className="text-sm font-medium text-error">No tiene cargado dónde se le entrega.</p>}
                    </div>
                  </div>
                  {cliente.puntos.length > 1 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-semibold text-texto-suave">¿Dónde se entrega?</p>
                      <div className="flex flex-wrap gap-2">
                        {cliente.puntos.map((pt) => (
                          <button
                            key={pt.id}
                            type="button"
                            onClick={() => setPuntoId(pt.id)}
                            aria-pressed={punto?.id === pt.id}
                            title={pt.direccion}
                            className={`min-h-10 rounded-xl border-2 px-3 text-sm ${punto?.id === pt.id ? "border-marca bg-marca/10 font-bold" : "border-borde font-medium"}`}
                          >
                            {pt.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!punto && (
                    <Link href={`/clientes/${cliente.id}`} className="self-start rounded-lg bg-marca px-4 py-2 font-semibold text-marca-texto">
                      Cargar la dirección →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <input
                    value={buscarCliente}
                    onChange={(e) => setBuscarCliente(e.target.value)}
                    placeholder="🔎 Buscar cliente…"
                    aria-label="Buscar cliente"
                    className="h-11 rounded-xl border-2 border-borde bg-superficie px-3"
                  />
                  {!buscarCliente.trim() && recientes.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-sm font-semibold text-texto-suave">🕘 Clientes recientes</h3>
                      <div className="flex flex-wrap gap-2">
                        {recientes.map((c) => (
                          <button key={c.id} type="button" onClick={() => elegirCliente(c)} className="min-h-10 rounded-full border-2 border-borde bg-superficie px-3 text-sm font-bold hover:border-marca">
                            {c.nombre}{" "}
                            <span className="font-normal text-texto-suave">
                              · {c.ultimo!.fecha.slice(8, 10)}/{c.ultimo!.fecha.slice(5, 7)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold text-texto-suave">Clientes</h3>
                    {clientesVisibles.length === 0 ? (
                      <p className="text-texto-suave">
                        No hay clientes con ese nombre.{" "}
                        <Link href="/clientes" className="font-semibold underline underline-offset-2">
                          Agregá el cliente en Clientes
                        </Link>{" "}
                        y volvé.
                      </p>
                    ) : (
                      <div className="barra-visible grid max-h-44 grid-cols-1 content-start gap-2 overflow-y-auto">
                        {clientesVisibles.map((c) => (
                          <RecuadroCliente key={c.id} c={c} alElegir={() => elegirCliente(c)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Paso>

            <Paso id="dia" n={2} titulo="¿Para qué día?">
              <div className="flex flex-wrap gap-2">
                {dias.map((d) => {
                  const cerrado = datos.cerrados.includes(d);
                  const elegido = d === fecha;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={cerrado || (editando && pedido.estado === "EN_COMPRA" && d !== pedido.fecha)}
                      onClick={() => setFecha(d)}
                      aria-pressed={elegido}
                      className={`flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl border-2 px-2 leading-tight disabled:opacity-40 ${elegido ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca/60"}`}
                    >
                      <span className="font-bold">{nombreDelDia(d, datos.hoy)}</span>
                      <span className="text-xs">{cerrado ? "cerrado" : `${d.slice(8, 10)}/${d.slice(5, 7)}`}</span>
                    </button>
                  );
                })}
                <label className="flex min-h-12 flex-col justify-center rounded-xl border-2 border-dashed border-borde px-2 text-xs">
                  <span className="font-semibold">Otro día</span>
                  <input
                    type="date"
                    min={datos.hoy}
                    value={dias.includes(fecha) ? "" : fecha}
                    onChange={(e) => e.target.value && setFecha(e.target.value)}
                    disabled={editando && pedido.estado === "EN_COMPRA"}
                    className="h-7 rounded-md border border-borde bg-superficie px-1"
                  />
                </label>
              </div>
              <p className="flex flex-col leading-tight">
                <span className="text-sm text-texto-suave">Se entrega el</span>
                <b className="text-2xl font-extrabold first-letter:uppercase">{fechaConDia(fecha)}</b>
              </p>
              {yaTiene.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
                  <p className="font-semibold">
                    ⚠️ {cliente!.nombre} ya tiene {yaTiene.length === 1 ? `el pedido ${yaTiene[0]!.numero}` : `${yaTiene.length} pedidos`} para ese día ({ETAPA[yaTiene[0]!.estado] ?? "en curso"}).
                  </p>
                  <p className="text-sm">Si es para sumarle productos, cambiá ese pedido. Si es un pedido aparte, seguí acá.</p>
                  <div className="flex flex-wrap gap-2">
                    {yaTiene.map((a) => (
                      <Link key={a.id} href={`/pedidos/${a.id}/cambiar`} className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white">
                        Cambiar el {a.numero} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Paso>
          </div>

          <Paso
            id="productos"
            n={3}
            titulo="¿Qué lleva?"
            derecha={
              cliente ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => abrirPanel("historial")} aria-pressed={panel === "historial"} className={`min-h-10 rounded-lg border-2 px-3 text-sm font-semibold ${panel === "historial" ? "border-marca bg-marca/10" : "border-borde"}`}>
                    🕘 Historial de pedidos
                  </button>
                  <button type="button" onClick={() => abrirPanel("frecuentes")} aria-pressed={panel === "frecuentes"} className={`min-h-10 rounded-lg border-2 px-3 text-sm font-semibold ${panel === "frecuentes" ? "border-marca bg-marca/10" : "border-borde"}`}>
                    ⭐ Pedidos frecuentes
                  </button>
                </div>
              ) : null
            }
          >
            {panel && cliente && (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-marca/40 bg-fondo p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{panel === "historial" ? `🕘 Historial de pedidos de ${cliente.nombre}` : `⭐ Pedidos frecuentes de ${cliente.nombre}`}</h3>
                  <button type="button" onClick={() => setPanel(null)} aria-label="Cerrar" className="flex size-9 items-center justify-center rounded-full text-xl hover:bg-black/10 dark:hover:bg-white/10">
                    ×
                  </button>
                </div>
                <p className="text-sm text-texto-suave">
                  {panel === "historial"
                    ? "Tocá la estrella para guardar un pedido como frecuente: sus productos son los que se sugieren al cargarle uno nuevo. “＋ Usar” agrega sus productos a este pedido."
                    : "Los pedidos que marcaste con la estrella. “＋ Usar” agrega sus productos a este pedido."}
                </p>
                {suHistorial === null ? (
                  <p className="text-texto-suave">Buscando sus pedidos…</p>
                ) : (
                  <>
                    {suHistorial.mensaje && (
                      <p role="alert" className="font-medium text-error">
                        {suHistorial.mensaje}
                      </p>
                    )}
                    {pedidosDelPanel.length === 0 ? (
                      <p className="text-texto-suave">{panel === "historial" ? "Todavía no tiene pedidos anteriores." : "Todavía no marcaste ningún pedido como frecuente: abrí el Historial y tocá la estrella del que quieras."}</p>
                    ) : (
                      <ul className="barra-visible flex max-h-64 flex-col gap-2 overflow-y-auto">
                        {pedidosDelPanel.map((h) => (
                          <li key={h.id} className="flex items-center gap-2 rounded-xl border border-borde bg-superficie p-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={h.frecuente}
                              aria-label={`Pedido frecuente: ${h.numero}`}
                              title={h.frecuente ? "Es un pedido frecuente: tocá para sacarle la estrella" : "Marcarlo como pedido frecuente"}
                              onClick={() => alternarEstrella(h)}
                              className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-3xl leading-none ${h.frecuente ? "text-amber-500" : "text-texto-suave hover:text-amber-500"}`}
                            >
                              {h.frecuente ? "★" : "☆"}
                            </button>
                            <span className="min-w-0 flex-1">
                              <span className="block font-bold first-letter:uppercase">
                                {fechaConDia(h.fecha)} <span className="text-sm font-normal text-texto-suave">· {h.numero}</span>
                              </span>
                              <span className="block truncate text-sm text-texto-suave">
                                {h.lineas
                                  .map((l) => productoPorId.get(l.productoId)?.nombre)
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </span>
                            <button type="button" onClick={() => sumarLineas(h.lineas)} className="min-h-10 shrink-0 rounded-lg bg-marca px-3 text-sm font-bold text-marca-texto">
                              ＋ Usar
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            <input
              value={buscarProducto}
              onChange={(e) => setBuscarProducto(e.target.value)}
              placeholder="🔎 Buscar producto por nombre o código…"
              aria-label="Buscar producto"
              className="h-12 rounded-xl border-2 border-borde bg-superficie px-3 text-lg"
            />
            {productosVisibles.length === 0 ? (
              <p className="text-texto-suave">
                No hay productos con ese nombre.{" "}
                <Link href="/productos/nuevo" className="font-semibold underline underline-offset-2">
                  Crealo en Productos
                </Link>{" "}
                y volvé.
              </p>
            ) : (
              // Un solo recuadro con todos los productos: arriba, los frecuentes del cliente (la única
              // división); después, todos los demás, del que se pidió hace menos al que hace más.
              <div className="barra-visible flex max-h-[34rem] flex-col gap-3 overflow-y-scroll rounded-xl border border-borde p-2">
                {frecuentes.length > 0 && (
                  <>
                    <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 text-lg font-bold">
                      ⭐ Productos frecuentes
                      <span className="text-sm font-normal text-texto-suave">
                        de {cliente!.nombre}
                        {cliente!.deFrecuentes ? " (de sus pedidos frecuentes)" : ""}
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 content-start items-start gap-2 @md:grid-cols-2 @3xl:grid-cols-3">{frecuentes.map(recuadro)}</div>
                  </>
                )}
                {frecuentes.length > 0 && listados.length > 0 && <hr className="border-t-2 border-borde" />}
                {listados.length > 0 && <div className="grid grid-cols-1 content-start items-start gap-2 @md:grid-cols-2 @3xl:grid-cols-3">{listados.map(recuadro)}</div>}
              </div>
            )}
          </Paso>
        </div>

        <aside id="resumen" aria-labelledby="resumen-titulo" className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border-2 border-marca/40 bg-superficie p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <div className="z-10 -mx-4 -mt-4 flex flex-col gap-3 rounded-t-2xl border-b border-borde bg-superficie px-4 pt-4 pb-3 lg:sticky lg:top-0">
            <div>
              <h2 id="resumen-titulo" className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
                🧺 El pedido
                <span className="rounded-full bg-marca px-2.5 py-0.5 text-base font-bold text-marca-texto">{entradas.length === 1 ? "1 producto" : `${entradas.length} productos`}</span>
              </h2>
              <p className="text-texto-suave">
                {cliente ? cliente.nombre : "Sin cliente"} · {fechaConDia(fecha)}
              </p>
            </div>
            {/* En pantallas chicas el botón de guardar va en la barra de abajo, siempre a la vista. */}
            <div className="hidden flex-col gap-2 lg:flex">
              {problema && (
                <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-error bg-error/10 p-3">
                  <p className="font-semibold text-error">{problema.mensaje}</p>
                  {problema.enlace && (
                    <Link href={problema.enlace.href} className="self-start rounded-lg bg-marca px-4 py-2 font-semibold text-marca-texto">
                      {problema.enlace.texto}{"\u00a0→"}
                    </Link>
                  )}
                </div>
              )}
              <button type="button" disabled={guardando} onClick={() => guardar(confirmaAlGuardar)} className="min-h-16 rounded-xl bg-marca px-4 text-xl font-bold text-marca-texto shadow-sm hover:opacity-90 disabled:opacity-60">
                {guardando ? "Guardando…" : botonPrincipal}
              </button>
              <p className="text-sm text-texto-suave">{editando ? "Los cambios se ven enseguida en el tablero." : "Queda en la columna “Pedidos” del tablero."}</p>
            </div>
          </div>
          {entradas.length === 0 ? (
            <p className="rounded-xl bg-fondo p-4 text-center text-texto-suave">Todavía no agregaste productos: tocá ＋ en los de la izquierda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-borde rounded-xl border border-borde">
              {entradas.map((e) => {
                const p = productoPorId.get(e.productoId)!;
                return (
                  <li key={e.clave} className="flex flex-col gap-1.5 p-2.5">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => irA(`producto-${p.id}`)} className="min-w-0 flex-1 text-left" title="Verlo en la lista de productos">
                        <NombreDeProducto nombre={p.nombre} grupo={p.grupo} className="text-xl" />
                      </button>
                      <button type="button" onClick={() => quitar(e.clave)} aria-label={`Sacar ${p.nombre} del pedido`} title="Sacarlo del pedido" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                        🗑
                      </button>
                    </div>
                    <Cantidad p={p} entrada={e} invalida={problema?.producto === p.id} alCambiar={(c) => cambiar(p.id, c)} alQuitar={() => quitar(e.clave)} />
                    {!leerCantidad(e.cantidad) && <p className="text-sm font-medium text-error">Falta la cantidad</p>}
                    <input
                      value={e.nota}
                      onChange={(ev) => cambiar(p.id, { nota: ev.target.value })}
                      maxLength={200}
                      placeholder="Nota (opcional): ej. bien maduros"
                      aria-label={`Nota para ${p.nombre}`}
                      className="h-9 rounded-lg border border-borde bg-superficie px-2 text-sm"
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <details open={prioridad !== "NORMAL" || Boolean(desde || hasta || nota) || otroHorario || undefined} className="rounded-xl border border-borde p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">
              ⚙️ Urgencia, horario y nota <span className="font-normal text-texto-suave">(opcional)</span>
            </summary>
            <div className="mt-2 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">¿Es urgente?</legend>
            <div className="grid grid-cols-3 gap-2">
              {PRIORIDADES.map((pr) => (
                <button
                  key={pr.valor}
                  type="button"
                  onClick={() => setPrioridad(pr.valor)}
                  aria-pressed={prioridad === pr.valor}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-2 font-semibold ${prioridad === pr.valor ? "border-marca bg-marca/10" : "border-borde"}`}
                >
                  <span aria-hidden className="text-xl">
                    {pr.icono}
                  </span>
                  {pr.texto}
                </button>
              ))}
            </div>
            {prioridad === "ALTA" && <p className="text-sm text-texto-suave">Si falta mercadería, este pedido se completa primero.</p>}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">¿Tiene un horario?</legend>
            <div className="flex flex-wrap gap-2">
              {HORARIOS.map((h) => {
                const elegido = !otroHorario && desde === h.desde && hasta === h.hasta;
                return (
                  <button
                    key={h.texto}
                    type="button"
                    onClick={() => {
                      setOtroHorario(false);
                      setDesde(h.desde);
                      setHasta(h.hasta);
                    }}
                    aria-pressed={elegido}
                    className={`min-h-11 rounded-full border-2 px-4 font-semibold ${elegido ? "border-marca bg-marca/10" : "border-borde"}`}
                  >
                    {h.texto}
                  </button>
                );
              })}
              <button type="button" onClick={() => setOtroHorario(true)} aria-pressed={otroHorario} className={`min-h-11 rounded-full border-2 px-4 font-semibold ${otroHorario ? "border-marca bg-marca/10" : "border-borde"}`}>
                Otro…
              </button>
            </div>
            {otroHorario && (
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  Desde
                  <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-11 rounded-lg border-2 border-borde bg-superficie px-2" />
                </label>
                <label className="flex items-center gap-2">
                  Hasta
                  <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-11 rounded-lg border-2 border-borde bg-superficie px-2" />
                </label>
              </div>
            )}
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">Nota para el pedido</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej. dejar en la puerta de atrás (sale en el remito)"
              className="rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-base"
            />
          </label>

            </div>
          </details>
        </aside>
      </div>

      <div className="sticky bottom-3 z-30 flex flex-col gap-2 rounded-2xl bg-superficie p-3 shadow-lg ring-1 ring-black/10 lg:hidden">
        {problema && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-error bg-error/10 p-3">
            <p className="font-semibold text-error">{problema.mensaje}</p>
            {problema.enlace && (
              <Link href={problema.enlace.href} className="self-start rounded-lg bg-marca px-4 py-2 font-semibold text-marca-texto">
                {problema.enlace.texto}{"\u00a0→"}
              </Link>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => irA("resumen")} className="min-w-0 flex-1 text-left font-semibold" title="Ver el pedido completo">
            🧺 {entradas.length === 0 ? "Sin productos" : entradas.length === 1 ? "1 producto" : `${entradas.length} productos`} <span className="font-normal underline underline-offset-2">ver ↓</span>
            {cliente && <span className="block truncate text-sm font-normal text-texto-suave">{cliente.nombre}</span>}
          </button>
          <button type="button" disabled={guardando} onClick={() => guardar(confirmaAlGuardar)} className="min-h-14 shrink-0 rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto shadow-sm disabled:opacity-60">
            {guardando ? "Guardando…" : editando ? "✓ Guardar" : "✓ Guardar el pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
