import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import {
  compra,
  compraItem,
  condicionPago,
  empresa,
  imputacionPagoProveedor,
  jornada,
  listaCompra,
  listaCompraItem,
  medioPago,
  movimientoCuentaProveedor,
  pagoProveedor,
  presentacion,
  producto,
  proveedor,
} from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { estadoPagoCompra, indicadoresCredito, verificarLimite, type EstadoPagoCompra, type IndicadoresCredito } from "@/dominio/compras/credito";
import { aNumeric, dec, redondearPesos, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { variacionPorcentual } from "@/dominio/precios/compra";
import { aUnidadBase, costoPorUnidadBase } from "@/dominio/unidades/unidades";
import { jornadaParaPedidos } from "@/modulos/pedidos/jornadas";
import { recalcularPedidosPendientes } from "@/modulos/pedidos/pedidos";
import { actualizarOfertaPorCompra, preciosVigentes } from "@/modulos/precios-compra/ofertas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, numeroOpcional, textoOpcional, validar } from "@/modulos/validacion";

import { numeroCompra, numeroPago, pagadoDeCompra, proveedorBloqueado, registrarMovimiento, saldoNeto, umbralesSemaforo } from "./cuenta";
import { aplicarSaldoAFavor, desactivarImputaciones } from "./imputaciones";
import { anularPagoEnTransaccion } from "./pagos";
import { actualizarComprado } from "./lista-compra";

// Compras (04 §5.d, 06 §3 y §9): RN-054 a RN-065 y RN-109.

export type CondicionPago = (typeof condicionPago.enumValues)[number];
export type MedioPago = (typeof medioPago.enumValues)[number];


const esquemaItem = z.object({
  productoId: z.uuid("Elegí el producto."),
  presentacionId: z.uuid("Elegí la presentación."),
  cantidad: numeroObligatorio("Escribí cuántos bultos (ej. 10).").refine((v) => dec(v).gt(0), { message: "La cantidad tiene que ser mayor que 0." }),
  precio: numeroObligatorio("Escribí el precio de cada bulto.").refine((v) => dec(v).gte(0), { message: "El precio no puede ser negativo." }),
  observaciones: textoOpcional(200),
});

const esquemaCompra = z.object({
  fecha: z.string(),
  proveedorId: z.uuid("Elegí el proveedor."),
  condicion: z.enum(condicionPago.enumValues),
  /** Solo MIXTA: lo que se paga en el momento. */
  pagadoEnElActo: numeroOpcional("Escribí cuánto se paga ahora."),
  medioPago: z.enum(medioPago.enumValues).default("EFECTIVO"),
  items: z.array(esquemaItem).min(1, "Cargá al menos un producto."),
  numeroComprobante: textoOpcional(60),
  observaciones: textoOpcional(500),
  /** Confirma precios con variación brusca contra el vigente (RN-058). */
  confirmarVariacion: z.boolean().default(false),
  /** Motivo para superar el límite de crédito (solo con `compras.exceder_limite`, RN-063). */
  motivoExceso: textoOpcional(300),
  claveIdempotencia: z.uuid().nullish(),
});

export type DatosCompra = z.input<typeof esquemaCompra>;

export interface ResultadoCompra {
  compraId: string;
  numero: string;
  total: string;
  /** Aviso no bloqueante (ej. el proveedor queda en ROJO). */
  advertencia: string | null;
  credito: IndicadoresCredito;
}

/** Registra una compra con todos sus efectos en una sola transacción (04 §5.d.1 paso 6). */
export async function registrarCompra(db: BaseDatos, authUserId: string, datos: DatosCompra): Promise<ResultadoCompra> {
  const d = validar(esquemaCompra, datos);
  return ejecutarComoUsuario(db, authUserId, "compras.registrar", async (tx, c) => {
    if (d.claveIdempotencia) {
      const [ya] = await tx.select({ id: compra.id, numero: compra.numero, total: compra.total, proveedorId: compra.proveedorId }).from(compra).where(eq(compra.claveIdempotencia, d.claveIdempotencia));
      if (ya) {
        const [[p], saldo, umbrales] = await Promise.all([tx.select({ limite: proveedor.limiteCredito }).from(proveedor).where(eq(proveedor.id, ya.proveedorId)), saldoNeto(tx, ya.proveedorId), umbralesSemaforo(tx)]);
        return { compraId: ya.id, numero: numeroCompra(ya.numero), total: ya.total, advertencia: null, credito: indicadoresCredito(saldo, p?.limite ?? null, umbrales) };
      }
    }
    // Lo que hay que mirar sale junto (una ida a la base). El proveedor queda bloqueado antes de leer
    // su saldo: las funciones salen en el orden en que se las llama.
    const [j, prov, [e], presentaciones, vigentes, saldoActual, umbrales] = await Promise.all([
      jornadaParaCompras(tx, c, d.fecha),
      proveedorBloqueado(tx, d.proveedorId),
      tx.select().from(empresa),
      // Ítems: presentación de compra del producto (RN-055), cantidades en unidad base (RN-057)
      tx
        .select({ id: presentacion.id, productoId: presentacion.productoId, factor: presentacion.factorABase, compra: presentacion.usableEnCompra, activa: presentacion.activo, nombre: presentacion.nombre, producto: producto.nombre, admiteFraccion: producto.admiteFraccion, productoActivo: producto.activo })
        .from(presentacion)
        .innerJoin(producto, eq(producto.id, presentacion.productoId))
        .where(inArray(presentacion.id, d.items.map((i) => i.presentacionId))),
      preciosVigentes(tx, d.proveedorId),
      saldoNeto(tx, d.proveedorId),
      umbralesSemaforo(tx),
    ]);
    if (!prov.activo) throw new ErrorDeNegocio("VALIDACION", `${prov.nombre} está desactivado.`);
    const items = d.items.map((i) => {
      const pr = presentaciones.find((x) => x.id === i.presentacionId && x.productoId === i.productoId);
      if (!pr) throw new ErrorDeNegocio("VALIDACION", "Hay una presentación que no corresponde al producto.");
      if (!pr.compra || !pr.activa) throw new ErrorDeNegocio("VALIDACION", `"${pr.nombre}" no se usa para comprar ${pr.producto} (RN-055).`);
      if (!pr.productoActivo) throw new ErrorDeNegocio("VALIDACION", `${pr.producto} está desactivado.`);
      return {
        ...i,
        id: randomUUID(),
        producto: pr.producto,
        presentacion: pr.nombre,
        factor: pr.factor,
        cantidadBase: aUnidadBase(i.cantidad, pr.factor, pr.admiteFraccion),
        costoBase: costoPorUnidadBase(i.precio, pr.factor),
        subtotal: redondearPesos(dec(i.cantidad).times(i.precio)),
      };
    });
    const total = sumar(items.map((i) => i.subtotal));

    // Variación brusca contra el precio vigente del proveedor (RN-058)
    const bruscas = items.flatMap((i) => {
      const v = vigentes.find((x) => x.productoId === i.productoId && x.presentacionId === i.presentacionId);
      const variacion = v ? variacionPorcentual(v.precio, i.precio) : null;
      return variacion && variacion.abs().gt(dec(e!.variacionBruscaPct)) && !dec(i.precio).isZero()
        ? [`${i.producto} estaba a ${formatearMoneda(v!.precio)} y ahora ponés ${formatearMoneda(i.precio)} (${variacion.gt(0) ? "+" : ""}${formatearPorcentaje(variacion, 0)})`]
        : [];
    });
    if (bruscas.length > 0 && !d.confirmarVariacion) {
      const uno = bruscas.length === 1;
      throw new ErrorDeNegocio("VALIDACION", `Revisá ${uno ? "este precio, cambia" : "estos precios, cambian"} mucho: ${bruscas.join(" · ")}. Si ${uno ? "está" : "están"} bien, tocá "Confirmar".`, { requiereConfirmacion: true });
    }

    // Pago en el momento (RN-062)
    let pagado = dec(0);
    if (d.condicion === "CONTADO") pagado = total;
    if (d.condicion === "MIXTA") {
      pagado = dec(d.pagadoEnElActo ?? "0");
      if (pagado.lte(0) || pagado.gte(total)) throw new ErrorDeNegocio("VALIDACION", `En una compra mixta lo que se paga ahora tiene que ser más de $0 y menos que el total (${formatearMoneda(total)}).`);
    }

    // Límite de crédito con el saldo del proveedor bloqueado (RN-063, RN-109)
    const control = verificarLimite({ limite: prov.limiteCredito, saldoActual, totalCompra: total, pagadoEnElActo: pagado, rojoPct: e!.semaforoRojoPct });
    let excede = false;
    if (control.resultado === "BLOQUEO") {
      const mensaje = `Supera el límite de crédito de ${prov.nombre} (${formatearMoneda(prov.limiteCredito!)}): el saldo quedaría en ${formatearMoneda(control.saldoProyectado)}. Pagá al menos ${formatearMoneda(control.exceso)} ahora (mixta) o todo en contado.`;
      if (!d.motivoExceso) throw new ErrorDeNegocio("LIMITE_CREDITO_EXCEDIDO", mensaje, { exceso: control.exceso.toString() });
      c.permisos.exigir("compras.exceder_limite");
      if (d.motivoExceso.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se supera el límite (al menos 5 letras).");
      excede = true;
    }

    const hoy = hoyEnEmpresa(new Date(), e!.zonaHoraria);
    // Los números de la compra y de su pago, y los renglones de la lista del día, salen juntos.
    const [{ numero, visible }, np, lineasLista] = await Promise.all([
      siguienteNumero(tx, "COMPRA"),
      pagado.gt(0) ? siguienteNumero(tx, "PAGO_PROVEEDOR") : null,
      tx
        .select({ id: listaCompraItem.id, productoId: listaCompraItem.productoId, necesidad: listaCompraItem.necesidadBase })
        .from(listaCompraItem)
        .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
        .where(eq(listaCompra.jornadaId, j.id)),
    ]);
    const compraId = randomUUID();
    const fechaVencimiento = prov.plazoPagoDias !== null ? sumarDias(hoy, prov.plazoPagoDias) : null;
    // La compra y sus ítems se guardan juntos (una ida): primero la compra.
    await Promise.all([
      tx.insert(compra).values({
        id: compraId,
        empresaId: c.empresaId,
        numero,
        jornadaId: j.id,
        proveedorId: prov.id,
        condicionPago: d.condicion,
        total: aNumeric(total, 2),
        montoPagadoEnElActo: aNumeric(pagado, 2),
        medioPagoEnElActo: pagado.gt(0) ? d.medioPago : null,
        fechaVencimiento,
        numeroComprobanteProveedor: d.numeroComprobante,
        excedeLimite: excede,
        motivoExcesoLimite: excede ? d.motivoExceso : null,
        excesoAutorizadoPor: excede ? c.usuarioId : null,
        observaciones: d.observaciones,
        claveIdempotencia: d.claveIdempotencia ?? null,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      }),
      tx.insert(compraItem).values(
        items.map((i, n) => {
          const linea = lineasLista.find((l) => l.productoId === i.productoId);
          // El ítem de compra no se modifica después: si el precio va a cambiar la oferta, se sabe antes.
          const vigente = vigentes.find((x) => x.productoId === i.productoId && x.presentacionId === i.presentacionId);
          return {
            id: i.id,
            empresaId: c.empresaId,
            compraId,
            linea: n + 1,
            productoId: i.productoId,
            presentacionId: i.presentacionId,
            factorABase: aNumeric(i.factor, 3),
            cantidad: aNumeric(i.cantidad, 3),
            cantidadBase: aNumeric(i.cantidadBase, 3),
            precioUnitario: aNumeric(i.precio, 4),
            costoBase: aNumeric(i.costoBase, 4),
            subtotal: aNumeric(i.subtotal, 2),
            listaCompraItemId: linea?.id ?? null,
            sinPedido: !linea || dec(linea.necesidad).isZero(),
            proveedorProductoId: vigente?.ofertaId ?? null,
            actualizoPrecioLista: dec(i.precio).gt(0) && (!vigente || !dec(vigente.precio).eq(i.precio)),
            observaciones: i.observaciones,
            creadoPor: c.usuarioId,
            actualizadoPor: c.usuarioId,
          };
        }),
      ),
    ]);
    // El precio pagado pasa a ser el vigente del proveedor (RN-059); una bonificación no. Los ítems
    // de productos distintos van a la vez; si se repite un producto en la compra, uno después del otro.
    const conPrecio = items.filter((i) => dec(i.precio).gt(0));
    const alPrecioVigente = (i: (typeof items)[number]) =>
      actualizarOfertaPorCompra(tx, c, { proveedorId: prov.id, productoId: i.productoId, presentacionId: i.presentacionId, precio: aNumeric(i.precio, 4), compraItemId: i.id, referencia: visible });
    if (new Set(conPrecio.map((i) => `${i.productoId}:${i.presentacionId}`)).size === conPrecio.length) await Promise.all(conPrecio.map(alPrecioVigente));
    else for (const i of conPrecio) await alPrecioVigente(i);

    // Cuenta corriente: cargo por el total y, si se pagó algo, el pago imputado a esta compra (06 §3)
    if (total.gt(0)) {
      await registrarMovimiento(tx, c, {
        proveedorId: prov.id,
        tipo: "CARGO_COMPRA",
        importe: aNumeric(total, 2),
        descripcion: `Compra ${visible}`,
        compraId,
        fechaVencimiento,
      });
    }
    if (pagado.gt(0) && np) {
      const pagoId = randomUUID();
      await Promise.all([
        tx.insert(pagoProveedor).values({
          id: pagoId,
          empresaId: c.empresaId,
          numero: np.numero,
          proveedorId: prov.id,
          monto: aNumeric(pagado, 2),
          medioPago: d.medioPago,
          origen: "EN_COMPRA",
          compraId,
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        }),
        tx.insert(imputacionPagoProveedor).values({
          empresaId: c.empresaId,
          proveedorId: prov.id,
          pagoProveedorId: pagoId,
          compraId,
          monto: aNumeric(pagado, 2),
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        }),
      ]);
      await registrarMovimiento(tx, c, {
        proveedorId: prov.id,
        tipo: "PAGO",
        importe: aNumeric(pagado.neg(), 2),
        descripcion: `Pago ${np.visible} (${d.medioPago.toLowerCase()}) de la compra ${visible}`,
        pagoProveedorId: pagoId,
      });
    }
    // Lo que se tenía a favor con el proveedor cancela la parte a crédito (RN-098)
    if (d.condicion !== "CONTADO") await aplicarSaldoAFavor(tx, c, prov.id);

    // Lista de compra y precios estimados con el costo real (RN-080, RN-088), el saldo como quedó
    // y el registro de quién compró: todo a la vez.
    const [saldoFinal] = await Promise.all([
      saldoNeto(tx, prov.id),
      actualizarComprado(tx, c.empresaId, j.id),
      recalcularPedidosPendientes(tx, { productoIds: [...new Set(items.map((i) => i.productoId))] }),
      excede
        ? auditar(tx, {
            empresaId: c.empresaId,
            usuarioId: c.usuarioId,
            accion: "EXCESO_LIMITE",
            entidad: "compra",
            entidadId: compraId,
            resumen: `${visible} a ${prov.nombre} supera el límite de ${formatearMoneda(prov.limiteCredito!)}.`,
            motivo: d.motivoExceso,
            datosAntes: { saldo: saldoActual, limite: prov.limiteCredito },
            datosDespues: { compra: aNumeric(total, 2), pagado: aNumeric(pagado, 2) },
          })
        : null,
      registrarActividad(tx, c, { accion: "COMPRAR", entidadTipo: "COMPRA", entidadId: compraId, jornadaId: j.id, resumen: `registró la compra ${visible} a ${prov.nombre}` }),
    ]);
    return {
      compraId,
      numero: visible,
      total: aNumeric(total, 2),
      advertencia: control.resultado === "ADVERTENCIA" ? `${prov.nombre} queda en ${formatearPorcentaje(control.usoProyectadoPct, 1)} de su límite.` : null,
      credito: indicadoresCredito(saldoFinal, prov.limiteCredito, umbrales),
    };
  });
}

async function jornadaParaCompras(tx: Transaccion, c: ContextoUsuario, fecha: FechaISO) {
  const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha));
  if (j) {
    if (j.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "La jornada de ese día ya está cerrada (RN-054).");
    return j;
  }
  return jornadaParaPedidos(tx, c, fecha);
}

/**
 * RN-065: anular con motivo. El libro recibe el movimiento compensatorio, las imputaciones de la
 * compra se liberan y lo pagado se reimputa a otras compras pendientes (o queda a favor).
 */
export async function anularCompra(db: BaseDatos, authUserId: string, datos: { compraId: string; motivo: string; devolvioDinero?: boolean }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula (al menos 5 letras).");
  await ejecutarComoUsuario(db, authUserId, "compras.anular", (tx, c) => anularCompraEnTransaccion(tx, c, { compraId: datos.compraId, motivo, devolvioDinero: datos.devolvioDinero }));
}

/** Anula una compra dentro de una transacción ya abierta (06 §6.1). La usa también "destildar" en la lista de compras. */
export async function anularCompraEnTransaccion(tx: Transaccion, c: ContextoUsuario, datos: { compraId: string; motivo: string; devolvioDinero?: boolean }): Promise<void> {
  const motivo = datos.motivo;
  const [cp] = await tx.select().from(compra).where(eq(compra.id, datos.compraId));
  if (!cp) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la compra.");
  await proveedorBloqueado(tx, cp.proveedorId);
  if (cp.estado === "ANULADA") return;
  if (cp.jornadaId) {
    const [j] = await tx.select({ estado: jornada.estado }).from(jornada).where(eq(jornada.id, cp.jornadaId));
    if (j?.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "La jornada ya está cerrada.");
  }
  const visible = numeroCompra(cp.numero);
  await tx.update(compra).set({ estado: "ANULADA", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(eq(compra.id, cp.id));

  const [cargo] = await tx
    .select({ id: movimientoCuentaProveedor.id })
    .from(movimientoCuentaProveedor)
    .where(and(eq(movimientoCuentaProveedor.compraId, cp.id), eq(movimientoCuentaProveedor.tipo, "CARGO_COMPRA")));
  if (cargo) {
    await registrarMovimiento(tx, c, {
      proveedorId: cp.proveedorId,
      tipo: "ANULACION_COMPRA",
      importe: aNumeric(dec(cp.total).neg(), 2),
      descripcion: `Anulación de la compra ${visible}`,
      compraId: cp.id,
      movimientoCompensadoId: cargo.id,
      motivo,
    });
  }

  // Lo pagado a esta compra queda libre (06 §6.1). Si el proveedor devolvió la plata, el pago
  // hecho en el momento también se anula; si no, queda a favor y se aplica a otras deudas.
  await desactivarImputaciones(tx, c, { compraId: cp.id }, `Anulación de ${visible}`);
  if (datos.devolvioDinero) {
    const pagos = await tx
      .select()
      .from(pagoProveedor)
      .where(and(eq(pagoProveedor.compraId, cp.id), eq(pagoProveedor.origen, "EN_COMPRA"), eq(pagoProveedor.estado, "REGISTRADO")));
    for (const p of pagos) await anularPagoEnTransaccion(tx, c, p, `El proveedor devolvió la plata (anulación de ${visible})`);
  }
  await aplicarSaldoAFavor(tx, c, cp.proveedorId);

  await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "compra", entidadId: cp.id, resumen: `Anulación de ${visible}.`, motivo });
  await registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "COMPRA", entidadId: cp.id, jornadaId: cp.jornadaId, resumen: `anuló la compra ${visible} (${motivo})` });
  if (cp.jornadaId) await actualizarComprado(tx, c.empresaId, cp.jornadaId);
  const productos = await tx.selectDistinct({ id: compraItem.productoId }).from(compraItem).where(eq(compraItem.compraId, cp.id));
  await recalcularPedidosPendientes(tx, { productoIds: productos.map((p) => p.id) });
}

export interface CompraListada {
  id: string;
  numero: string;
  fecha: Date;
  proveedorId: string;
  proveedor: string;
  condicion: CondicionPago;
  estado: "REGISTRADA" | "ANULADA";
  /** Solo con `precios.ver_costos`. */
  total: string | null;
  /** Solo con `pagos.ver`. */
  pagado: string | null;
  estadoPago: EstadoPagoCompra | null;
  excedeLimite: boolean;
}

export async function listarCompras(db: BaseDatos, authUserId: string, filtros: { fecha?: FechaISO; proveedorId?: string }): Promise<CompraListada[]> {
  return ejecutarComoUsuario(db, authUserId, "compras.ver", async (tx, c) => {
    const filas = await tx
      .select({
        id: compra.id,
        numero: compra.numero,
        fecha: compra.fechaCompra,
        proveedorId: compra.proveedorId,
        proveedor: proveedor.nombre,
        condicion: compra.condicionPago,
        estado: compra.estado,
        total: compra.total,
        pagado: pagadoDeCompra(),
        excede: compra.excedeLimite,
      })
      .from(compra)
      .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
      .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
      .where(and(filtros.fecha ? eq(jornada.fecha, filtros.fecha) : undefined, filtros.proveedorId ? eq(compra.proveedorId, filtros.proveedorId) : undefined))
      .orderBy(desc(compra.fechaCompra), desc(compra.numero))
      .limit(200);
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const verPagos = c.permisos.tiene("pagos.ver");
    return filas.map((f) => ({
      id: f.id,
      numero: numeroCompra(f.numero),
      fecha: f.fecha,
      proveedorId: f.proveedorId,
      proveedor: f.proveedor,
      condicion: f.condicion,
      estado: f.estado,
      total: verCostos ? f.total : null,
      pagado: verPagos ? dec(f.pagado).toFixed(2) : null,
      estadoPago: verPagos && f.estado === "REGISTRADA" ? estadoPagoCompra(f.total, f.pagado) : null,
      excedeLimite: f.excede,
    }));
  });
}

export interface DetalleCompra extends CompraListada {
  fechaJornada: FechaISO | null;
  fechaVencimiento: FechaISO | null;
  montoPagadoEnElActo: string | null;
  medioPago: MedioPago | null;
  numeroComprobante: string | null;
  observaciones: string | null;
  motivoExceso: string | null;
  motivoAnulacion: string | null;
  items: { id: string; producto: string; unidadBase: string; presentacion: string; cantidad: string; cantidadBase: string; precio: string | null; subtotal: string | null; sinPedido: boolean }[];
  /** Qué pagos o créditos cancelan esta compra (solo con `pagos.ver`). */
  imputaciones: { pagoId: string | null; descripcion: string; monto: string }[];
}

export async function obtenerCompra(db: BaseDatos, authUserId: string, compraId: string): Promise<DetalleCompra> {
  return ejecutarComoUsuario(db, authUserId, "compras.ver", async (tx, c) => {
    const [f] = await tx
      .select({ compra, proveedor: proveedor.nombre, fechaJornada: jornada.fecha, pagado: pagadoDeCompra() })
      .from(compra)
      .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
      .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
      .where(eq(compra.id, compraId));
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la compra.");
    const items = await tx
      .select({ item: compraItem, producto: producto.nombre, unidadBase: producto.unidadBase, presentacion: presentacion.nombre })
      .from(compraItem)
      .innerJoin(producto, eq(producto.id, compraItem.productoId))
      .innerJoin(presentacion, eq(presentacion.id, compraItem.presentacionId))
      .where(eq(compraItem.compraId, compraId))
      .orderBy(asc(compraItem.linea));
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const verPagos = c.permisos.tiene("pagos.ver");
    const cp = f.compra;
    const imputaciones = verPagos
      ? await tx
          .select({ pagoId: imputacionPagoProveedor.pagoProveedorId, monto: imputacionPagoProveedor.monto, numeroPago: pagoProveedor.numero, credito: movimientoCuentaProveedor.descripcion })
          .from(imputacionPagoProveedor)
          .leftJoin(pagoProveedor, eq(pagoProveedor.id, imputacionPagoProveedor.pagoProveedorId))
          .leftJoin(movimientoCuentaProveedor, eq(movimientoCuentaProveedor.id, imputacionPagoProveedor.movimientoAcreedorId))
          .where(and(eq(imputacionPagoProveedor.compraId, cp.id), eq(imputacionPagoProveedor.activa, true)))
          .orderBy(asc(imputacionPagoProveedor.creadoEn))
      : [];
    return {
      id: cp.id,
      numero: numeroCompra(cp.numero),
      fecha: cp.fechaCompra,
      proveedorId: cp.proveedorId,
      proveedor: f.proveedor,
      condicion: cp.condicionPago,
      estado: cp.estado,
      total: verCostos ? cp.total : null,
      pagado: verPagos ? dec(f.pagado).toFixed(2) : null,
      estadoPago: verPagos && cp.estado === "REGISTRADA" ? estadoPagoCompra(cp.total, f.pagado) : null,
      excedeLimite: cp.excedeLimite,
      fechaJornada: f.fechaJornada,
      fechaVencimiento: cp.fechaVencimiento,
      montoPagadoEnElActo: verPagos ? cp.montoPagadoEnElActo : null,
      medioPago: cp.medioPagoEnElActo,
      numeroComprobante: cp.numeroComprobanteProveedor,
      observaciones: cp.observaciones,
      motivoExceso: cp.motivoExcesoLimite,
      motivoAnulacion: cp.motivoAnulacion,
      items: items.map((i) => ({
        id: i.item.id,
        producto: i.producto,
        unidadBase: i.unidadBase,
        presentacion: i.presentacion,
        cantidad: i.item.cantidad,
        cantidadBase: i.item.cantidadBase,
        precio: verCostos ? i.item.precioUnitario : null,
        subtotal: verCostos ? i.item.subtotal : null,
        sinPedido: i.item.sinPedido,
      })),
      imputaciones: imputaciones.map((i) => ({
        pagoId: i.pagoId,
        descripcion: i.numeroPago !== null ? `Pago ${numeroPago(i.numeroPago)}` : (i.credito ?? "Ajuste"),
        monto: i.monto,
      })),
    };
  });
}

const esquemaSaldoInicial = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  monto: numeroObligatorio("Escribí cuánto se le debe.").refine((v) => dec(v).gt(0), { message: "La deuda tiene que ser mayor que 0." }),
  /** Fecha de la boleta: ordena la deuda para los pagos (FIFO). */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha de la deuda."),
  vencimiento: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  referencia: textoOpcional(120),
});

/**
 * Deuda anterior al uso del sistema (03 §10.1, P-63): una compra SALDO_INICIAL sin productos ni
 * jornada, con su movimiento en la cuenta. Se puede cargar una por boleta pendiente.
 */
export async function registrarSaldoInicial(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaSaldoInicial>): Promise<string> {
  const d = validar(esquemaSaldoInicial, datos);
  return ejecutarComoUsuario(db, authUserId, "pagos.ajustar", async (tx, c) => {
    const prov = await proveedorBloqueado(tx, d.proveedorId);
    const { numero, visible } = await siguienteNumero(tx, "COMPRA");
    const [nueva] = await tx
      .insert(compra)
      .values({
        empresaId: c.empresaId,
        numero,
        tipo: "SALDO_INICIAL",
        proveedorId: prov.id,
        fechaCompra: new Date(`${d.fecha}T12:00:00Z`),
        condicionPago: "CREDITO",
        total: aNumeric(d.monto, 2),
        fechaVencimiento: d.vencimiento,
        observaciones: d.referencia,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: compra.id });
    await registrarMovimiento(tx, c, {
      proveedorId: prov.id,
      tipo: "SALDO_INICIAL",
      importe: aNumeric(d.monto, 2),
      descripcion: `Deuda anterior al sistema (${visible})${d.referencia ? `: ${d.referencia}` : ""}`,
      compraId: nueva!.id,
      fechaVencimiento: d.vencimiento,
      fechaOrigen: d.fecha,
    });
    await aplicarSaldoAFavor(tx, c, prov.id);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CREAR",
      entidad: "compra",
      entidadId: nueva!.id,
      resumen: `Deuda anterior con ${prov.nombre}: ${formatearMoneda(d.monto)}.`,
    });
    return nueva!.id;
  });
}
