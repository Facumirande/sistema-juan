/**
 * Catálogo de permisos (02-usuarios-roles-y-permisos.md §4).
 * Clase de datos (02 §7.1): O operativo, V precio de venta, C costo, M margen y reglas,
 * F financiero, P personal y seguridad.
 */
export type ClaseDatos = "O" | "V" | "C" | "M" | "F" | "P";

export interface DefinicionPermiso {
  descripcion: string;
  /** Clase principal: define si el permiso puede asignarse a PREPARADOR y REPARTIDOR (02 §6). */
  clase: ClaseDatos;
  /** Módulo PROPUESTO de una fase posterior. */
  propuesto?: true;
}

export const CATALOGO_PERMISOS = {
  // 4.1 Catálogo, clientes y proveedores
  "productos.ver": { clase: "O", descripcion: "Ver productos, categorías y presentaciones (sin precios)." },
  "productos.editar": { clase: "O", descripcion: "Crear, editar y desactivar productos, categorías y presentaciones." },
  "clientes.ver": { clase: "O", descripcion: "Ver clientes y puntos de entrega." },
  "clientes.editar": { clase: "O", descripcion: "Crear, editar y desactivar clientes y puntos de entrega (sin recargos)." },
  "proveedores.ver": { clase: "O", descripcion: "Ver proveedores, ubicación y productos que venden." },
  "proveedores.editar": { clase: "O", descripcion: "Crear, editar y desactivar proveedores y sus ofertas." },
  "proveedores.ver_credito": { clase: "F", descripcion: "Ver límite, crédito utilizado y disponible, semáforo y deuda vencida." },
  "proveedores.editar_limite": { clase: "F", descripcion: "Modificar límite de crédito y plazo de pago." },
  // 4.2 Precios
  "precios.ver_costos": { clase: "C", descripcion: "Ver precios de compra, costos, historial, comparador y DOC-06." },
  "precios.ver_venta": { clase: "V", descripcion: "Ver precios de venta, importes y el origen de la regla aplicada." },
  "precios.ver_margenes": { clase: "M", descripcion: "Ver recargos, reglas de precio, márgenes y alertas de margen." },
  "precios.editar_compra": { clase: "C", descripcion: "Actualizar precios de compra (en línea, rápida, masiva, importación)." },
  "precios.editar_reglas": { clase: "M", descripcion: "Crear y modificar recargos y reglas de precio por cliente." },
  "precios.override_linea": { clase: "V", descripcion: "Fijar a mano el precio de una línea, con motivo." },
  // 4.3 Pedidos, jornada y lista de compra
  "pedidos.ver": { clase: "O", descripcion: "Ver pedidos y su estado." },
  "pedidos.crear": { clase: "O", descripcion: "Crear pedidos y cargar líneas." },
  "pedidos.editar": { clase: "O", descripcion: "Modificar pedidos en BORRADOR o CONFIRMADO." },
  "pedidos.confirmar": { clase: "O", descripcion: "Pasar un pedido de BORRADOR a CONFIRMADO." },
  "pedidos.editar_en_curso": { clase: "O", descripcion: "Modificar pedidos EN_COMPRA o EN_PREPARACION; cargar pedidos en jornadas en curso." },
  "pedidos.cancelar": { clase: "O", descripcion: "Cancelar pedidos o líneas, con motivo." },
  "jornada.ver": { clase: "O", descripcion: "Ver jornadas y su estado." },
  "jornada.gestionar": { clase: "O", descripcion: "Iniciar la preparación y avanzar la jornada a mano." },
  "jornada.cerrar": { clase: "O", descripcion: "Cerrar la jornada con sus validaciones y resumen." },
  "jornada.reabrir": { clase: "O", descripcion: "Reabrir una jornada cerrada, con motivo." },
  "lista_compra.ver": { clase: "O", descripcion: "Ver la lista de compra (precios solo con precios.ver_costos)." },
  "lista_compra.generar": { clase: "O", descripcion: "Generar o regenerar la lista de compra." },
  "lista_compra.editar": { clase: "O", descripcion: "Ajustar cantidades, proveedor, comprador; marcar NO_CONSEGUIDO." },
  // 4.4 Compras y cuentas corrientes de proveedores
  "compras.ver": { clase: "C", descripcion: "Ver compras con importes y estado de pago." },
  "compras.registrar": { clase: "C", descripcion: "Registrar compras, incluido el pago en el momento." },
  "compras.anular": { clase: "C", descripcion: "Anular compras con motivo." },
  "compras.exceder_limite": { clase: "F", descripcion: "Confirmar una compra que supera el límite de crédito, con motivo." },
  "pagos.ver": { clase: "F", descripcion: "Ver la cuenta corriente de los proveedores." },
  "pagos.registrar": { clase: "F", descripcion: "Registrar pagos e imputarlos." },
  "pagos.anular": { clase: "F", descripcion: "Anular pagos y reimputar." },
  "pagos.ajustar": { clase: "F", descripcion: "Registrar ajustes de cuenta corriente y saldos iniciales." },
  // 4.5 Preparación, repartos y entregas
  "preparacion.ver": { clase: "O", descripcion: "Ver la hoja de preparación (sin precios)." },
  "preparacion.registrar": { clase: "O", descripcion: "Cargar cantidades preparadas, faltantes y sustituciones." },
  "preparacion.asignar_faltantes": { clase: "O", descripcion: "Decidir el reparto de un producto faltante entre clientes." },
  "repartos.ver": { clase: "O", descripcion: "Ver todos los repartos de una jornada." },
  "repartos.ver_propios": { clase: "O", descripcion: "Ver solo los repartos propios y marcar su salida y regreso." },
  "repartos.gestionar": { clase: "O", descripcion: "Crear hojas de ruta y asignar repartidor, vehículo y paradas." },
  "entregas.ver": { clase: "O", descripcion: "Ver entregas, cantidades y estado (datos operativos)." },
  "entregas.gestionar": { clase: "O", descripcion: "Armar entregas y pasarlas a EN_REPARTO." },
  "entregas.emitir_documentos": { clase: "O", descripcion: "Emitir y reemitir DOC-02 y DOC-03 de una entrega." },
  "entregas.confirmar": { clase: "O", descripcion: "Confirmar la entrega: receptor, firma o foto, diferencias." },
  "entregas.corregir": { clase: "O", descripcion: "Corregir una entrega con documentos emitidos (nueva versión)." },
  "entregas.anular": { clase: "O", descripcion: "Anular una entrega con motivo." },
  // 4.6 Documentos, facturación, cobranzas y stock
  "documentos.imprimir_compra": { clase: "O", descripcion: "Imprimir DOC-01 y DOC-06 (precios solo con precios.ver_costos)." },
  "documentos.imprimir_entrega": { clase: "O", descripcion: "Imprimir DOC-02, DOC-04 y DOC-07 (sin precios)." },
  "documentos.imprimir_contable": { clase: "V", descripcion: "Imprimir DOC-03 y DOC-08." },
  "documentos.imprimir_cuenta": { clase: "F", descripcion: "Imprimir DOC-05." },
  "documentos.anular": { clase: "O", descripcion: "Anular un documento emitido." },
  "facturacion.ver": { clase: "V", descripcion: "Ver ventas por entrega, entregas sin facturar y comprobantes." },
  "facturacion.emitir": { clase: "V", descripcion: "Emitir comprobantes internos." },
  "facturacion.anular": { clase: "V", descripcion: "Anular comprobantes con motivo." },
  "facturacion.exportar": { clase: "V", descripcion: "Exportar ventas y comprobantes para el contador." },
  "cobranzas.ver": { clase: "F", propuesto: true, descripcion: "Ver cuenta corriente de clientes y cobros." },
  "cobranzas.registrar": { clase: "F", propuesto: true, descripcion: "Registrar cobros e imputarlos." },
  "cobranzas.anular": { clase: "F", propuesto: true, descripcion: "Anular cobros con motivo." },
  "stock.ver": { clase: "O", propuesto: true, descripcion: "Ver sobrantes y mermas." },
  "stock.ajustar": { clase: "O", propuesto: true, descripcion: "Registrar sobrantes, mermas y devoluciones." },
  // 4.7 Reportes, configuración, usuarios y auditoría
  "reportes.ver": { clase: "V", descripcion: "Ver reportes (los importes dependen de los permisos de precios)." },
  "reportes.exportar": { clase: "V", descripcion: "Exportar reportes." },
  "configuracion.ver": { clase: "M", descripcion: "Ver la configuración de la empresa." },
  "configuracion.editar": { clase: "M", descripcion: "Modificar la configuración de la empresa." },
  "usuarios.administrar": { clase: "P", descripcion: "Invitar, desactivar y asignar roles; editar roles personalizados." },
  "auditoria.ver": { clase: "P", descripcion: "Consultar el registro de auditoría." },
} as const satisfies Record<string, DefinicionPermiso>;

export type Permiso = keyof typeof CATALOGO_PERMISOS;

export const PERMISOS = Object.keys(CATALOGO_PERMISOS) as Permiso[];

export function esPermiso(valor: string): valor is Permiso {
  return Object.hasOwn(CATALOGO_PERMISOS, valor);
}

export function clasePermiso(permiso: Permiso): ClaseDatos {
  return CATALOGO_PERMISOS[permiso].clase;
}
