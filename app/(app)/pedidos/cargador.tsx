"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { ABREVIATURA_UNIDAD, formatearMoneda } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import {
  cantidadPermitida,
  cantidadesRapidas,
  coincideBusqueda,
  leerCantidad,
  presentacionInicial,
  sumarCantidad,
  textoCantidad,
  type PresentacionDeVenta,
} from "@/dominio/pedidos/carga";
import type { PrioridadPedido } from "@/dominio/pedidos/tablero";
import type { ClienteParaCargar, DatosDeCarga, ProductoParaCargar } from "@/modulos/pedidos/carga";
import type { PedidoCargado } from "@/modulos/pedidos/pedidos";
import { fechaConDia } from "@/ui/etiquetas";
import { dibujoDeCliente } from "@/ui/etiquetas-tablero";

import { guardarPedidoVisualAccion } from "./acciones";

// Carga visual de pedidos (28/09/2026): el cliente, el día y los productos se eligen tocando
// recuadros grandes; la cantidad se ajusta con − y + o escribiéndola. A la derecha (abajo en el
// celular) queda el resumen con la prioridad, el horario y la nota, y el botón para guardar.

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
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border border-borde bg-superficie p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marca text-lg font-bold text-marca-texto">
          {n}
        </span>
        <div className="min-w-0 flex-1 basis-60">
          <h2 id={`${id}-titulo`} className="text-xl font-semibold">
            {titulo}
          </h2>
          {ayuda && <p className="text-texto-suave">{ayuda}</p>}
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

function RecuadroCliente({ c, elegido, alElegir }: { c: ClienteParaCargar; elegido: boolean; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-pressed={elegido}
      className={`flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${elegido ? "border-marca bg-marca/10" : "border-borde bg-superficie hover:border-marca/60 hover:bg-marca/5"}`}
    >
      <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fondo text-3xl">
        {dibujoDeCliente(c.tipo)}
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-semibold">{c.nombre}</span>
        {c.direccion && <span className="mt-1 line-clamp-2 block text-sm text-texto-suave">{c.direccion}</span>}
      </span>
    </button>
  );
}

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
  const dibujo = dibujoDeProducto(p.nombre, p.grupo);
  const unidad = ABREVIATURA_UNIDAD[p.unidadBase];
  const inicial = presentacionInicial(p.presentaciones, p.presentacionDefectoId);
  if (!entrada) {
    return (
      <button
        type="button"
        onClick={alAgregar}
        aria-pressed={false}
        id={`producto-${p.id}`}
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-borde bg-superficie p-4 text-center transition-colors hover:border-marca/60 hover:bg-marca/5"
      >
        <span aria-hidden className="text-5xl leading-none">
          {dibujo}
        </span>
        <span className="text-lg leading-tight font-semibold">{p.nombre}</span>
        <span className="text-sm text-texto-suave">{inicial && !inicial.esUnidadBase ? inicial.nombre : `por ${unidad}`}</span>
      </button>
    );
  }
  const presentacion: Pick<PresentacionDeVenta, "nombre" | "esUnidadBase" | "factor"> = p.presentaciones.find((x) => x.id === entrada.presentacionId) ?? {
    nombre: unidad,
    esUnidadBase: true,
    factor: "1",
  };
  const cantidad = leerCantidad(entrada.cantidad);
  const cambiarCantidad = (paso: string) => {
    const nueva = sumarCantidad(cantidad ?? "0", paso);
    if (nueva === "0") alQuitar();
    else alCambiar({ cantidad: conComa(nueva) });
  };
  const baseId = p.presentaciones.find((x) => x.esUnidadBase)?.id ?? null;
  const valorPresentacion = entrada.presentacionId && entrada.presentacionId !== baseId ? entrada.presentacionId : "";
  return (
    <div
      id={`producto-${p.id}`}
      className={`col-span-2 flex flex-col gap-4 rounded-2xl border-2 bg-marca/10 p-4 sm:p-5 ${marcado ? "border-error ring-2 ring-error/40" : "border-marca ring-2 ring-marca/30"}`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-5xl leading-none">
          {dibujo}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-tight font-semibold">{p.nombre}</p>
          <p className="text-lg font-medium">{cantidad ? textoCantidad(cantidad, presentacion, p.unidadBase) : "¿Cuánto lleva?"}</p>
        </div>
        <button type="button" onClick={alQuitar} aria-label={`Sacar ${p.nombre}`} className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl hover:bg-black/10 dark:hover:bg-white/10">
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
        <button type="button" onClick={() => cambiarCantidad("-1")} aria-label={`Uno menos de ${p.nombre}`} className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-borde bg-superficie text-2xl font-bold">
          −
        </button>
        <input
          value={entrada.cantidad}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
          inputMode="decimal"
          aria-label={`Cantidad de ${p.nombre}`}
          aria-invalid={Boolean(marcado)}
          className="h-12 w-24 rounded-xl border-2 border-borde bg-superficie text-center text-xl font-semibold"
        />
        <button type="button" onClick={() => cambiarCantidad("1")} aria-label={`Uno más de ${p.nombre}`} className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-borde bg-superficie text-2xl font-bold">
          +
        </button>
        </div>
      {p.presentaciones.filter((x) => !x.esUnidadBase).length > 0 && (
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Se pide</span>
          <select value={valorPresentacion} onChange={(e) => alCambiar({ presentacionId: e.target.value || null })} className="h-12 rounded-xl border-2 border-borde bg-superficie px-2 text-base">
            <option value="">Por {unidad}</option>
            {p.presentaciones
              .filter((x) => !x.esUnidadBase)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  Por {x.nombre.toLowerCase()}
                </option>
              ))}
          </select>
        </label>
      )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Cantidades rápidas de ${p.nombre}`}>
        {cantidadesRapidas(p.unidadBase, presentacion.esUnidadBase).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => alCambiar({ cantidad: q })}
            aria-pressed={cantidad === q}
            className={`min-h-11 min-w-11 rounded-full border-2 px-3 font-semibold ${cantidad === q ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}
          >
            {q}
          </button>
        ))}
      </div>
      {marcado && (
        <p role="alert" className="text-sm font-medium text-error">
          {marcado}
        </p>
      )}
      <input
        value={entrada.nota}
        onChange={(e) => alCambiar({ nota: e.target.value })}
        maxLength={200}
        placeholder="Nota (opcional): ej. bien maduros"
        aria-label={`Nota para ${p.nombre}`}
        className="h-10 rounded-lg border border-borde bg-superficie px-3 text-sm"
      />
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

  const cliente = datos.clientes.find((c) => c.id === clienteId) ?? null;
  const punto = cliente?.puntos.find((p) => p.id === puntoId) ?? cliente?.puntos[0] ?? null;
  const dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(datos.hoy, i));
  const yaTiene = !editando && cliente ? cliente.abiertos.filter((a) => a.fecha === fecha) : [];
  const porProducto = new Map(entradas.map((e) => [e.productoId, e]));
  const habituales = (cliente?.habituales ?? []).map((id) => productoPorId.get(id)).filter((p): p is ProductoParaCargar => Boolean(p));
  const clientesVisibles = datos.clientes.filter((c) => coincideBusqueda(`${c.nombre} ${c.direccion ?? ""}`, buscarCliente));
  const productosVisibles = datos.productos.filter((p) => coincideBusqueda(`${p.nombre} ${p.categoria ?? ""}`, buscarProducto));
  const buscando = buscarProducto.trim() !== "";
  // Por categoría; sin búsqueda, lo que suele pedir el cliente va arriba y no se repite abajo.
  const grupos = [...new Set(productosVisibles.map((p) => p.categoria ?? "Otros"))]
    .map((cat) => ({ cat, productos: productosVisibles.filter((p) => (p.categoria ?? "Otros") === cat && (buscando || !habituales.includes(p))) }))
    .filter((g) => g.productos.length > 0);

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
    setTimeout(() => irA(c.puntos.length > 0 ? "dia" : "cliente"), 50);
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
  const repetirUltimo = () => {
    if (!cliente?.ultimo) return;
    if (entradas.length > 0 && !window.confirm("¿Cambiar lo que ya elegiste por su último pedido?")) return;
    setEntradas(
      cliente.ultimo.lineas
        .filter((l) => productoPorId.has(l.productoId))
        .map((l) => ({ clave: nuevaClave(), productoId: l.productoId, presentacionId: l.presentacionId, cantidad: conComa(l.cantidad), nota: l.observaciones ?? "" })),
    );
    setProblema(null);
  };

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
        <div className="flex flex-wrap justify-center gap-3">
          {!editando && (
            <button type="button" onClick={cargarOtro} className="min-h-14 rounded-xl bg-marca px-6 text-lg font-semibold text-marca-texto">
              ＋ Cargar otro pedido
            </button>
          )}
          <Link href={`/inicio?fecha=${listo.fecha}&pedido=${listo.pedidoId}`} className="flex min-h-14 items-center rounded-xl border-2 border-borde px-6 text-lg font-semibold">
            Ver en el tablero
          </Link>
          {!editando && (
            <Link href={`/pedidos/${listo.pedidoId}/cambiar`} className="flex min-h-14 items-center rounded-xl px-4 text-lg font-medium underline underline-offset-4">
              Cambiar algo de este pedido
            </Link>
          )}
        </div>
      </div>
    );
  }

  const botonPrincipal = editando ? "✓ Guardar los cambios" : "✓ Guardar el pedido";
  // No hay confirmación a la vista: un pedido guardado ya queda listo para mandarse a la lista de compras.
  const confirmaAlGuardar = puedeConfirmar && (!editando || pedido.estado === "BORRADOR");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{editando ? `Cambiar el pedido ${pedido.numero}` : "Nuevo pedido"}</h1>
          <p className="text-lg text-texto-suave">
            {editando
              ? pedido.estado === "EN_COMPRA"
                ? "Ya está en la lista de compras: al guardar, la lista se marca para actualizarla con lo nuevo."
                : "Sumá, cambiá o sacá productos y guardá."
              : "Tocá el cliente, el día y lo que lleva. Al final, guardalo."}
          </p>
        </div>
        <Link href={`/inicio?fecha=${fecha}`} className="flex min-h-11 items-center rounded-lg border border-borde px-4 font-semibold">
          ← Volver al tablero
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Paso
            id="cliente"
            n={1}
            titulo={cliente ? "Cliente" : "¿Para quién es?"}
            ayuda={cliente ? undefined : "Tocá el recuadro del cliente. Si hay muchos, escribí parte del nombre."}
            derecha={
              cliente && !editando ? (
                <button type="button" onClick={() => setClienteId(null)} className="min-h-11 rounded-lg border border-borde px-4 font-semibold">
                  Cambiar de cliente
                </button>
              ) : null
            }
          >
            {cliente ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 rounded-2xl bg-marca/10 p-4">
                  <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-superficie text-4xl">
                    {dibujoDeCliente(cliente.tipo)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl leading-tight font-semibold">{cliente.nombre}</p>
                    {punto ? <p className="text-texto-suave">📍 {punto.direccion}</p> : <p className="font-medium text-error">No tiene cargado dónde se le entrega.</p>}
                  </div>
                </div>
                {cliente.puntos.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <p className="font-medium">¿Dónde se entrega?</p>
                    <div className="flex flex-wrap gap-2">
                      {cliente.puntos.map((pt) => (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => setPuntoId(pt.id)}
                          aria-pressed={punto?.id === pt.id}
                          className={`min-h-12 rounded-xl border-2 px-4 text-left ${punto?.id === pt.id ? "border-marca bg-marca/10 font-semibold" : "border-borde"}`}
                        >
                          {pt.nombre} <span className="block text-sm font-normal text-texto-suave">{pt.direccion}</span>
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
              <div className="flex flex-col gap-4">
                <input
                  value={buscarCliente}
                  onChange={(e) => setBuscarCliente(e.target.value)}
                  placeholder="🔎 Buscar cliente…"
                  aria-label="Buscar cliente"
                  className="h-14 rounded-xl border-2 border-borde bg-superficie px-4 text-lg"
                />
                {clientesVisibles.length === 0 ? (
                  <p className="text-texto-suave">
                    No hay clientes con ese nombre. <Link href="/clientes" className="font-semibold underline underline-offset-2">Agregá el cliente en Clientes</Link> y volvé.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {clientesVisibles.map((c) => (
                      <RecuadroCliente key={c.id} c={c} elegido={false} alElegir={() => elegirCliente(c)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Paso>

          <Paso id="dia" n={2} titulo="¿Para qué día?" ayuda="El día en que se entrega.">
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
                    className={`flex min-h-16 min-w-24 flex-col items-center justify-center rounded-xl border-2 px-3 disabled:opacity-40 ${elegido ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca/60"}`}
                  >
                    <span className="text-lg font-semibold">{nombreDelDia(d, datos.hoy)}</span>
                    <span className="text-sm">{cerrado ? "cerrado" : `${d.slice(8, 10)}/${d.slice(5, 7)}`}</span>
                  </button>
                );
              })}
              <label className="flex min-h-16 flex-col justify-center gap-1 rounded-xl border-2 border-dashed border-borde px-3 text-sm">
                <span className="font-medium">Otro día</span>
                <input
                  type="date"
                  min={datos.hoy}
                  value={dias.includes(fecha) ? "" : fecha}
                  onChange={(e) => e.target.value && setFecha(e.target.value)}
                  disabled={editando && pedido.estado === "EN_COMPRA"}
                  className="h-9 rounded-md border border-borde bg-superficie px-2"
                />
              </label>
            </div>
            <p className="text-lg">
              Se entrega el <b>{fechaConDia(fecha)}</b>
              {fecha === datos.sugerida && !editando && <span className="text-texto-suave"> (el día para el que se están tomando pedidos)</span>}.
            </p>
            {yaTiene.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
                <p className="font-semibold">
                  ⚠️ {cliente!.nombre} ya tiene {yaTiene.length === 1 ? `el pedido ${yaTiene[0]!.numero}` : `${yaTiene.length} pedidos`} para ese día ({ETAPA[yaTiene[0]!.estado] ?? "en curso"}).
                </p>
                <p>Si es para sumarle productos, cambiá ese pedido. Si es un pedido aparte, seguí acá.</p>
                <div className="flex flex-wrap gap-2">
                  {yaTiene.map((a) => (
                    <Link key={a.id} href={`/pedidos/${a.id}/cambiar`} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
                      Cambiar el {a.numero} →
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Paso>

          <Paso
            id="productos"
            n={3}
            titulo="¿Qué lleva?"
            ayuda="Tocá cada producto y ajustá la cantidad con − y +, o escribila."
            derecha={
              cliente?.ultimo && !editando ? (
                <button type="button" onClick={repetirUltimo} className="min-h-12 rounded-xl border-2 border-marca px-4 font-semibold">
                  ↺ Repetir su último pedido ({cliente.ultimo.fecha.slice(8, 10)}/{cliente.ultimo.fecha.slice(5, 7)} · {cliente.ultimo.lineas.length} productos)
                </button>
              ) : null
            }
          >
            <input
              value={buscarProducto}
              onChange={(e) => setBuscarProducto(e.target.value)}
              placeholder="🔎 Buscar producto…"
              aria-label="Buscar producto"
              className="h-14 rounded-xl border-2 border-borde bg-superficie px-4 text-lg"
            />
            {!buscando && habituales.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold">⭐ Lo que suele pedir</h3>
                <div className="grid grid-flow-row-dense grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {habituales.map((p) => (
                    <RecuadroProducto
                      key={`h-${p.id}`}
                      p={p}
                      entrada={porProducto.get(p.id)}
                      marcado={problema?.producto === p.id ? problema.mensaje : null}
                      alAgregar={() => agregar(p)}
                      alCambiar={(c) => cambiar(p.id, c)}
                      alQuitar={() => quitar(porProducto.get(p.id)!.clave)}
                    />
                  ))}
                </div>
              </div>
            )}
            {productosVisibles.length === 0 && (
              <p className="text-texto-suave">
                No hay productos con ese nombre. <Link href="/productos/nuevo" className="font-semibold underline underline-offset-2">Crealo en Productos</Link> y volvé.
              </p>
            )}
            {grupos.map(({ cat, productos }) => (
              <div key={cat} className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold">{cat}</h3>
                <div className="grid grid-flow-row-dense grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {productos.map((p) => (
                      <RecuadroProducto
                        key={p.id}
                        p={p}
                        entrada={porProducto.get(p.id)}
                        marcado={problema?.producto === p.id ? problema.mensaje : null}
                        alAgregar={() => agregar(p)}
                        alCambiar={(c) => cambiar(p.id, c)}
                        alQuitar={() => quitar(porProducto.get(p.id)!.clave)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </Paso>
        </div>

        <aside id="resumen" aria-labelledby="resumen-titulo" className="flex scroll-mt-4 flex-col gap-5 rounded-2xl border-2 border-marca/40 bg-superficie p-4 sm:p-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <div>
            <h2 id="resumen-titulo" className="text-xl font-semibold">
              🧺 El pedido
            </h2>
            <p className="text-texto-suave">
              {cliente ? cliente.nombre : "Sin cliente"} · {fechaConDia(fecha)}
            </p>
          </div>
          {entradas.length === 0 ? (
            <p className="rounded-xl bg-fondo p-4 text-center text-texto-suave">Todavía no elegiste productos: tocá los recuadros de la izquierda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-borde rounded-xl border border-borde">
              {entradas.map((e) => {
                const p = productoPorId.get(e.productoId)!;
                const cantidad = leerCantidad(e.cantidad);
                const pres = p.presentaciones.find((x) => x.id === e.presentacionId) ?? { nombre: ABREVIATURA_UNIDAD[p.unidadBase], esUnidadBase: true };
                return (
                  <li key={e.clave} className="flex items-center gap-3 p-3">
                    <button type="button" onClick={() => irA(`producto-${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span aria-hidden className="text-3xl leading-none">
                        {dibujoDeProducto(p.nombre, p.grupo)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className={`block ${cantidad ? "" : "font-medium text-error"}`}>{cantidad ? textoCantidad(cantidad, pres, p.unidadBase) : "Falta la cantidad"}</span>
                        {e.nota.trim() && <span className="block text-sm text-texto-suave">“{e.nota.trim()}”</span>}
                      </span>
                    </button>
                    <button type="button" onClick={() => quitar(e.clave)} aria-label={`Sacar ${p.nombre}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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

          {problema && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-error bg-error/10 p-4">
              <p className="font-semibold text-error">{problema.mensaje}</p>
              {problema.enlace && (
                <Link href={problema.enlace.href} className="self-start rounded-lg bg-marca px-4 py-2 font-semibold text-marca-texto">
                  {problema.enlace.texto} →
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button type="button" disabled={guardando} onClick={() => guardar(confirmaAlGuardar)} className="min-h-14 rounded-xl bg-marca px-4 text-lg font-semibold text-marca-texto disabled:opacity-60">
              {guardando ? "Guardando…" : botonPrincipal}
            </button>
            <p className="text-sm text-texto-suave">
              {editando ? "Los cambios se ven enseguida en el tablero." : "Queda en la columna “Pedidos” del tablero; desde ahí se manda a la lista de compras."}
            </p>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-3 z-30 flex items-center gap-3 rounded-2xl bg-superficie p-3 shadow-lg ring-1 ring-black/10 lg:hidden">
        <span className="flex-1 font-semibold">
          🧺 {entradas.length === 0 ? "Sin productos" : entradas.length === 1 ? "1 producto" : `${entradas.length} productos`}
          {cliente && <span className="block truncate text-sm font-normal text-texto-suave">{cliente.nombre}</span>}
        </span>
        <button type="button" onClick={() => irA("resumen")} className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-texto">
          Revisar y guardar ↓
        </button>
      </div>
    </div>
  );
}
