import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import { auditar } from "@/db/auditoria";
import { cliente, documentoEmitido, entrega, entregaItem, jornada, pedido, pedidoItem, presentacion, producto, puntoEntrega, reparto } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import { importeLinea, totalesEntrega } from "@/dominio/entregas/entregas";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { calcularPrecios } from "@/modulos/precios-venta/calculo";
import { numeroPedido } from "@/modulos/pedidos/pedidos";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";

import { configuracionEmpresa, entregaBloqueada, exigirJornadaAbierta, numeroEntrega, numeroReparto } from "./comun";

// Emisión de la lista de entrega (DOC-02, sin precios) y la lista contable (DOC-03) de una entrega
// (09 §4.2): se congelan los precios, se guardan los dos contenidos con la misma versión y las
// versiones anteriores quedan REEMPLAZADO.

export interface LineaListaEntrega {
  n: number;
  producto: string;
  reemplazaA: string | null;
  cantidad: string;
  unidad: string;
  /** "2 × Cajón 18 kg" si se pidió por presentación y da justo. */
  presentacion: string | null;
  observaciones: string | null;
}

export interface Recepcion {
  por: string;
  cargo: string | null;
  en: string;
}

interface Encabezado {
  /** Quien emite (09 §5.1). */
  empresa: { nombre: string; razonSocial: string | null; identificacionFiscal: string | null; direccion: string | null; telefono: string | null };
  numero: string;
  version: number;
  fechaEntrega: FechaISO;
  cliente: string;
  puntoEntrega: string | null;
  direccion: string | null;
  referenciaCliente: string | null;
  pedidos: string[];
  recibido: Recepcion | null;
  emitido: { en: string; por: string };
}

/** DOC-02: ningún importe (RN-124). */
export interface ContenidoListaEntrega extends Encabezado {
  tipo: "DOC_02";
  recepcion: string | null;
  contacto: string | null;
  reparto: string | null;
  parada: number | null;
  bultos: number | null;
  instrucciones: string | null;
  observaciones: string | null;
  lineas: LineaListaEntrega[];
}

export interface ContenidoListaContable extends Encabezado {
  tipo: "DOC_03";
  razonSocial: string | null;
  identificacionFiscal: string | null;
  lineas: (Omit<LineaListaEntrega, "observaciones"> & { precioUnitario: string | null; importe: string; alicuotaIva: string })[];
  neto: string;
  iva: string;
  total: string;
  preciosFijadosEn: string | null;
}

export type ResultadoEmision =
  | { resultado: "EMITIDOS"; version: number }
  | { resultado: "YA_EMITIDOS"; version: number }
  | { resultado: "SIN_PRECIO"; productos: string[] }
  | { resultado: "MARGEN_NEGATIVO"; productos: string[] };

const horario = (desde: string | null, hasta: string | null) => (desde || hasta ? `${desde?.slice(0, 5) ?? "?"} a ${hasta?.slice(0, 5) ?? "?"}` : null);

/** Cantidad del documento: la entregada si ya se confirmó; si no, la preparada (RN-129). */
const cantidadDocumento = (i: { cantidadEntregada: string | null; cantidadPreparada: string | null }) => i.cantidadEntregada ?? i.cantidadPreparada ?? "0";

function enPresentacion(cantidad: string, factor: string | null, nombre: string | null): string | null {
  if (!factor || !nombre || dec(factor).lte(1)) return null;
  const n = dec(cantidad).div(factor);
  return n.isInteger() && n.gt(0) ? `${n.toString()} × ${nombre}` : null;
}

async function encabezado(tx: Transaccion, entregaId: string, emitido: { en: Date; por: string }) {
  const [f] = await tx
    .select({
      numero: entrega.numero,
      version: entrega.version,
      fecha: jornada.fecha,
      clienteNombre: entrega.clienteNombre,
      puntoNombre: entrega.puntoEntregaNombre,
      direccion: entrega.direccionEntrega,
      referencia: entrega.referenciaCliente,
      recibidoPor: entrega.recibidoPor,
      recibidoCargo: entrega.recibidoCargo,
      recibidoEn: entrega.recibidoEn,
    })
    .from(entrega)
    .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
    .where(eq(entrega.id, entregaId));
  if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
  const pedidos = await tx
    .selectDistinct({ numero: pedido.numero })
    .from(entregaItem)
    .innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
    .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
    .where(eq(entregaItem.entregaId, entregaId))
    .orderBy(asc(pedido.numero));
  const emp = await configuracionEmpresa(tx);
  return {
    empresa: { nombre: emp.nombre, razonSocial: emp.razonSocial, identificacionFiscal: emp.identificacionFiscal, direccion: emp.direccion, telefono: emp.telefono },
    numero: numeroEntrega(f.numero),
    version: f.version,
    fechaEntrega: f.fecha,
    cliente: f.clienteNombre ?? "",
    puntoEntrega: f.puntoNombre,
    direccion: f.direccion,
    referenciaCliente: f.referencia,
    pedidos: pedidos.map((p) => numeroPedido(p.numero)),
    recibido: f.recibidoPor && f.recibidoEn ? { por: f.recibidoPor, cargo: f.recibidoCargo, en: f.recibidoEn.toISOString() } : null,
    emitido: { en: emitido.en.toISOString(), por: emitido.por },
  };
}

/**
 * Contenido de DOC-02. La consulta elige columna por columna y no lee ningún campo de precio,
 * costo ni importe (RN-124): lo verifica una prueba sobre el contenido guardado.
 */
export async function contenidoListaEntrega(tx: Transaccion, entregaId: string, emitido: { en: Date; por: string }): Promise<ContenidoListaEntrega> {
  const cab = await encabezado(tx, entregaId, emitido);
  const [e] = await tx
    .select({
      bultos: entrega.cantidadBultos,
      observaciones: entrega.observaciones,
      orden: entrega.ordenEnReparto,
      reparto: reparto.numero,
      desde: puntoEntrega.horarioDesde,
      hasta: puntoEntrega.horarioHasta,
      contacto: puntoEntrega.contactoNombre,
      telefono: puntoEntrega.contactoTelefono,
      instrucciones: puntoEntrega.instruccionesEntrega,
    })
    .from(entrega)
    .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
    .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
    .where(eq(entrega.id, entregaId));
  const items = await lineasOperativas(tx, entregaId);
  return {
    tipo: "DOC_02",
    ...cab,
    recepcion: horario(e!.desde, e!.hasta),
    contacto: [e!.contacto, e!.telefono].filter(Boolean).join(" · ") || null,
    reparto: e!.reparto !== null ? numeroReparto(e!.reparto) : null,
    parada: e!.orden,
    bultos: e!.bultos,
    instrucciones: e!.instrucciones,
    observaciones: e!.observaciones,
    lineas: items.map((i, n) => ({
      n: n + 1,
      producto: i.producto,
      reemplazaA: i.reemplazaA,
      cantidad: cantidadDocumento(i),
      unidad: i.unidad,
      presentacion: enPresentacion(cantidadDocumento(i), i.factor, i.presentacion),
      observaciones: i.observaciones,
    })),
  };
}

/** Líneas de una entrega sin ningún dato de precio: para DOC-02, DOC-07 y las pantallas de preparación y reparto. */
export async function lineasOperativas(tx: Transaccion, entregaId: string) {
  const sustituido = sql<string | null>`(select p.nombre from ${producto} p where p.id = entrega_item.sustituye_producto_id)`;
  return tx
    .select({
      id: entregaItem.id,
      linea: entregaItem.linea,
      productoId: entregaItem.productoId,
      producto: entregaItem.productoNombre,
      unidad: entregaItem.unidadBase,
      esSustitucion: entregaItem.esSustitucion,
      reemplazaA: sustituido,
      pedidoItemId: entregaItem.pedidoItemId,
      cantidadPedida: entregaItem.cantidadPedida,
      cantidadPropuesta: entregaItem.cantidadPropuesta,
      cantidadPreparada: entregaItem.cantidadPreparada,
      motivoFaltante: entregaItem.motivoFaltante,
      cantidadEntregada: entregaItem.cantidadEntregada,
      motivoDiferencia: entregaItem.motivoDiferencia,
      detalleDiferencia: entregaItem.detalleDiferencia,
      factor: entregaItem.factorABase,
      presentacion: presentacion.nombre,
      observaciones: entregaItem.observaciones,
    })
    .from(entregaItem)
    .leftJoin(presentacion, eq(presentacion.id, entregaItem.presentacionId))
    .where(eq(entregaItem.entregaId, entregaId))
    .orderBy(asc(entregaItem.linea));
}

async function contenidoListaContable(tx: Transaccion, entregaId: string, emitido: { en: Date; por: string }): Promise<ContenidoListaContable> {
  const cab = await encabezado(tx, entregaId, emitido);
  const [e] = await tx.select().from(entrega).where(eq(entrega.id, entregaId));
  const operativas = await lineasOperativas(tx, entregaId);
  const precios = await tx
    .select({ id: entregaItem.id, precio: entregaItem.precioUnitario, importe: entregaItem.importe, alicuota: entregaItem.alicuotaIva })
    .from(entregaItem)
    .where(eq(entregaItem.entregaId, entregaId));
  return {
    tipo: "DOC_03",
    ...cab,
    razonSocial: e!.clienteRazonSocial,
    identificacionFiscal: e!.clienteIdentificacionFiscal,
    lineas: operativas.map((i, n) => {
      const p = precios.find((x) => x.id === i.id)!;
      return {
        n: n + 1,
        producto: i.producto,
        reemplazaA: i.reemplazaA,
        cantidad: cantidadDocumento(i),
        unidad: i.unidad,
        presentacion: enPresentacion(cantidadDocumento(i), i.factor, i.presentacion),
        precioUnitario: p.precio,
        importe: p.importe ?? "0.00",
        alicuotaIva: p.alicuota ?? "0.000",
      };
    }),
    neto: e!.importeNeto,
    iva: e!.importeIva,
    total: e!.importeTotal,
    preciosFijadosEn: e!.preciosCongeladosEn?.toISOString() ?? null,
  };
}

/** ¿Están emitidos los documentos de la versión vigente? (RN-122) */
export async function documentosAlDia(tx: Transaccion, entregaId: string, version: number): Promise<boolean> {
  if (version === 0) return false;
  const [d] = await tx
    .select({ id: documentoEmitido.id })
    .from(documentoEmitido)
    .where(and(eq(documentoEmitido.entregaId, entregaId), eq(documentoEmitido.tipo, "DOC_02"), eq(documentoEmitido.version, version), eq(documentoEmitido.evento, "EMISION")));
  return Boolean(d);
}

/**
 * Emite DOC-02 y DOC-03 de la versión vigente (09 §4.2). La primera emisión congela los precios
 * (RN-089, RN-121); una línea que se agrega después se congela en su primera emisión. Si falta un
 * precio o hay margen negativo sin confirmar, no cambia nada y lo informa.
 */
export async function emitirDocumentosEntrega(tx: Transaccion, c: ContextoUsuario, entregaId: string, opciones: { confirmaMargenNegativo?: boolean } = {}): Promise<ResultadoEmision> {
  const e = await entregaBloqueada(tx, entregaId);
  if (!["PREPARADA", "EN_REPARTO", "ENTREGADA"].includes(e.estado)) throw new ErrorDeNegocio("VALIDACION", "Los documentos se emiten cuando la entrega está preparada.");
  if (e.estadoFacturacion === "FACTURADA") throw new ErrorDeNegocio("DOCUMENTO_EMITIDO", "La entrega ya está facturada: para corregirla, anulá antes el comprobante (RN-138).");
  const [j] = await tx.select().from(jornada).where(eq(jornada.id, e.jornadaId));
  exigirJornadaAbierta(j);
  const version = Math.max(e.version, 1);
  if (await documentosAlDia(tx, entregaId, version)) return { resultado: "YA_EMITIDOS", version };

  // Precios: los ya congelados no se tocan; el resto se calcula ahora (o se usa el precio manual del pedido).
  const items = await tx
    .select({ item: entregaItem, precioManual: pedidoItem.precioManual, motivoManual: pedidoItem.motivoPrecioManual, alicuota: producto.alicuotaIva })
    .from(entregaItem)
    .innerJoin(producto, eq(producto.id, entregaItem.productoId))
    .leftJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
    .where(eq(entregaItem.entregaId, entregaId))
    .orderBy(asc(entregaItem.linea));
  const aCongelar = items.filter((i) => i.item.precioUnitario === null && i.precioManual === null);
  const calculados = await calcularPrecios(tx, { clienteId: e.clienteId, fecha: j!.fecha, lineas: aCongelar.map((i) => ({ productoId: i.item.productoId, presentacionId: null })) });
  const nuevo = new Map(aCongelar.map((i, n) => [i.item.id, calculados[n]!]));

  const precioDe = (i: (typeof items)[number]) => i.item.precioUnitario ?? i.precioManual ?? (nuevo.get(i.item.id)?.precioUnitario ? aNumeric(nuevo.get(i.item.id)!.precioUnitario!, 4) : null);
  const sinPrecio = items.filter((i) => precioDe(i) === null && dec(cantidadDocumento(i.item)).gt(0));
  if (sinPrecio.length > 0) return { resultado: "SIN_PRECIO", productos: [...new Set(sinPrecio.map((i) => i.item.productoNombre))] };
  const negativos = aCongelar.filter((i) => nuevo.get(i.item.id)!.alertas.includes("MARGEN_NEGATIVO"));
  if (negativos.length > 0 && !opciones.confirmaMargenNegativo) return { resultado: "MARGEN_NEGATIVO", productos: [...new Set(negativos.map((i) => i.item.productoNombre))] };

  for (const i of items) {
    const precio = precioDe(i);
    const cantidad = cantidadDocumento(i.item);
    const cambios: Partial<typeof entregaItem.$inferInsert> = { importe: aNumeric(precio ? importeLinea(cantidad, precio) : 0, 2), actualizadoPor: c.usuarioId };
    if (i.item.precioUnitario === null) {
      const r = nuevo.get(i.item.id);
      Object.assign(cambios, {
        precioUnitario: precio,
        alicuotaIva: i.alicuota,
        costoUnitario: r?.costoUnitario ? aNumeric(r.costoUnitario, 4) : null,
        origenCosto: r?.origenCosto ?? null,
        recargoAplicado: r ? ((r.recargoAplicado ?? r.recargoEquivalente) ? aNumeric((r.recargoAplicado ?? r.recargoEquivalente)!, 3) : null) : null,
        origenRegla: r?.origen ?? (i.precioManual !== null ? "MANUAL" : null),
        reglaPrecioId: r?.reglaId ?? null,
        esOverride: i.precioManual !== null,
        motivoOverride: i.precioManual !== null ? (i.motivoManual ?? "Precio manual del pedido") : null,
        alertas: r?.alertas ?? [],
      });
    }
    await tx.update(entregaItem).set(cambios).where(eq(entregaItem.id, i.item.id));
  }

  const valorizadas = await tx
    .select({ entregada: entregaItem.cantidadEntregada, preparada: entregaItem.cantidadPreparada, precio: entregaItem.precioUnitario, costo: entregaItem.costoUnitario, alicuota: entregaItem.alicuotaIva })
    .from(entregaItem)
    .where(eq(entregaItem.entregaId, entregaId));
  const empresa = await configuracionEmpresa(tx);
  const t = totalesEntrega(
    valorizadas
      .filter((v) => v.precio !== null)
      .map((v) => ({ cantidad: v.entregada ?? v.preparada ?? "0", precioUnitario: v.precio!, costoUnitario: v.costo, alicuotaIva: v.alicuota ?? "0" })),
    empresa.preciosIncluyenIva,
  );
  const [datos] = await tx
    .select({ cliente, punto: puntoEntrega })
    .from(cliente)
    .innerJoin(puntoEntrega, eq(puntoEntrega.id, e.puntoEntregaId))
    .where(eq(cliente.id, e.clienteId));
  await tx
    .update(entrega)
    .set({
      version,
      preciosCongeladosEn: e.preciosCongeladosEn ?? sql`now()`,
      importeNeto: aNumeric(t.neto, 2),
      importeIva: aNumeric(t.iva, 2),
      importeTotal: aNumeric(t.total, 2),
      costoTotal: aNumeric(t.costo, 2),
      clienteNombre: datos!.cliente.nombre,
      clienteRazonSocial: datos!.cliente.razonSocial,
      clienteIdentificacionFiscal: datos!.cliente.identificacionFiscal,
      puntoEntregaNombre: datos!.punto.nombre,
      direccionEntrega: [datos!.punto.direccion, datos!.punto.localidad].filter(Boolean).join(", "),
      actualizadoPor: c.usuarioId,
    })
    .where(eq(entrega.id, entregaId));

  const emitido = { en: new Date(), por: c.nombre };
  const visible = `${numeroEntrega(e.numero)} v${version}`;
  for (const contenido of [await contenidoListaEntrega(tx, entregaId, emitido), await contenidoListaContable(tx, entregaId, emitido)]) {
    await tx.insert(documentoEmitido).values({
      empresaId: c.empresaId,
      tipo: contenido.tipo,
      entidad: "entrega",
      entidadId: entregaId,
      entregaId,
      version,
      evento: "EMISION",
      numeroVisible: visible,
      emitidoPor: c.usuarioId,
      contenido,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
  }
  await tx
    .update(documentoEmitido)
    .set({ estado: "REEMPLAZADO", actualizadoPor: c.usuarioId })
    .where(and(eq(documentoEmitido.entregaId, entregaId), inArray(documentoEmitido.tipo, ["DOC_02", "DOC_03"]), eq(documentoEmitido.estado, "VIGENTE"), lt(documentoEmitido.version, version)));
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "EMISION_DOCUMENTO",
    entidad: "entrega",
    entidadId: entregaId,
    resumen: `Lista de entrega y lista contable ${visible}.`,
    datosDespues: { total: aNumeric(t.total, 2) },
  });
  return { resultado: "EMITIDOS", version };
}

/**
 * Después de cambiar una entrega que ya tenía documentos: versión nueva y reemisión en la misma
 * transacción (RN-128). Si la versión vigente todavía no se había emitido, solo se intenta emitir.
 */
export async function reemitirSiCorresponde(tx: Transaccion, c: ContextoUsuario, entregaId: string): Promise<ResultadoEmision | null> {
  const [e] = await tx.select({ version: entrega.version, estado: entrega.estado }).from(entrega).where(eq(entrega.id, entregaId));
  if (!e || e.version === 0 || !["PREPARADA", "EN_REPARTO", "ENTREGADA"].includes(e.estado)) return null;
  if (await documentosAlDia(tx, entregaId, e.version)) await tx.update(entrega).set({ version: e.version + 1 }).where(eq(entrega.id, entregaId));
  return emitirDocumentosEntrega(tx, c, entregaId, { confirmaMargenNegativo: true });
}

/** Los documentos de una entrega: todas las versiones, la vigente primero. */
export async function documentosDeEntrega(tx: Transaccion, entregaId: string) {
  return tx
    .select({
      id: documentoEmitido.id,
      tipo: documentoEmitido.tipo,
      version: documentoEmitido.version,
      evento: documentoEmitido.evento,
      estado: documentoEmitido.estado,
      emitidoEn: documentoEmitido.emitidoEn,
      numeroVisible: documentoEmitido.numeroVisible,
    })
    .from(documentoEmitido)
    .where(eq(documentoEmitido.entregaId, entregaId))
    .orderBy(sql`${documentoEmitido.version} desc`, asc(documentoEmitido.tipo));
}
