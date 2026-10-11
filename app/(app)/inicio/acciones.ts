"use server";

import { redirect } from "next/navigation";

import { COLUMNAS_A_LA_VISTA, RETIRO_A_LA_VISTA, accionAlMover, type ClaveColumna, type PrioridadPedido } from "@/dominio/pedidos/tablero";
import { esErrorDeNegocio, textoParaPersona } from "@/dominio/errores";
import { desmarcarPedidoComprado, generarListaCompra, marcarNoConseguido, marcarPedidoComprado, sacarPedidoDeLista, tildarLinea } from "@/modulos/compras/lista-compra";
import { destildarConCompra } from "@/modulos/compras/compra-desde-lista";
import { entregarPedido } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, separarLinea } from "@/modulos/entregas/preparacion";
import { mandarEnCamino } from "@/modulos/entregas/repartos";
import { eliminarPedido, recuperarPedido, volverAtras } from "@/modulos/entregas/volver-atras";
import { guardarCajaInicial } from "@/modulos/jornadas/caja";
import { cerrarJornada, reabrirJornada } from "@/modulos/jornadas/cierre";
import { asignarResponsable, cambiarPlazo, cambiarPrioridad, confirmarPedido, ponerPrecioALinea } from "@/modulos/pedidos/pedidos";
import { estadosDePedidos } from "@/modulos/pedidos/tablero";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, esEnlace, type EstadoAccion } from "@/ui/estado-accion";
import { resultadoDeSalida } from "@/ui/texto-salida";

// Acciones del tablero de pedidos (estilo Trello). Los permisos los verifica cada caso de uso.

const elegidos = (datos: FormData) => datos.getAll("pedido").filter((v): v is string => typeof v === "string" && v !== "");
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Problema {
  texto: string;
  enlace?: { href: string; texto: string };
}

/**
 * Confirma los borradores elegidos; devuelve los que quedaron confirmados y, de los que no, qué
 * pedido es, qué le falta y (si hay) el botón para arreglarlo.
 */
async function confirmarBorradores(db: Parameters<typeof confirmarPedido>[0], authUserId: string, pedidos: readonly { id: string; numero: string; cliente: string }[]) {
  const confirmados: string[] = [];
  const problemas: Problema[] = [];
  for (const p of pedidos) {
    try {
      await confirmarPedido(db, authUserId, p.id);
      confirmados.push(p.id);
    } catch (error) {
      if (!esErrorDeNegocio(error)) throw error;
      const enlace = error.detalle?.enlace;
      problemas.push({ texto: `${p.cliente} (${p.numero}): ${textoParaPersona(error.message)}`, ...(esEnlace(enlace) ? { enlace } : {}) });
    }
  }
  return { confirmados, problemas };
}

const textos = (problemas: readonly Problema[]) => problemas.map((p) => p.texto).join(" ");
const primerEnlace = (problemas: readonly Problema[]) => {
  const enlace = problemas.find((p) => p.enlace)?.enlace;
  return enlace ? { enlace } : {};
};

/** "Mandar a la lista de compras" los pedidos elegidos (los que quedaron sin terminar se completan antes). */
export async function armarListaConElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const pedidos = await estadosDePedidos(db, authUserId, elegidos(datos));
    if (pedidos.length === 0) return { ok: false, mensaje: "Elegí al menos un pedido." };
    const fechas = new Set(pedidos.map((p) => p.fecha));
    if (fechas.size > 1) return { ok: false, mensaje: "Elegí pedidos de un mismo día: la lista de compras es por día." };
    const { confirmados, problemas } = await confirmarBorradores(db, authUserId, pedidos.filter((p) => p.estado === "BORRADOR"));
    const paraLista = [...pedidos.filter((p) => p.estado === "CONFIRMADO").map((p) => p.id), ...confirmados];
    if (paraLista.length === 0) return { ok: false, mensaje: textos(problemas) || "Esos pedidos ya están en la lista de compras.", ...primerEnlace(problemas) };
    const r = await generarListaCompra(db, authUserId, [...fechas][0]!, { pedidoIds: paraLista });
    const partes = [`Listo: ${cuantos(r.agregados, "pedido entró", "pedidos entraron")} en la lista de compras.`];
    if (r.fueraDeLista > 0) partes.push(`Quedan ${cuantos(r.fueraDeLista, "pedido afuera", "pedidos afuera")}.`);
    if (problemas.length) partes.push(`Quedaron afuera: ${textos(problemas)}`);
    return { ok: problemas.length === 0, mensaje: partes.join(" "), ...primerEnlace(problemas) };
  });
}

export async function prioridadElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await cambiarPrioridad(db, authUserId, { pedidoIds: elegidos(datos), prioridad: campo(datos, "prioridad") as PrioridadPedido });
    return { ok: true, mensaje: n ? `Prioridad cambiada en ${cuantos(n, "pedido", "pedidos")}.` : "Ya tenían esa prioridad." };
  });
}

export async function asignarElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await asignarResponsable(db, authUserId, { pedidoIds: elegidos(datos), usuarioId: campo(datos, "usuarioId") || null });
    return { ok: true, mensaje: n ? `Listo: ${cuantos(n, "pedido cambió", "pedidos cambiaron")} de responsable.` : "Ya estaban así." };
  });
}

export async function sacarDeListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const ids = elegidos(datos);
    for (const id of ids) await sacarPedidoDeLista(db, authUserId, id);
    return { ok: true, mensaje: `${cuantos(ids.length, "pedido volvió", "pedidos volvieron")} a Pedidos (lo ya comprado se conserva).` };
  });
}

export async function plazoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarPlazo(db, authUserId, { pedidoId: campo(datos, "pedidoId"), entregaDesde: campo(datos, "desde"), entregaHasta: campo(datos, "hasta") });
    return { ok: true, mensaje: "Plazo guardado." };
  });
}

/**
 * Mover una tarjeta de una columna a otra (arrastrándola o con su botón verde). Si no se puede,
 * el mensaje dice por qué y qué hay que hacer.
 */
export async function moverTarjetaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }): Promise<EstadoAccion> => {
    const id = campo(datos, "pedido");
    const accion = accionAlMover(campo(datos, "desde") as ClaveColumna, campo(datos, "hacia") as ClaveColumna);
    if (!accion) return { ok: false, mensaje: `Esa tarjeta no se puede mover ahí. Cada pedido avanza de a un paso: ${COLUMNAS_A_LA_VISTA.map((c) => c.titulo).join(" → ")}.` };
    const [p] = await estadosDePedidos(db, authUserId, [id]);
    if (!p) return { ok: false, mensaje: "No se encontró el pedido: puede que lo hayan cancelado. Recargá la página." };
    const aLaLista = async () => {
      if (p.estado === "BORRADOR") await confirmarPedido(db, authUserId, id);
      if (p.estado !== "EN_COMPRA") await generarListaCompra(db, authUserId, p.fecha, { pedidoIds: [id] });
    };
    switch (accion) {
      case "SACAR_DE_LISTA":
        await sacarPedidoDeLista(db, authUserId, id);
        return { ok: true, mensaje: "El pedido volvió a Pedidos: salió de la lista de compras." };
      case "AGREGAR_A_LISTA":
        await aLaLista();
        return { ok: true, mensaje: "El pedido entró en la lista de compras." };
      case "AGREGAR_Y_COMPRAR":
      case "MARCAR_COMPRADO": {
        await aLaLista();
        const n = await marcarPedidoComprado(db, authUserId, id);
        return { ok: true, mensaje: n ? `Listo: ${p.cliente} quedó en Retiro (${cuantos(n, "producto tildado", "productos tildados")}).` : `${p.cliente} ya tenía todo comprado.` };
      }
      case "DESMARCAR_COMPRADO":
        await desmarcarPedidoComprado(db, authUserId, id);
        return { ok: true, mensaje: `${p.cliente} volvió a la lista de compras: lo suyo quedó sin tildar.` };
      case "SALIR":
        return resultadoDeSalida(await mandarEnCamino(db, authUserId, { pedidoIds: [id], confirmar: tildada(datos, "confirmarVariacion") }));
      case "ENTREGAR": {
        const r = await entregarPedido(db, authUserId, id);
        return { ok: true, mensaje: `✅ ${r.cliente}: entregado.` };
      }
      // Un paso atrás (la tarjeta se pasó por accidente).
      case "DEJAR_DE_PREPARAR":
      case "VOLVER_DE_CAMINO":
      case "DESHACER_ENTREGA": {
        const r = await volverAtras(db, authUserId, { pedidoId: id, paso: accion });
        return { ok: true, mensaje: `↩ ${r.cliente} volvió un paso atrás.` };
      }
      case "PREPARAR": {
        // Se prepara solo este pedido: los demás siguen donde están.
        if (p.estado === "BORRADOR") await confirmarPedido(db, authUserId, id);
        // Sin la columna Retiro, pasar un pedido de la lista de compras a Preparando es decir "ya está
        // comprado": lo que faltaba tildar queda tildado (lo que hacía el paso a Retiro), así la
        // preparación propone lo pedido y no lo da por faltante.
        if (!RETIRO_A_LA_VISTA && p.estado === "EN_COMPRA") await marcarPedidoComprado(db, authUserId, id);
        const r = await iniciarPreparacion(db, authUserId, p.fecha, { pedidoIds: [id] });
        if (r.lineasNuevas === 0) {
          return {
            ok: false,
            mensaje: `No se pudo empezar a preparar el pedido de ${p.cliente}: no tiene productos para separar. Abrilo, revisá lo que lleva y volvé a intentarlo.`,
            enlace: { href: `/pedidos/${id}/cambiar`, texto: `Ver lo que lleva ${p.cliente}` },
          };
        }
        return { ok: true, mensaje: `📦 ${p.cliente} pasó a Preparando.` };
      }
    }
  });
}

/** El tilde de un producto en una tarjeta de "Preparando": separado (lo pedido, o lo que alcanzó) o sin separar. */
export async function separarProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await separarLinea(db, authUserId, { itemId: campo(datos, "itemId"), separado: campo(datos, "separado") === "si" });
    return { ok: true, mensaje: null };
  });
}

/** La caja inicial del día, desde el resumen balance del tablero (vacío = sin cargar). */
export async function guardarCajaInicialAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarCajaInicial(db, authUserId, { fecha: campo(datos, "fecha"), monto: campo(datos, "monto") });
    return { ok: true, mensaje: null };
  });
}

/** Reabrir un día cerrado desde el tablero, para corregir algo o volver atrás un pedido. */
export async function reabrirDiaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await reabrirJornada(db, authUserId, { fecha: campo(datos, "fecha"), motivo: "Reabierto desde el tablero." });
    return { ok: true, mensaje: null };
  });
}

/** Cerrar el día desde el tablero, cuando ya se entregó todo. Si algo lo impide, lo dice y lleva al cierre. */
export async function cerrarDiaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const fecha = campo(datos, "fecha");
  const r = await ejecutarAccion(async ({ db, authUserId }) => {
    await cerrarJornada(db, authUserId, fecha);
    return { ok: true, mensaje: "🔒 Día cerrado: quedó todo entregado y guardado." };
  });
  return r.ok || r.enlace ? r : { ...r, enlace: { href: `/jornadas/${fecha}/cierre`, texto: "Ver qué falta para cerrar" } };
}

/**
 * Los tildes de la tarjeta en "Lista de compras": ✓ comprado (sin anotar puesto ni precio), ✕ no se
 * consiguió, o volver a dejarlo por comprar. `desde` es cómo estaba, para saber qué deshacer.
 */
export async function tildarProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const itemId = campo(datos, "itemId");
    const valor = campo(datos, "valor");
    if (valor === "NO") await marcarNoConseguido(db, authUserId, { itemId, motivo: "No se consiguió en el mercado" });
    else if (valor === "SI") await tildarLinea(db, authUserId, { itemId, tildado: true });
    else if (campo(datos, "desde") === "NO_CONSEGUIDO") await marcarNoConseguido(db, authUserId, { itemId, motivo: null });
    // Confirmado: se destilda aunque tenga la compra anotada (se anula esa compra).
    else if (campo(datos, "confirmarVariacion") === "on") await destildarConCompra(db, authUserId, { itemId });
    else await tildarLinea(db, authUserId, { itemId, tildado: false });
    return { ok: true, mensaje: null };
  });
}

/** "✓ Pasar a Retiro" desde la tarjeta abierta: tilda todo lo que le faltaba. */
export async function pasarACompradoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await marcarPedidoComprado(db, authUserId, campo(datos, "pedido"));
    return { ok: true, mensaje: n ? `Listo: quedó en Retiro (${cuantos(n, "producto tildado", "productos tildados")}).` : "Ya estaba todo comprado." };
  });
}

/** Ponerle precio sobre la marcha a un producto sin precio, desde la tarjeta abierta. */
export async function ponerPrecioAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await ponerPrecioALinea(db, authUserId, { itemId: campo(datos, "itemId"), precio: campo(datos, "precio") });
    return { ok: true, mensaje: null };
  });
}

/** "🗑 Eliminar el pedido" desde la tarjeta abierta: aunque ya esté en proceso. Cierra la tarjeta. */
export async function eliminarPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let fecha = "";
  const r = await ejecutarAccion(async ({ db, authUserId }) => {
    fecha = (await eliminarPedido(db, authUserId, { pedidoId: campo(datos, "pedido") })).fecha;
    return { ok: true, mensaje: null };
  });
  if (r.ok) redirect(`/inicio?fecha=${fecha}`);
  return r;
}

/** "↩ Recuperar el pedido": desde la tarjeta de un pedido eliminado o desde Actividad. */
export async function recuperarPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await recuperarPedido(db, authUserId, { pedidoId: campo(datos, "pedido") });
    return { ok: true, mensaje: null };
  });
}
