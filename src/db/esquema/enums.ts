import { pgEnum } from "drizzle-orm/pg-core";

// 03-modelo-de-datos.md §3. Se agregan acá a medida que las tablas de cada iteración los usan.

export const estrategiaCosto = pgEnum("estrategia_costo", ["PREFERIDO", "MINIMO", "ULTIMO_COSTO_REAL"]);

export const modoRedondeo = pgEnum("modo_redondeo", ["NINGUNO", "CERCANO", "ARRIBA", "ABAJO"]);

export const politicaFaltantes = pgEnum("politica_faltantes", ["PRIORIDAD_CLIENTE", "PROPORCIONAL", "MANUAL"]);

export const modoImputacion = pgEnum("modo_imputacion", ["FIFO", "MANUAL"]);

export const tipoSecuencia = pgEnum("tipo_secuencia", [
  "PEDIDO",
  "LISTA_COMPRA",
  "COMPRA",
  "PAGO_PROVEEDOR",
  "REPARTO",
  "ENTREGA",
  "FACTURA",
  "COBRO_CLIENTE",
  "AJUSTE_STOCK",
]);

export const accionAuditoria = pgEnum("accion_auditoria", [
  "CREAR",
  "MODIFICAR",
  "CAMBIO_ESTADO",
  "CANCELAR",
  "ANULAR",
  "CAMBIO_PRECIO_COMPRA",
  "CAMBIO_RECARGO",
  "CAMBIO_REGLA_PRECIO",
  "OVERRIDE_PRECIO",
  "EXCESO_LIMITE",
  "CAMBIO_LIMITE_CREDITO",
  "CORRECCION_ENTREGA",
  "EMISION_DOCUMENTO",
  "REAPERTURA_JORNADA",
  "CAMBIO_CONFIGURACION",
  "CAMBIO_PERMISOS",
  "INICIO_SESION",
  "EXPORTACION",
]);

/** Acciones de auditoría que exigen motivo (03 §4.6). */
export const ACCIONES_CON_MOTIVO = [
  "ANULAR",
  "CANCELAR",
  "OVERRIDE_PRECIO",
  "EXCESO_LIMITE",
  "CORRECCION_ENTREGA",
  "REAPERTURA_JORNADA",
] as const;

// 03 §3.4 y §3.5 — catálogo, clientes y compras.

export const unidadMedida = pgEnum("unidad_medida", ["KG", "UNIDAD", "ATADO", "MAPLE", "BANDEJA", "DOCENA", "PAQUETE", "LITRO"]);

export const grupoProducto = pgEnum("grupo_producto", ["FRUTA", "VERDURA", "OTRO"]);

export const tipoCliente = pgEnum("tipo_cliente", ["HOSPITAL", "RESTAURANTE", "COMERCIO", "INSTITUCION", "OTRO"]);

export const periodicidadFacturacion = pgEnum("periodicidad_facturacion", ["POR_ENTREGA", "SEMANAL", "QUINCENAL", "MENSUAL"]);

export const condicionPago = pgEnum("condicion_pago", ["CONTADO", "CREDITO", "MIXTA"]);

/** 03 §3.3 — cómo cambió un precio de compra. */
export const origenPrecioCompra = pgEnum("origen_precio_compra", ["MANUAL", "COMPRA", "IMPORTACION"]);

// 03 §3.1 y §3.3 — pedidos, jornada y precios de venta.

export const estadoJornada = pgEnum("estado_jornada", ["ABIERTA", "COMPRANDO", "PREPARANDO", "REPARTIENDO", "CERRADA"]);

export const estadoPedido = pgEnum("estado_pedido", [
  "BORRADOR",
  "CONFIRMADO",
  "EN_COMPRA",
  "EN_PREPARACION",
  "PREPARADO",
  "EN_REPARTO",
  "ENTREGADO",
  "CANCELADO",
]);

export const canalPedido = pgEnum("canal_pedido", ["TELEFONO", "WHATSAPP", "EMAIL", "PRESENCIAL", "PORTAL"]);

export const tipoReglaPrecio = pgEnum("tipo_regla_precio", ["RECARGO", "PRECIO_FIJO"]);

export const origenPrecioVenta = pgEnum("origen_precio_venta", [
  "PRECIO_FIJO_CLIENTE_PRODUCTO",
  "RECARGO_CLIENTE_PRODUCTO",
  "RECARGO_CLIENTE_CATEGORIA",
  "RECARGO_CLIENTE",
  "RECARGO_PRODUCTO",
  "RECARGO_CATEGORIA",
  "RECARGO_GLOBAL",
  "MANUAL",
]);

export const origenCosto = pgEnum("origen_costo", ["PREFERIDO", "MINIMO", "ULTIMO_COSTO_REAL", "REAL_JORNADA", "SIN_DATO"]);

// 03 §3.1, §3.2 y §3.5 — lista de compra, compras y cuenta corriente de proveedores.

export const estadoListaCompraItem = pgEnum("estado_lista_compra_item", ["PENDIENTE", "PARCIAL", "COMPRADO", "NO_CONSEGUIDO"]);

export const estadoCompra = pgEnum("estado_compra", ["REGISTRADA", "ANULADA"]);

export const tipoCompra = pgEnum("tipo_compra", ["MERCADERIA", "SALDO_INICIAL"]);

export const medioPago = pgEnum("medio_pago", ["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "OTRO"]);

export const origenPago = pgEnum("origen_pago", ["EN_COMPRA", "POSTERIOR"]);

export const estadoRegistro = pgEnum("estado_registro", ["REGISTRADO", "ANULADO"]);

/** + aumenta la deuda con el proveedor; − la disminuye (03 §3.5). */
export const tipoMovimientoProveedor = pgEnum("tipo_movimiento_proveedor", [
  "SALDO_INICIAL",
  "CARGO_COMPRA",
  "PAGO",
  "ANULACION_COMPRA",
  "ANULACION_PAGO",
  "AJUSTE_DEBITO",
  "AJUSTE_CREDITO",
]);

// 03 §3.4 y §3.6 — preparación, repartos, entregas y documentos.

export const estadoEntrega = pgEnum("estado_entrega", ["BORRADOR", "EN_PREPARACION", "PREPARADA", "EN_REPARTO", "ENTREGADA", "ANULADA"]);

export const estadoFacturacion = pgEnum("estado_facturacion", ["SIN_FACTURAR", "FACTURADA"]);

export const estadoReparto = pgEnum("estado_reparto", ["PLANIFICADO", "EN_CURSO", "FINALIZADO", "ANULADO"]);

export const motivoDiferencia = pgEnum("motivo_diferencia", ["RECHAZO_CALIDAD", "FALTANTE", "NO_CONSEGUIDO", "ERROR_PREPARACION", "CAMBIO_CLIENTE", "OTRO"]);

export const tipoDocumento = pgEnum("tipo_documento", ["DOC_01", "DOC_02", "DOC_03", "DOC_04", "DOC_05", "DOC_06", "DOC_07", "DOC_08"]);

export const eventoDocumento = pgEnum("evento_documento", ["EMISION", "REIMPRESION"]);

export const estadoDocumento = pgEnum("estado_documento", ["VIGENTE", "REEMPLAZADO", "ANULADO"]);
