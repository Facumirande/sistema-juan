import { and, asc, eq, ne } from "drizzle-orm";

import { cliente, jornada, pedido, pedidoItem, presentacion, producto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { ABREVIATURA_UNIDAD, type UnidadMedida } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { formatearFecha, type FechaISO } from "@/dominio/fechas/fechas";
import type { LineaElegida } from "@/dominio/pedidos/carga";
import { COLUMNAS_DE_PEDIDOS, filasDePedidos, interpretarPedidos, type PedidoDePlanilla, type ProblemaDePlanilla } from "@/dominio/pedidos/planilla";
import { PlanillaIlegible, leerPlanilla } from "@/lib/planilla-lectura";
import type { Hoja } from "@/lib/planilla";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { datosParaCargarPedido } from "./carga";
import { cargarPedidos, numeroPedido, type PedidoCargado } from "./pedidos";

// Pedidos en Excel (06/10/2026): bajar los pedidos de un día a una planilla, y cargar pedidos
// desde una planilla con las mismas columnas (primero se revisa, después se carga todo junto).

const ESTADO_EN_PALABRAS: Readonly<Record<string, string>> = {
  BORRADOR: "En Pedidos",
  CONFIRMADO: "En Pedidos",
  EN_COMPRA: "En la lista de compras",
  EN_PREPARACION: "Preparando",
  PREPARADO: "Preparado",
  EN_REPARTO: "En camino",
  ENTREGADO: "Entregado",
};

/** La planilla de los pedidos de un día: una fila por producto, con las columnas que después se pueden volver a subir. */
export async function hojaDePedidos(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<Hoja> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx) => {
    const filas = await tx
      .select({
        numero: pedido.numero,
        estado: pedido.estado,
        cliente: cliente.nombre,
        codigo: producto.codigo,
        producto: producto.nombre,
        unidad: producto.unidadBase,
        cantidad: pedidoItem.cantidad,
        cantidadBase: pedidoItem.cantidadBase,
        presentacion: presentacion.nombre,
        esUnidadBase: presentacion.esUnidadBase,
        nota: pedidoItem.observaciones,
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(producto, eq(producto.id, pedidoItem.productoId))
      .leftJoin(presentacion, eq(presentacion.id, pedidoItem.presentacionId))
      .where(and(eq(jornada.fecha, fecha), ne(pedido.estado, "CANCELADO"), eq(pedidoItem.cancelado, false)))
      .orderBy(asc(cliente.nombre), asc(pedido.numero), asc(pedidoItem.linea));
    return {
      nombre: "Pedidos",
      columnas: [...COLUMNAS_DE_PEDIDOS, "Pedido", "Estado"],
      filas: filas.map((f) => {
        const porEnvase = f.presentacion !== null && !f.esUnidadBase;
        return [
          formatearFecha(fecha),
          f.cliente,
          f.codigo,
          f.producto,
          { numero: dec(porEnvase ? f.cantidad : f.cantidadBase).toString() },
          porEnvase ? f.presentacion : ABREVIATURA_UNIDAD[f.unidad as UnidadMedida],
          f.nota,
          numeroPedido(f.numero),
          ESTADO_EN_PALABRAS[f.estado] ?? f.estado,
        ];
      }),
    };
  });
}

/**
 * La planilla modelo para cargar pedidos: la hoja "Pedidos" con los títulos y, para copiar sin
 * equivocarse, los clientes y los productos con su código y en qué se piden.
 */
export async function planillaModelo(db: BaseDatos, authUserId: string): Promise<Hoja[]> {
  const datos = await datosParaCargarPedido(db, authUserId);
  return [
    { nombre: "Pedidos", columnas: [...COLUMNAS_DE_PEDIDOS], filas: [] },
    {
      nombre: "Cómo llenarla",
      columnas: ["Columna", "Qué va"],
      filas: [
        ["Fecha de entrega", "El día en que se entrega, como 07/10/2026. Vacía = el día que elijas al subir la planilla."],
        ["Cliente", "El nombre igual que en la hoja “Clientes”. Si lo dejás vacío vale el de la fila de arriba."],
        ["Código", "El código del producto (hoja “Productos”). Si no lo sabés, dejalo vacío y escribí el nombre en “Producto”."],
        ["Producto", "El nombre del producto. Con el código puesto, es solo para leerlo mejor."],
        ["Cantidad", "Cuánto lleva: 2 o 2,5."],
        ["Unidad o envase", "Vacía = por kilo, unidad, atado… (como se vende). O el nombre de un envase del producto, como “Cajón 18 kg”."],
        ["Nota", "Opcional: una aclaración para ese producto."],
        ["", "Una fila por producto. Las filas del mismo cliente y día forman un solo pedido. Los títulos van en la primera fila de la hoja “Pedidos”."],
      ],
    },
    {
      nombre: "Productos",
      columnas: ["Código", "Producto", "Se pide por", "Envases"],
      filas: datos.productos.map((p) => [p.codigo, p.nombre, ABREVIATURA_UNIDAD[p.unidadBase], p.presentaciones.filter((x) => !x.esUnidadBase).map((x) => x.nombre).join(" · ") || null]),
    },
    { nombre: "Clientes", columnas: ["Cliente", "Dirección"], filas: datos.clientes.map((c) => [c.nombre, c.direccion]) },
  ];
}

export interface RevisionDePlanilla {
  /** Los pedidos que se cargarían (vacío si hay problemas en alguno). */
  pedidos: PedidoDePlanilla[];
  problemas: ProblemaDePlanilla[];
  /** Cosas para mirar que no frenan la carga (un cliente que ya tiene pedido ese día). */
  avisos: string[];
  /** El día que valió para las filas sin fecha. */
  fechaPorDefecto: FechaISO;
}

/** Lee la planilla y dice qué pedidos saldrían de ella y qué hay que corregir, sin cargar nada. */
export async function revisarPlanillaDePedidos(db: BaseDatos, authUserId: string, datos: { bytes: Uint8Array; fecha?: string | null }): Promise<RevisionDePlanilla> {
  let planilla: string[][];
  try {
    planilla = leerPlanilla(datos.bytes);
  } catch (error) {
    if (error instanceof PlanillaIlegible) throw new ErrorDeNegocio("VALIDACION", error.message);
    throw error;
  }
  const catalogo = await datosParaCargarPedido(db, authUserId);
  const fechaPorDefecto = datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) && datos.fecha >= catalogo.hoy ? datos.fecha : catalogo.sugerida;
  const { filas, problema } = filasDePedidos(planilla);
  if (problema) return { pedidos: [], problemas: [{ fila: 0, mensaje: problema }], avisos: [], fechaPorDefecto };
  const { pedidos, problemas } = interpretarPedidos(filas, {
    hoy: catalogo.hoy,
    fechaPorDefecto,
    cerrados: catalogo.cerrados,
    clientes: catalogo.clientes.map((c) => ({ id: c.id, nombre: c.nombre, conLugar: c.puntos.length > 0 })),
    productos: catalogo.productos,
  });
  const avisos = pedidos.flatMap((p) => {
    const abiertos = catalogo.clientes.find((c) => c.id === p.clienteId)?.abiertos.filter((a) => a.fecha === p.fecha) ?? [];
    return abiertos.length ? [`${p.cliente} ya tiene ${abiertos.length === 1 ? `el pedido ${abiertos[0]!.numero}` : `${abiertos.length} pedidos`} para el ${formatearFecha(p.fecha)}: si cargás este, va a tener uno más.`] : [];
  });
  return { pedidos: problemas.length ? [] : pedidos, problemas, avisos, fechaPorDefecto };
}

/** Carga los pedidos revisados, todos juntos: quedan en la columna Pedidos del tablero. */
export async function importarPedidos(
  db: BaseDatos,
  authUserId: string,
  pedidos: readonly { fecha: FechaISO; clienteId: string; lineas: readonly LineaElegida[] }[],
): Promise<PedidoCargado[]> {
  return cargarPedidos(
    db,
    authUserId,
    pedidos.map((p) => ({
      fecha: p.fecha,
      clienteId: p.clienteId,
      puntoEntregaId: null,
      // La cantidad viaja con coma: escrita con punto, "1.125" se leería como mil ciento veinticinco.
      lineas: p.lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad.replace(".", ","), observaciones: l.observaciones })),
      prioridad: "NORMAL" as const,
      entregaDesde: "",
      entregaHasta: "",
      observaciones: "",
      confirmar: true,
    })),
  );
}
