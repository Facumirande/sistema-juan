import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import {
  categoria,
  compra,
  compraItem,
  empresa,
  jornada,
  listaCompra,
  listaCompraItem,
  pedido,
  pedidoItem,
  presentacion,
  producto,
  proveedor,
  proveedorProducto,
} from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { calcularLineaLista, estadoLineaLista, sugerirProveedor, type AlertaLista, type Candidato, type EstadoLineaLista } from "@/dominio/compras/lista";
import { indicadoresCredito, type Semaforo } from "@/dominio/compras/credito";
import { aNumeric, dec, redondear2, sumar } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { diasEntre, hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { saldoNeto, umbralesSemaforo } from "./cuenta";

// Lista de compra (04 §5.c, 08 §5.8): RN-034, RN-037, RN-043 a RN-053.

export interface LineaDeLista {
  id: string;
  productoId: string;
  producto: string;
  unidadBase: string;
  necesidadBase: string;
  compradoBase: string;
  pendienteBase: string;
  presentacionId: string | null;
  presentacion: string | null;
  factor: string;
  cantidadPresentaciones: string | null;
  aComprarBase: string | null;
  sobrantePrevistoBase: string;
  ajusteManual: boolean;
  motivoAjuste: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  ubicacion: string | null;
  asignacionManual: boolean;
  /** Solo con `precios.ver_costos`. */
  precioSugerido: string | null;
  costoEstimado: string | null;
  estado: EstadoLineaLista;
  motivoNoConseguido: string | null;
  sinPedido: boolean;
  alertas: AlertaLista[];
  necesidadModificada: boolean;
  observaciones: string | null;
}

export interface PlanProveedor {
  proveedorId: string | null;
  proveedor: string;
  ubicacion: string | null;
  lineas: LineaDeLista[];
  /** Solo con `precios.ver_costos`. */
  subtotal: string | null;
  /** Solo con `proveedores.ver_credito`. */
  credito: { disponibleHoy: string | null; disponibleDespues: string | null; semaforoProyectado: Semaforo } | null;
}

export interface ListaDeCompra {
  id: string;
  numero: string;
  jornadaId: string;
  fecha: FechaISO;
  estadoJornada: string;
  version: number;
  desactualizada: boolean;
  generadaEn: Date;
  costoEstimadoTotal: string | null;
  plan: PlanProveedor[];
}

const ESTADOS_EN_LISTA = ["CONFIRMADO", "EN_COMPRA"] as const;

async function jornadaDeFecha(tx: Transaccion, fecha: FechaISO) {
  const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha));
  return j ?? null;
}

/** Lo comprado por producto en la jornada, sumado en unidad base (04 §5.d.2). */
export async function compradoPorProducto(tx: Transaccion, jornadaId: string): Promise<Map<string, string>> {
  const filas = await tx
    .select({ productoId: compraItem.productoId, cantidad: sum(compraItem.cantidadBase).mapWith(String) })
    .from(compraItem)
    .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
    .where(eq(compra.jornadaId, jornadaId))
    .groupBy(compraItem.productoId);
  return new Map(filas.map((f) => [f.productoId, f.cantidad ?? "0"]));
}

/** RN-052: un pedido de la jornada cambió después de generar la lista. */
export async function marcarListaDesactualizada(tx: Transaccion, jornadaId: string): Promise<void> {
  await tx.update(listaCompra).set({ desactualizada: true }).where(eq(listaCompra.jornadaId, jornadaId));
}

/**
 * Después de registrar o anular compras: actualiza lo comprado y el estado de cada línea (sin
 * mover proveedores ni cantidades sugeridas) y agrega como "sin pedido" lo comprado que no estaba (RN-060).
 */
export async function actualizarComprado(tx: Transaccion, empresaId: string, jornadaId: string): Promise<void> {
  const [lista] = await tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, jornadaId));
  if (!lista) return;
  const comprado = await compradoPorProducto(tx, jornadaId);
  const lineas = await tx.select().from(listaCompraItem).where(eq(listaCompraItem.listaCompraId, lista.id));
  for (const l of lineas) {
    const c = comprado.get(l.productoId) ?? "0";
    const factor = l.aComprarBase && l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero() ? dec(l.aComprarBase).div(l.cantidadPresentaciones) : dec(1);
    const calculo = calcularLineaLista({
      necesidadBase: l.necesidadNetaBase,
      compradoBase: c,
      factor,
      cantidadManual: l.ajusteManual ? l.cantidadPresentaciones : null,
      marcadaNoConseguido: l.estado === "NO_CONSEGUIDO",
    });
    await tx
      .update(listaCompraItem)
      .set({
        compradoBase: aNumeric(c, 3),
        estado: calculo.estado,
        motivoNoConseguido: calculo.estado === "NO_CONSEGUIDO" ? l.motivoNoConseguido : null,
      })
      .where(eq(listaCompraItem.id, l.id));
  }
  const faltan = [...comprado.keys()].filter((id) => !lineas.some((l) => l.productoId === id));
  for (const productoId of faltan) {
    await tx.insert(listaCompraItem).values({
      empresaId,
      listaCompraId: lista.id,
      productoId,
      necesidadBase: "0",
      necesidadNetaBase: "0",
      compradoBase: aNumeric(comprado.get(productoId)!, 3),
      sobrantePrevistoBase: aNumeric(comprado.get(productoId)!, 3),
      estado: "COMPRADO",
      sinPedido: true,
    });
  }
}

/**
 * "Cerrar pedidos y generar lista de compra" o "Regenerar" (04 §5.c.1). Conserva lo comprado,
 * las cantidades fijadas a mano y los proveedores elegidos a mano (RN-049, RN-050).
 */
export async function generarListaCompra(
  db: BaseDatos,
  authUserId: string,
  fecha: FechaISO,
): Promise<{ listaId: string; numero: string; version: number; borradores: number; cambios: string[] }> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.generar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay pedidos para ese día.");
    if (j.estado === "REPARTIENDO" || j.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "La jornada ya está repartiendo o cerrada: la lista no se regenera.");
    const pedidos = await tx.select({ id: pedido.id, estado: pedido.estado }).from(pedido).where(eq(pedido.jornadaId, j.id));
    const incluidos = pedidos.filter((p) => (ESTADOS_EN_LISTA as readonly string[]).includes(p.estado));
    if (incluidos.length === 0) throw new ErrorDeNegocio("VALIDACION", "Para armar la lista hace falta al menos un pedido confirmado (RN-037).");
    const borradores = pedidos.filter((p) => p.estado === "BORRADOR").length;

    // 1. Necesidad por producto en unidad base (RN-043, RN-044)
    const necesidades = await tx
      .select({ productoId: pedidoItem.productoId, cantidad: sum(pedidoItem.cantidadBase).mapWith(String), notas: sql<string | null>`string_agg(distinct ${pedidoItem.observaciones}, ' / ')` })
      .from(pedidoItem)
      .where(and(inArray(pedidoItem.pedidoId, incluidos.map((p) => p.id)), eq(pedidoItem.cancelado, false)))
      .groupBy(pedidoItem.productoId);
    const necesidad = new Map(necesidades.map((n) => [n.productoId, n.cantidad ?? "0"]));
    const comprado = await compradoPorProducto(tx, j.id);

    const [existente] = await tx.select().from(listaCompra).where(eq(listaCompra.jornadaId, j.id)).for("update");
    const anteriores = existente ? await tx.select().from(listaCompraItem).where(eq(listaCompraItem.listaCompraId, existente.id)) : [];
    const productoIds = [...new Set([...necesidad.keys(), ...comprado.keys(), ...anteriores.map((a) => a.productoId)])];
    const productos = productoIds.length
      ? await tx
          .select({ id: producto.id, nombre: producto.nombre, preferidoId: producto.proveedorPreferidoId, compraDefault: producto.presentacionCompraDefaultId })
          .from(producto)
          .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
          .where(inArray(producto.id, productoIds))
          .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre))
      : [];

    // 2. Ofertas candidatas y crédito disponible proyectado por proveedor (06 §9.4)
    const [e] = await tx.select().from(empresa);
    const hoy = hoyEnEmpresa(new Date(), e!.zonaHoraria);
    const ofertas = productoIds.length
      ? await tx
          .select({
            ofertaId: proveedorProducto.id,
            productoId: proveedorProducto.productoId,
            proveedorId: proveedorProducto.proveedorId,
            presentacionId: proveedorProducto.presentacionId,
            precio: proveedorProducto.precioVigente,
            costoBase: proveedorProducto.costoBase,
            factor: presentacion.factorABase,
            fecha: proveedorProducto.fechaActualizacion,
            limite: proveedor.limiteCredito,
            condicion: proveedor.condicionPagoHabitual,
          })
          .from(proveedorProducto)
          .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
          .innerJoin(presentacion, and(eq(presentacion.id, proveedorProducto.presentacionId), eq(presentacion.activo, true), eq(presentacion.usableEnCompra, true)))
          .where(
            and(
              inArray(proveedorProducto.productoId, productoIds),
              eq(proveedorProducto.activo, true),
              eq(proveedorProducto.disponible, true),
              sql`${proveedorProducto.precioVigente} > 0`,
            ),
          )
      : [];
    const disponible = new Map<string, Decimal>();
    for (const provId of new Set(ofertas.filter((o) => o.limite !== null && o.condicion !== "CONTADO").map((o) => o.proveedorId))) {
      const limite = ofertas.find((o) => o.proveedorId === provId)!.limite!;
      disponible.set(provId, dec(limite).minus(await saldoNeto(tx, provId)));
    }
    const ultimos = e!.estrategiaCosto === "ULTIMO_COSTO_REAL" && productoIds.length
      ? await tx
          .selectDistinctOn([compraItem.productoId], { productoId: compraItem.productoId, proveedorId: compra.proveedorId })
          .from(compraItem)
          .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
          .where(inArray(compraItem.productoId, productoIds))
          .orderBy(compraItem.productoId, desc(compra.fechaCompra))
      : [];
    const factores = productoIds.length
      ? await tx.select({ id: presentacion.id, factor: presentacion.factorABase }).from(presentacion).where(inArray(presentacion.productoId, productoIds))
      : [];

    let lista = existente;
    let numero: string;
    if (!lista) {
      const n = await siguienteNumero(tx, "LISTA_COMPRA");
      numero = n.visible;
      [lista] = await tx
        .insert(listaCompra)
        .values({ empresaId: c.empresaId, numero: n.numero, jornadaId: j.id, generadaPor: c.usuarioId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning();
    } else {
      numero = formatearNumeroDocumento("LC-", lista.numero);
    }

    const cambios: string[] = [];
    const costos: Decimal[] = [];
    for (const prod of productos) {
      const anterior = anteriores.find((a) => a.productoId === prod.id);
      const necesidadBase = necesidad.get(prod.id) ?? "0";
      const compradoBase = comprado.get(prod.id) ?? "0";
      const candidatos: Candidato[] = ofertas
        .filter((o) => o.productoId === prod.id)
        .map((o) => ({
          ofertaId: o.ofertaId,
          proveedorId: o.proveedorId,
          precio: o.precio,
          factor: o.factor,
          costoBase: o.costoBase,
          sinControlDeCredito: o.limite === null || o.condicion === "CONTADO",
          desactualizada: diasEntre(hoyEnEmpresa(o.fecha, e!.zonaHoraria), hoy) > e!.diasAlertaPrecioDesactualizado,
          fechaActualizacion: o.fecha,
        }));
      const pendiente = Decimal.max(dec(necesidadBase).minus(compradoBase), 0);

      // Proveedor: se respeta la asignación manual (RN-050)
      const manual = anterior?.asignacionManual ? candidatos.find((x) => x.ofertaId === anterior.proveedorProductoSugeridoId) : undefined;
      const sugerencia = manual
        ? { candidato: manual, alertas: manual.desactualizada ? (["PRECIO_DESACTUALIZADO"] as AlertaLista[]) : [] }
        : sugerirProveedor({
            candidatos,
            estrategia: e!.estrategiaCosto,
            preferidoId: prod.preferidoId,
            ultimoProveedorId: ultimos.find((u) => u.productoId === prod.id)?.proveedorId ?? null,
            pendienteBase: pendiente,
            disponibleProyectado: disponible,
          });
      const oferta = sugerencia.candidato;
      const presentacionId = oferta ? ofertas.find((o) => o.ofertaId === oferta.ofertaId)!.presentacionId : prod.compraDefault;
      const factor = oferta?.factor ?? factores.find((f) => f.id === prod.compraDefault)?.factor ?? "1";
      const calculo = calcularLineaLista({
        necesidadBase,
        compradoBase,
        factor,
        cantidadManual: anterior?.ajusteManual ? anterior.cantidadPresentaciones : null,
        marcadaNoConseguido: anterior?.estado === "NO_CONSEGUIDO",
      });
      const costo = oferta ? redondear2(calculo.cantidadPresentaciones.times(oferta.precio)) : null;
      if (oferta && costo) {
        costos.push(costo);
        const d = disponible.get(oferta.proveedorId);
        if (d !== undefined) disponible.set(oferta.proveedorId, d.minus(costo));
      }
      const necesidadModificada = Boolean(anterior && !dec(anterior.necesidadBase).eq(necesidadBase) && (dec(compradoBase).gt(0) || anterior.ajusteManual));
      if (anterior && !dec(anterior.necesidadBase).eq(necesidadBase)) cambios.push(`${prod.nombre}: ${dec(anterior.necesidadBase)} → ${dec(necesidadBase)}`);
      if (!anterior && existente) cambios.push(`${prod.nombre}: nuevo (${dec(necesidadBase)})`);

      const valores = {
        necesidadBase: aNumeric(necesidadBase, 3),
        necesidadNetaBase: aNumeric(necesidadBase, 3),
        compradoBase: aNumeric(compradoBase, 3),
        presentacionSugeridaId: presentacionId,
        cantidadPresentaciones: aNumeric(calculo.cantidadPresentaciones, 3),
        aComprarBase: aNumeric(calculo.aComprarBase, 3),
        sobrantePrevistoBase: aNumeric(calculo.sobrantePrevistoBase, 3),
        proveedorSugeridoId: oferta?.proveedorId ?? null,
        proveedorProductoSugeridoId: oferta?.ofertaId ?? null,
        precioSugerido: oferta ? aNumeric(oferta.precio, 4) : null,
        costoEstimado: costo ? aNumeric(costo, 2) : null,
        estado: calculo.estado,
        sinPedido: dec(necesidadBase).isZero() && dec(compradoBase).gt(0),
        alertas: sugerencia.alertas,
        necesidadModificada: anterior?.necesidadModificada || necesidadModificada,
        observaciones: necesidades.find((n) => n.productoId === prod.id)?.notas ?? null,
        actualizadoPor: c.usuarioId,
      };
      if (anterior) {
        await tx.update(listaCompraItem).set(valores).where(eq(listaCompraItem.id, anterior.id));
      } else {
        await tx.insert(listaCompraItem).values({ ...valores, empresaId: c.empresaId, listaCompraId: lista!.id, productoId: prod.id, creadoPor: c.usuarioId });
      }
    }

    const version = existente ? existente.version + 1 : 1;
    await tx
      .update(listaCompra)
      .set({
        version,
        desactualizada: false,
        generadaEn: sql`now()`,
        generadaPor: c.usuarioId,
        costoEstimadoTotal: aNumeric(sumar(costos), 2),
        actualizadoPor: c.usuarioId,
      })
      .where(eq(listaCompra.id, lista!.id));
    await tx
      .update(pedido)
      .set({ estado: "EN_COMPRA", actualizadoPor: c.usuarioId })
      .where(and(eq(pedido.jornadaId, j.id), eq(pedido.estado, "CONFIRMADO")));
    if (j.estado === "ABIERTA") await tx.update(jornada).set({ estado: "COMPRANDO", compraIniciadaEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: existente ? "MODIFICAR" : "CREAR",
      entidad: "lista_compra",
      entidadId: lista!.id,
      resumen: `${numero} versión ${version} para el ${fecha}.${cambios.length ? ` Cambios: ${cambios.join("; ")}.` : ""}`,
    });
    return { listaId: lista!.id, numero, version, borradores, cambios };
  });
}

/** P-50: la lista de un día agrupada por proveedor (plan de compra, 04 §5.c.3). */
export async function obtenerListaCompra(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<ListaDeCompra | null> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.ver", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return null;
    const [lista] = await tx.select().from(listaCompra).where(eq(listaCompra.jornadaId, j.id));
    if (!lista) return null;
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const verCredito = c.permisos.tiene("proveedores.ver_credito");
    const filas = await tx
      .select({
        item: listaCompraItem,
        producto: producto.nombre,
        unidadBase: producto.unidadBase,
        presentacion: presentacion.nombre,
        factor: presentacion.factorABase,
        proveedor: proveedor.nombre,
        ubicacion: proveedor.ubicacionMercado,
        limite: proveedor.limiteCredito,
        categoriaOrden: categoria.orden,
      })
      .from(listaCompraItem)
      .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(presentacion, eq(presentacion.id, listaCompraItem.presentacionSugeridaId))
      .leftJoin(proveedor, eq(proveedor.id, listaCompraItem.proveedorSugeridoId))
      .where(eq(listaCompraItem.listaCompraId, lista.id))
      .orderBy(asc(categoria.orden), asc(producto.nombre));

    const lineas = filas
      .filter((f) => !(dec(f.item.necesidadBase).isZero() && dec(f.item.compradoBase).isZero()))
      .map(
        (f): LineaDeLista => ({
          id: f.item.id,
          productoId: f.item.productoId,
          producto: f.producto,
          unidadBase: f.unidadBase,
          necesidadBase: f.item.necesidadBase,
          compradoBase: f.item.compradoBase,
          pendienteBase: Decimal.max(dec(f.item.necesidadNetaBase).minus(f.item.compradoBase), 0).toString(),
          presentacionId: f.item.presentacionSugeridaId,
          presentacion: f.presentacion,
          factor: f.factor ?? "1",
          cantidadPresentaciones: f.item.cantidadPresentaciones,
          aComprarBase: f.item.aComprarBase,
          // Ya comprado: el sobrante es el real (lo que se compró de más), no el previsto.
          sobrantePrevistoBase:
            f.item.estado === "COMPRADO" ? Decimal.max(dec(f.item.compradoBase).minus(f.item.necesidadNetaBase), 0).toFixed(3) : f.item.sobrantePrevistoBase,
          ajusteManual: f.item.ajusteManual,
          motivoAjuste: f.item.motivoAjuste,
          proveedorId: f.item.proveedorSugeridoId,
          proveedor: f.proveedor,
          ubicacion: f.ubicacion,
          asignacionManual: f.item.asignacionManual,
          precioSugerido: verCostos ? f.item.precioSugerido : null,
          costoEstimado: verCostos ? f.item.costoEstimado : null,
          estado: f.item.estado,
          motivoNoConseguido: f.item.motivoNoConseguido,
          sinPedido: f.item.sinPedido,
          alertas: f.item.alertas as AlertaLista[],
          necesidadModificada: f.item.necesidadModificada,
          observaciones: f.item.observaciones,
        }),
      );
    const limites = new Map(filas.map((f) => [f.item.proveedorSugeridoId, f.limite]));

    const umbrales = await umbralesSemaforo(tx);
    const grupos = new Map<string, LineaDeLista[]>();
    for (const l of lineas) grupos.set(l.proveedorId ?? "", [...(grupos.get(l.proveedorId ?? "") ?? []), l]);
    const plan: PlanProveedor[] = [];
    for (const [provId, ls] of grupos) {
      const subtotal = sumar(ls.filter((l) => l.estado !== "COMPRADO").map((l) => l.costoEstimado ?? "0"));
      let credito: PlanProveedor["credito"] = null;
      if (verCredito && provId) {
        const neto = await saldoNeto(tx, provId);
        const limite = limites.get(provId) ?? null;
        const despues = indicadoresCredito(dec(neto).plus(subtotal), limite, umbrales);
        credito = {
          disponibleHoy: limite === null ? null : dec(limite).minus(neto).toString(),
          disponibleDespues: despues.disponible?.toString() ?? null,
          semaforoProyectado: despues.semaforo,
        };
      }
      plan.push({
        proveedorId: provId || null,
        proveedor: ls[0]!.proveedor ?? "Sin proveedor",
        ubicacion: ls[0]!.ubicacion,
        lineas: ls,
        subtotal: verCostos ? subtotal.toFixed(2) : null,
        credito,
      });
    }
    plan.sort((a, b) => (a.proveedorId === null ? 1 : b.proveedorId === null ? -1 : (a.ubicacion ?? a.proveedor).localeCompare(b.ubicacion ?? b.proveedor, "es", { numeric: true })));

    return {
      id: lista.id,
      numero: formatearNumeroDocumento("LC-", lista.numero),
      jornadaId: j.id,
      fecha,
      estadoJornada: j.estado,
      version: lista.version,
      desactualizada: lista.desactualizada,
      generadaEn: lista.generadaEn,
      costoEstimadoTotal: verCostos ? lista.costoEstimadoTotal : null,
      plan,
    };
  });
}

const esquemaCambioLinea = z.object({
  itemId: z.uuid(),
  /** Cantidad de presentaciones a comprar fijada a mano (con motivo). Vacío = volver al cálculo. */
  cantidad: numeroObligatorio("Escribí cuántos bultos comprar.").nullish(),
  motivo: textoOpcional(200),
  /** Otra oferta (proveedor y presentación) para esta línea. */
  ofertaId: z.uuid().nullish(),
});

/** Cambios del comprador en una línea (RN-050): cantidad a mano con motivo o proveedor elegido a mano. */
export async function cambiarLineaLista(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCambioLinea>): Promise<void> {
  const d = validar(esquemaCambioLinea, datos);
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const [l] = await tx.select().from(listaCompraItem).where(eq(listaCompraItem.id, d.itemId)).for("update");
    if (!l) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
    let oferta = null as null | { id: string; proveedorId: string; presentacionId: string; precio: string; factor: string };
    if (d.ofertaId) {
      const [o] = await tx
        .select({ id: proveedorProducto.id, proveedorId: proveedorProducto.proveedorId, presentacionId: proveedorProducto.presentacionId, precio: proveedorProducto.precioVigente, factor: presentacion.factorABase })
        .from(proveedorProducto)
        .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
        .where(and(eq(proveedorProducto.id, d.ofertaId), eq(proveedorProducto.productoId, l.productoId), eq(proveedorProducto.activo, true)));
      if (!o) throw new ErrorDeNegocio("VALIDACION", "Ese proveedor no tiene oferta activa para este producto.");
      oferta = o;
    }
    const manual = d.cantidad !== undefined && d.cantidad !== null;
    if (manual && dec(d.cantidad!).lt(0)) throw new ErrorDeNegocio("VALIDACION", "La cantidad no puede ser negativa.");
    if (manual && (!d.motivo || d.motivo.length < 3)) throw new ErrorDeNegocio("VALIDACION", "Anotá por qué cambiás la cantidad (ej. un cajón de más por las dudas).");
    const factor = oferta?.factor ?? (l.cantidadPresentaciones && l.aComprarBase && !dec(l.cantidadPresentaciones).isZero() ? dec(l.aComprarBase).div(l.cantidadPresentaciones).toString() : "1");
    const precio = oferta?.precio ?? l.precioSugerido;
    const calculo = calcularLineaLista({
      necesidadBase: l.necesidadNetaBase,
      compradoBase: l.compradoBase,
      factor,
      cantidadManual: manual ? d.cantidad! : l.ajusteManual && !oferta ? l.cantidadPresentaciones : null,
      marcadaNoConseguido: l.estado === "NO_CONSEGUIDO",
    });
    await tx
      .update(listaCompraItem)
      .set({
        cantidadPresentaciones: aNumeric(calculo.cantidadPresentaciones, 3),
        aComprarBase: aNumeric(calculo.aComprarBase, 3),
        sobrantePrevistoBase: aNumeric(calculo.sobrantePrevistoBase, 3),
        ajusteManual: manual || (l.ajusteManual && !oferta),
        motivoAjuste: manual ? d.motivo : l.motivoAjuste,
        ...(oferta && {
          proveedorSugeridoId: oferta.proveedorId,
          proveedorProductoSugeridoId: oferta.id,
          presentacionSugeridaId: oferta.presentacionId,
          asignacionManual: true,
          alertas: [],
        }),
        precioSugerido: precio,
        costoEstimado: precio ? aNumeric(redondear2(calculo.cantidadPresentaciones.times(precio)), 2) : null,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(listaCompraItem.id, l.id));
  });
}

/** "No se consiguió" con motivo (RN-051); `motivo` nulo quita la marca. */
export async function marcarNoConseguido(db: BaseDatos, authUserId: string, datos: { itemId: string; motivo: string | null }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const [l] = await tx.select().from(listaCompraItem).where(eq(listaCompraItem.id, datos.itemId)).for("update");
    if (!l) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
    const motivo = datos.motivo?.trim() ?? null;
    if (motivo !== null && motivo.length < 3) throw new ErrorDeNegocio("VALIDACION", "Anotá por qué no se consiguió (ej. no había en el mercado).");
    const estado = estadoLineaLista(l.necesidadNetaBase, l.compradoBase, motivo !== null);
    if (motivo !== null && estado !== "NO_CONSEGUIDO") throw new ErrorDeNegocio("VALIDACION", "Ese producto ya está comprado.");
    await tx.update(listaCompraItem).set({ estado, motivoNoConseguido: motivo, actualizadoPor: c.usuarioId }).where(eq(listaCompraItem.id, l.id));
  });
}

/** Ofertas activas de un producto, para elegir otro proveedor en una línea de la lista. */
export async function ofertasParaLinea(db: BaseDatos, authUserId: string, productoIds: string[]) {
  if (productoIds.length === 0) return [];
  return ejecutarComoUsuario(db, authUserId, "lista_compra.ver", async (tx) =>
    tx
      .select({
        ofertaId: proveedorProducto.id,
        productoId: proveedorProducto.productoId,
        proveedor: proveedor.nombre,
        presentacion: presentacion.nombre,
        precio: proveedorProducto.precioVigente,
        costoBase: proveedorProducto.costoBase,
      })
      .from(proveedorProducto)
      .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
      .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
      .where(and(inArray(proveedorProducto.productoId, productoIds), eq(proveedorProducto.activo, true)))
      .orderBy(asc(proveedorProducto.costoBase)),
  );
}
