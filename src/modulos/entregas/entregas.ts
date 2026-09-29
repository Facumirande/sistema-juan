import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { cliente, documentoEmitido, entrega, entregaItem, jornada, pedido, pedidoItem, puntoEntrega, reparto, usuario } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { interpretarNumero } from "@/dominio/dinero/entrada";
import { entregaConDiferencias, transicionEntregaPermitida, type EstadoEntrega, type MotivoDiferencia } from "@/dominio/entregas/entregas";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { numeroPedido } from "@/modulos/pedidos/pedidos";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { textoOpcional, validar } from "@/modulos/validacion";

import { configuracionEmpresa, entregaBloqueada, exigirJornadaAbierta, jornadaDeFecha, moverPedidosDeEntrega, numeroEntrega, numeroReparto } from "./comun";
import { documentosAlDia, documentosDeEntrega, emitirDocumentosEntrega, lineasOperativas, reemitirSiCorresponde, type ContenidoListaContable, type ContenidoListaEntrega, type ResultadoEmision } from "./documentos";
import { finalizarSiCorresponde } from "./repartos";
import { facturarAlConfirmar } from "@/modulos/facturacion/facturacion";

// Entregas (04 §5.f): confirmación, diferencias, correcciones y anulación (RN-120 a RN-135).

/** Un repartidor (ve sus repartos, no todos) solo accede a las entregas de sus repartos (RN-131). */
function soloSusRepartos(c: ContextoUsuario): boolean {
  return c.permisos.tiene("repartos.ver_propios") && !c.permisos.tiene("repartos.ver");
}

const MOTIVOS = ["RECHAZO_CALIDAD", "FALTANTE", "NO_CONSEGUIDO", "ERROR_PREPARACION", "CAMBIO_CLIENTE", "OTRO"] as const;

export interface EntregaListada {
  id: string;
  numero: string;
  version: number;
  cliente: string;
  punto: string;
  reparto: string | null;
  orden: number | null;
  estado: EstadoEntrega;
  conDiferencias: boolean;
  facturacion: string;
  documentosAlDia: boolean;
  /** Solo con `precios.ver_venta`. */
  total: string | null;
}

/** P-79 Entregas del día. */
export async function listarEntregas(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<EntregaListada[]> {
  return ejecutarComoUsuario(db, authUserId, "entregas.ver", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return [];
    const filas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        version: entrega.version,
        cliente: cliente.nombre,
        punto: puntoEntrega.nombre,
        reparto: reparto.numero,
        orden: entrega.ordenEnReparto,
        estado: entrega.estado,
        conDiferencias: entrega.conDiferencias,
        facturacion: entrega.estadoFacturacion,
        total: entrega.importeTotal,
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
      .where(eq(entrega.jornadaId, j.id))
      .orderBy(sql`${entrega.estado} = 'ANULADA'`, sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, asc(cliente.nombre));
    const verVenta = c.permisos.tiene("precios.ver_venta");
    const res: EntregaListada[] = [];
    for (const f of filas) {
      res.push({
        ...f,
        numero: numeroEntrega(f.numero),
        reparto: f.reparto !== null ? numeroReparto(f.reparto) : null,
        documentosAlDia: await documentosAlDia(tx, f.id, f.version),
        total: verVenta && f.version > 0 ? f.total : null,
      });
    }
    return res;
  });
}

async function cabecera(tx: Transaccion, entregaId: string) {
  const [f] = await tx
    .select({
      e: entrega,
      fecha: jornada.fecha,
      jornadaEstado: jornada.estado,
      cliente: cliente.nombre,
      requiereFirma: cliente.requiereFirma,
      punto: puntoEntrega.nombre,
      direccion: puntoEntrega.direccion,
      localidad: puntoEntrega.localidad,
      desde: puntoEntrega.horarioDesde,
      hasta: puntoEntrega.horarioHasta,
      contacto: puntoEntrega.contactoNombre,
      telefono: puntoEntrega.contactoTelefono,
      latitud: puntoEntrega.latitud,
      longitud: puntoEntrega.longitud,
      instrucciones: puntoEntrega.instruccionesEntrega,
      reparto: reparto.numero,
      repartidorId: reparto.repartidorId,
      confirmadaPor: usuario.nombre,
    })
    .from(entrega)
    .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
    .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
    .leftJoin(usuario, eq(usuario.id, entrega.confirmadaPor))
    .where(eq(entrega.id, entregaId));
  if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
  return {
    id: f.e.id,
    numero: numeroEntrega(f.e.numero),
    version: f.e.version,
    fecha: f.fecha,
    jornadaEstado: f.jornadaEstado,
    estado: f.e.estado,
    conDiferencias: f.e.conDiferencias,
    facturacion: f.e.estadoFacturacion,
    cliente: f.cliente,
    requiereFirma: f.requiereFirma,
    punto: f.punto,
    direccion: [f.direccion, f.localidad].filter(Boolean).join(", "),
    horario: f.desde || f.hasta ? `${f.desde?.slice(0, 5) ?? "?"}–${f.hasta?.slice(0, 5) ?? "?"}` : null,
    contacto: f.contacto,
    telefono: f.telefono,
    latitud: f.latitud,
    longitud: f.longitud,
    instrucciones: f.instrucciones,
    observaciones: f.e.observaciones,
    reparto: f.reparto !== null ? numeroReparto(f.reparto) : null,
    repartoId: f.e.repartoId,
    repartidorId: f.repartidorId,
    orden: f.e.ordenEnReparto,
    bultos: f.e.cantidadBultos,
    recibidoPor: f.e.recibidoPor,
    recibidoCargo: f.e.recibidoCargo,
    recibidoEn: f.e.recibidoEn,
    observacionesRecepcion: f.e.observacionesRecepcion,
    confirmadaPor: f.confirmadaPor,
    motivoAnulacion: f.e.motivoAnulacion,
  };
}

/**
 * P-78 (celular del repartidor): la entrega para confirmar, sin precios. Un repartidor sin
 * `entregas.ver` solo ve las de sus repartos (RN-131).
 */
export async function entregaParaConfirmar(db: BaseDatos, authUserId: string, entregaId: string) {
  return ejecutarComoUsuario(db, authUserId, "entregas.confirmar", async (tx, c) => {
    const cab = await cabecera(tx, entregaId);
    if (soloSusRepartos(c) && cab.repartidorId !== c.usuarioId) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    const lineas = await lineasOperativas(tx, entregaId);
    return { ...cab, lineas };
  });
}

/** P-80 Detalle de entrega: con precios congelados solo si el usuario puede verlos. */
export async function obtenerEntrega(db: BaseDatos, authUserId: string, entregaId: string) {
  return ejecutarComoUsuario(db, authUserId, "entregas.ver", async (tx, c) => {
    const cab = await cabecera(tx, entregaId);
    if (soloSusRepartos(c) && cab.repartidorId !== c.usuarioId) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    const lineas = await lineasOperativas(tx, entregaId);
    const verVenta = c.permisos.tiene("precios.ver_venta");
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const precios = verVenta
      ? await tx
          .select({
            id: entregaItem.id,
            precio: entregaItem.precioUnitario,
            importe: entregaItem.importe,
            costo: entregaItem.costoUnitario,
            origen: entregaItem.origenRegla,
            override: entregaItem.esOverride,
            alertas: entregaItem.alertas,
          })
          .from(entregaItem)
          .where(eq(entregaItem.entregaId, entregaId))
      : [];
    const [totales] = verVenta
      ? await tx.select({ neto: entrega.importeNeto, iva: entrega.importeIva, total: entrega.importeTotal, costo: entrega.costoTotal, congelados: entrega.preciosCongeladosEn }).from(entrega).where(eq(entrega.id, entregaId))
      : [];
    const pedidos = await tx
      .selectDistinct({ id: pedido.id, numero: pedido.numero, estado: pedido.estado })
      .from(entregaItem)
      .innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(eq(entregaItem.entregaId, entregaId));
    return {
      ...cab,
      documentosAlDia: await documentosAlDia(tx, entregaId, cab.version),
      lineas: lineas.map((l) => {
        const p = precios.find((x) => x.id === l.id);
        return { ...l, precio: p?.precio ?? null, importe: p?.importe ?? null, costo: verCostos ? (p?.costo ?? null) : null, origenRegla: p?.origen ?? null, override: p?.override ?? false, alertas: p?.alertas ?? [] };
      }),
      totales: totales ? { neto: totales.neto, iva: totales.iva, total: totales.total, costo: verCostos ? totales.costo : null, congelados: totales.congelados } : null,
      pedidos: pedidos.map((p) => ({ ...p, numero: numeroPedido(p.numero) })),
      documentos: await documentosDeEntrega(tx, entregaId),
    };
  });
}

/** P-80 "Emitir documentos" (entregas.emitir_documentos). */
export async function emitirDocumentos(
  db: BaseDatos,
  authUserId: string,
  datos: { entregaId: string; confirmaMargenNegativo: boolean },
): Promise<Extract<ResultadoEmision, { resultado: "EMITIDOS" | "YA_EMITIDOS" }>> {
  return ejecutarComoUsuario(db, authUserId, "entregas.emitir_documentos", async (tx, c) => {
    const r = await emitirDocumentosEntrega(tx, c, datos.entregaId, { confirmaMargenNegativo: datos.confirmaMargenNegativo });
    if (r.resultado === "SIN_PRECIO") throw new ErrorDeNegocio("PRECIO_SIN_COSTO", `Falta el precio de ${r.productos.join(", ")}: cargá el precio de compra o una regla de precio (RN-087).`);
    if (r.resultado === "MARGEN_NEGATIVO") {
      throw new ErrorDeNegocio("VALIDACION", `Se vende por debajo del costo: ${r.productos.join(", ")}. Si está bien, tocá "Confirmar" (RN-086).`, { requiereConfirmacion: true });
    }
    return r;
  });
}

const esquemaLinea = z.object({
  itemId: z.uuid(),
  entregada: z.string().trim().min(1, "Escribí cuánto se entregó."),
  motivo: z
    .enum(MOTIVOS)
    .nullish()
    .transform((v) => v ?? null),
  detalle: textoOpcional(200),
});

const esquemaConfirmacion = z.object({
  entregaId: z.uuid(),
  /** COMPLETA: todo lo preparado. DIFERENCIAS: cantidad por línea. NO_RECIBIO: todo en 0 (RN-134). */
  modo: z.enum(["COMPLETA", "DIFERENCIAS", "NO_RECIBIO"]),
  lineas: z.array(esquemaLinea).default([]),
  motivoNoRecibio: z
    .enum(["CAMBIO_CLIENTE", "OTRO"])
    .nullish()
    .transform((v) => v ?? null),
  detalleNoRecibio: textoOpcional(200),
  recibidoPor: textoOpcional(120),
  recibidoCargo: textoOpcional(80),
  observaciones: textoOpcional(500),
});

/** Aplica las cantidades entregadas (RN-126): nunca más de lo preparado; menos, con motivo. */
async function aplicarEntregado(tx: Transaccion, c: ContextoUsuario, entregaId: string, d: z.output<typeof esquemaConfirmacion>) {
  const items = await tx.select().from(entregaItem).where(eq(entregaItem.entregaId, entregaId));
  for (const i of items) {
    const preparada = dec(i.cantidadPreparada ?? "0");
    let entregada = preparada;
    let motivo: MotivoDiferencia | null = null;
    let detalle: string | null = null;
    if (d.modo === "NO_RECIBIO") {
      entregada = dec(0);
      if (!d.motivoNoRecibio) throw new ErrorDeNegocio("VALIDACION", "Elegí por qué no recibió (cancelado u otro).");
      motivo = preparada.gt(0) ? d.motivoNoRecibio : null;
      detalle = d.detalleNoRecibio;
      if (motivo === "OTRO" && !detalle) throw new ErrorDeNegocio("VALIDACION", "Contá qué pasó (ej. cliente cerrado).");
    } else if (d.modo === "DIFERENCIAS") {
      const l = d.lineas.find((x) => x.itemId === i.id);
      if (l) {
        const n = interpretarNumero(l.entregada);
        if (n === null || n.lt(0)) throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: la cantidad no es válida.`);
        if (n.gt(preparada)) throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: no se puede entregar más de lo preparado (RN-126). Si el cliente se quedó con más, cargá un pedido complementario.`);
        entregada = n;
        if (n.lt(preparada)) {
          if (!l.motivo) throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: elegí el motivo de la diferencia.`);
          if (l.motivo === "OTRO" && !l.detalle) throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: contá qué pasó.`);
          motivo = l.motivo;
          detalle = l.detalle;
        }
      }
    }
    await tx
      .update(entregaItem)
      .set({ cantidadEntregada: entregada.toFixed(3), motivoDiferencia: motivo, detalleDiferencia: detalle, actualizadoPor: c.usuarioId })
      .where(eq(entregaItem.id, i.id));
  }
  const empresa = await configuracionEmpresa(tx);
  const despues = await tx.select().from(entregaItem).where(eq(entregaItem.entregaId, entregaId));
  return entregaConDiferencias(
    despues.map((i) => ({ pedida: i.cantidadPedida, preparada: i.cantidadPreparada ?? "0", entregada: i.cantidadEntregada ?? "0", esSustitucion: i.esSustitucion })),
    empresa.toleranciaPesoPct,
  );
}

/**
 * P-78 Confirmar entrega (04 §5.f.3, RN-125 a RN-130, RN-134, RN-135): la entrega queda ENTREGADA
 * con quién recibió y la hora del servidor; los pedidos, ENTREGADO. Con diferencias, versión nueva y
 * reemisión de los documentos con lo entregado.
 */
export async function confirmarEntrega(
  db: BaseDatos,
  authUserId: string,
  datos: z.input<typeof esquemaConfirmacion>,
): Promise<{ documentos: ResultadoEmision | null; conDiferencias: boolean; factura: string | null }> {
  const d = validar(esquemaConfirmacion, datos);
  return ejecutarComoUsuario(db, authUserId, "entregas.confirmar", async (tx, c) => {
    const e = await entregaBloqueada(tx, d.entregaId);
    const cab = await cabecera(tx, e.id);
    if (soloSusRepartos(c) && cab.repartidorId !== c.usuarioId) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    exigirJornadaAbierta({ estado: cab.jornadaEstado });
    if (e.estado === "ENTREGADA") throw new ErrorDeNegocio("VALIDACION", "Esta entrega ya está confirmada.");
    if (!transicionEntregaPermitida(e.estado, "ENTREGADA")) throw new ErrorDeNegocio("VALIDACION", "La entrega todavía no está preparada.");
    // Si no recibió nadie (cliente cerrado), queda anotado así (RN-134).
    if (d.modo === "NO_RECIBIO" && !d.recibidoPor) d.recibidoPor = "Nadie (no recibió)";
    if (!d.recibidoPor) throw new ErrorDeNegocio("VALIDACION", "Escribí quién recibió (RN-125).");
    const conDiferencias = await aplicarEntregado(tx, c, e.id, d);
    await tx
      .update(entrega)
      .set({
        estado: "ENTREGADA",
        conDiferencias,
        recibidoPor: d.recibidoPor,
        recibidoCargo: d.recibidoCargo,
        recibidoEn: sql`now()`,
        observacionesRecepcion: d.observaciones,
        confirmadaPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(entrega.id, e.id));
    await moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA", "EN_PREPARACION", "PREPARADO", "EN_REPARTO"], "ENTREGADO");
    // Con diferencias, los documentos se reemiten con lo entregado (RN-128, RN-129). Si nunca se
    // habían emitido (confirmación desde la oficina), se emiten ahora.
    let documentos: ResultadoEmision | null = null;
    if (e.version === 0) documentos = await emitirDocumentosEntrega(tx, c, e.id, { confirmaMargenNegativo: true });
    else if (conDiferencias) documentos = await reemitirSiCorresponde(tx, c, e.id);
    await finalizarSiCorresponde(tx, c, e.repartoId);
    // Clientes que facturan por entrega: el comprobante sale solo (RN-143).
    const factura = await facturarAlConfirmar(tx, c, e.id);
    const [cli] = await tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, e.clienteId));
    const como = d.modo === "NO_RECIBIO" ? " (no recibió)" : conDiferencias ? " con diferencias" : "";
    await registrarActividad(tx, c, { accion: "ENTREGAR", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `entregó el pedido de ${cli?.nombre ?? "un cliente"}${como}` });
    return { documentos, conDiferencias, factura };
  });
}

const esquemaCorreccion = z.object({
  entregaId: z.uuid(),
  lineas: z.array(esquemaLinea).min(1),
  motivo: z.string().trim().min(5, "Escribí el motivo de la corrección (al menos 5 letras)."),
});

/**
 * Corrección administrativa de lo entregado (P-80, RN-128, RN-138): solo sin facturar y con la
 * jornada abierta; versión nueva y reemisión; queda en auditoría.
 */
export async function corregirEntrega(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCorreccion>): Promise<ResultadoEmision | null> {
  const d = validar(esquemaCorreccion, datos);
  return ejecutarComoUsuario(db, authUserId, "entregas.corregir", async (tx, c) => {
    const e = await entregaBloqueada(tx, d.entregaId);
    if (e.estado !== "ENTREGADA") throw new ErrorDeNegocio("VALIDACION", "Solo se corrige una entrega ya confirmada; antes, se cambia desde la preparación.");
    if (e.estadoFacturacion === "FACTURADA") throw new ErrorDeNegocio("DOCUMENTO_EMITIDO", "La entrega ya está facturada: anulá antes el comprobante (RN-138).");
    const [j] = await tx.select().from(jornada).where(eq(jornada.id, e.jornadaId));
    exigirJornadaAbierta(j);
    const antes = await tx.select({ id: entregaItem.id, producto: entregaItem.productoNombre, entregada: entregaItem.cantidadEntregada }).from(entregaItem).where(eq(entregaItem.entregaId, e.id));
    const conDiferencias = await aplicarEntregado(tx, c, e.id, { entregaId: e.id, modo: "DIFERENCIAS", lineas: d.lineas, motivoNoRecibio: null, detalleNoRecibio: null, recibidoPor: e.recibidoPor, recibidoCargo: null, observaciones: null });
    await tx.update(entrega).set({ conDiferencias, actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id));
    const despues = await tx.select({ id: entregaItem.id, entregada: entregaItem.cantidadEntregada }).from(entregaItem).where(eq(entregaItem.entregaId, e.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CORRECCION_ENTREGA",
      entidad: "entrega",
      entidadId: e.id,
      resumen: `Corrección de lo entregado en ${numeroEntrega(e.numero)}.`,
      motivo: d.motivo,
      datosAntes: Object.fromEntries(antes.map((a) => [a.producto, a.entregada])),
      datosDespues: Object.fromEntries(despues.map((x) => [antes.find((a) => a.id === x.id)!.producto, x.entregada])),
    });
    await registrarActividad(tx, c, { accion: "CORREGIR", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `corrigió lo entregado en ${numeroEntrega(e.numero)} (${d.motivo})` });
    return reemitirSiCorresponde(tx, c, e.id);
  });
}

/**
 * Anular una entrega (RN-132): con motivo y sin facturar. Sus documentos quedan ANULADO y sus
 * líneas de pedido quedan libres para otra entrega ("Iniciar preparación" las vuelve a tomar).
 */
export async function anularEntrega(db: BaseDatos, authUserId: string, datos: { entregaId: string; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula (al menos 5 letras).");
  await ejecutarComoUsuario(db, authUserId, "entregas.anular", async (tx, c) => {
    const e = await entregaBloqueada(tx, datos.entregaId);
    if (e.estado === "ANULADA") return;
    if (e.estadoFacturacion === "FACTURADA") throw new ErrorDeNegocio("DOCUMENTO_EMITIDO", "La entrega está facturada: anulá antes el comprobante (RN-132).");
    if (!transicionEntregaPermitida(e.estado, "ANULADA")) throw new ErrorDeNegocio("VALIDACION", "La entrega está en camino: sacala del reparto antes de anularla.");
    const [j] = await tx.select().from(jornada).where(eq(jornada.id, e.jornadaId));
    exigirJornadaAbierta(j);
    await tx
      .update(entrega)
      .set({ estado: "ANULADA", repartoId: null, ordenEnReparto: null, anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId })
      .where(eq(entrega.id, e.id));
    await tx
      .update(documentoEmitido)
      .set({ estado: "ANULADO", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId })
      .where(and(eq(documentoEmitido.entregaId, e.id), ne(documentoEmitido.estado, "ANULADO")));
    // Los pedidos vuelven a "en preparación" para armarse en otra entrega.
    await moverPedidosDeEntrega(tx, e.id, ["EN_PREPARACION", "PREPARADO", "ENTREGADO"], "EN_PREPARACION");
    await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "entrega", entidadId: e.id, resumen: `Anulación de ${numeroEntrega(e.numero)}.`, motivo });
    await registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `anuló la entrega ${numeroEntrega(e.numero)} (${motivo})` });
  });
}

export type DocumentoDeEntrega =
  | { tipo: "DOC_02"; contenido: ContenidoListaEntrega; estado: string; version: number; vigente: number }
  | { tipo: "DOC_03"; contenido: ContenidoListaContable; estado: string; version: number; vigente: number };

/**
 * El contenido guardado de un documento emitido (lo emitido no cambia). DOC-03 exige
 * `documentos.imprimir_contable` (RN-124: quien no ve precios no lo puede abrir).
 */
export async function documentoDeEntrega(db: BaseDatos, authUserId: string, datos: { entregaId: string; tipo: "DOC_02" | "DOC_03"; version?: number }): Promise<DocumentoDeEntrega | null> {
  const permiso = datos.tipo === "DOC_03" ? "documentos.imprimir_contable" : "documentos.imprimir_entrega";
  return ejecutarComoUsuario(db, authUserId, permiso, async (tx, c) => {
    const [e] = await tx.select({ version: entrega.version, repartidorId: reparto.repartidorId }).from(entrega).leftJoin(reparto, eq(reparto.id, entrega.repartoId)).where(eq(entrega.id, datos.entregaId));
    if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    if (soloSusRepartos(c) && e.repartidorId !== c.usuarioId) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    const [d] = await tx
      .select()
      .from(documentoEmitido)
      .where(
        and(
          eq(documentoEmitido.entregaId, datos.entregaId),
          eq(documentoEmitido.tipo, datos.tipo),
          eq(documentoEmitido.evento, "EMISION"),
          datos.version ? eq(documentoEmitido.version, datos.version) : undefined,
        ),
      )
      .orderBy(desc(documentoEmitido.version))
      .limit(1);
    if (!d) return null;
    return { tipo: datos.tipo, contenido: d.contenido, estado: d.estado, version: d.version, vigente: e.version } as DocumentoDeEntrega;
  });
}

/** Entregas de la jornada con sus documentos al día, para imprimir todas juntas (P-79). */
export async function entregasConDocumentos(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<string[]> {
  return ejecutarComoUsuario(db, authUserId, "documentos.imprimir_entrega", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return [];
    const filas = await tx
      .select({ id: entrega.id })
      .from(entrega)
      .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
      .where(and(eq(entrega.jornadaId, j.id), inArray(entrega.estado, ["PREPARADA", "EN_REPARTO", "ENTREGADA"]), sql`${entrega.version} > 0`))
      .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`);
    return filas.map((f) => f.id);
  });
}
