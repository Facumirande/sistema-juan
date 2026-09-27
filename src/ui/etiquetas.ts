import type { Opcion } from "./formularios";

// Textos para mostrar los valores de las enumeraciones (03 §3).

export const UNIDADES: Readonly<Record<string, string>> = {
  KG: "Kilo (kg)",
  UNIDAD: "Unidad",
  ATADO: "Atado",
  MAPLE: "Maple",
  BANDEJA: "Bandeja",
  DOCENA: "Docena",
  PAQUETE: "Paquete",
  LITRO: "Litro",
};

/** Abreviatura para "$975/kg" o "18 kg". */
export const UNIDADES_CORTAS: Readonly<Record<string, string>> = {
  KG: "kg",
  UNIDAD: "u",
  ATADO: "atado",
  MAPLE: "maple",
  BANDEJA: "bandeja",
  DOCENA: "docena",
  PAQUETE: "paquete",
  LITRO: "l",
};

export const GRUPOS: Readonly<Record<string, string>> = { VERDURA: "Verdura", FRUTA: "Fruta", OTRO: "Otro" };

export const TIPOS_CLIENTE: Readonly<Record<string, string>> = {
  HOSPITAL: "Hospital",
  RESTAURANTE: "Restaurante",
  COMERCIO: "Comercio",
  INSTITUCION: "Institución",
  OTRO: "Otro",
};

export const PERIODICIDADES: Readonly<Record<string, string>> = {
  POR_ENTREGA: "Por entrega",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export const CONDICIONES_PAGO: Readonly<Record<string, string>> = { CREDITO: "A crédito (cuenta corriente)", CONTADO: "Contado", MIXTA: "Mixta" };

export const ORIGENES_PRECIO: Readonly<Record<string, string>> = { MANUAL: "Manual", COMPRA: "Compra", IMPORTACION: "Planilla" };

export const DIAS_SEMANA: readonly Opcion[] = [
  { valor: "1", etiqueta: "Lun" },
  { valor: "2", etiqueta: "Mar" },
  { valor: "3", etiqueta: "Mié" },
  { valor: "4", etiqueta: "Jue" },
  { valor: "5", etiqueta: "Vie" },
  { valor: "6", etiqueta: "Sáb" },
  { valor: "7", etiqueta: "Dom" },
];

export function opciones(etiquetas: Readonly<Record<string, string>>): Opcion[] {
  return Object.entries(etiquetas).map(([valor, etiqueta]) => ({ valor, etiqueta }));
}

/** "hoy", "ayer", "hace 11 días". */
export function haceDias(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

export const ESTADOS_PEDIDO: Readonly<Record<string, string>> = {
  BORRADOR: "Borrador",
  CONFIRMADO: "Confirmado",
  EN_COMPRA: "En compra",
  EN_PREPARACION: "En preparación",
  PREPARADO: "Preparado",
  EN_REPARTO: "En reparto",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

export const ESTADOS_JORNADA: Readonly<Record<string, string>> = {
  ABIERTA: "Abierta",
  COMPRANDO: "Comprando",
  PREPARANDO: "Preparando",
  REPARTIENDO: "Repartiendo",
  CERRADA: "Cerrada",
};

export const CANALES: Readonly<Record<string, string>> = { WHATSAPP: "WhatsApp", TELEFONO: "Teléfono", PRESENCIAL: "En persona", EMAIL: "Correo" };

/** De dónde salió el precio de venta (05 §5.2): siempre se muestra (RN-077). */
export const ORIGENES_VENTA: Readonly<Record<string, string>> = {
  PRECIO_FIJO_CLIENTE_PRODUCTO: "Precio pactado",
  RECARGO_CLIENTE_PRODUCTO: "Recargo del cliente para este producto",
  RECARGO_CLIENTE_CATEGORIA: "Recargo del cliente para la categoría",
  RECARGO_CLIENTE: "Recargo del cliente",
  RECARGO_PRODUCTO: "Recargo del producto",
  RECARGO_CATEGORIA: "Recargo de la categoría",
  RECARGO_GLOBAL: "Recargo general",
  MANUAL: "Precio a mano",
};

export const ORIGENES_COSTO: Readonly<Record<string, string>> = {
  PREFERIDO: "proveedor preferido",
  MINIMO: "proveedor más barato",
  ULTIMO_COSTO_REAL: "última compra",
  REAL_JORNADA: "compras del día",
  SIN_DATO: "sin costo",
};

export const ALERTAS_PRECIO: Readonly<Record<string, string>> = {
  SIN_PRECIO: "Sin precio: ningún proveedor tiene costo cargado",
  SIN_COSTO: "Sin costo: no se sabe el margen",
  MARGEN_NEGATIVO: "Se vende por debajo del costo",
  MARGEN_BAJO: "Margen bajo",
  COSTO_DESACTUALIZADO: "El costo es de un precio de compra viejo",
  PRECIO_FIJO_POR_VENCER: "El precio pactado vence pronto",
};

/** "jueves 24/09" */
export function fechaConDia(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const nombre = new Date(Date.UTC(anio!, mes! - 1, dia!)).toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" });
  return `${nombre} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

export const ESTADOS_PAGO: Readonly<Record<string, string>> = { PAGADA: "Pagada", PARCIAL: "Pagada en parte", PENDIENTE: "A pagar" };

/** Condición de pago de una compra. */
export const CONDICIONES_COMPRA: Readonly<Record<string, string>> = { CONTADO: "Contado", CREDITO: "A crédito", MIXTA: "Parte ahora y parte a crédito" };

export const MEDIOS_PAGO: Readonly<Record<string, string>> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", CHEQUE: "Cheque", TARJETA: "Tarjeta", OTRO: "Otro" };

export const ESTADOS_ENTREGA: Readonly<Record<string, string>> = {
  BORRADOR: "Sin empezar",
  EN_PREPARACION: "Preparando",
  PREPARADA: "Preparada",
  EN_REPARTO: "En camino",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

export const ESTADOS_REPARTO: Readonly<Record<string, string>> = { PLANIFICADO: "Sin salir", EN_CURSO: "En camino", FINALIZADO: "Terminado", ANULADO: "Anulado" };

/** Motivos de una diferencia al entregar (RN-126). */
export const MOTIVOS_DIFERENCIA: Readonly<Record<string, string>> = {
  RECHAZO_CALIDAD: "Rechazado por calidad",
  FALTANTE: "Faltó mercadería",
  NO_CONSEGUIDO: "No se consiguió",
  ERROR_PREPARACION: "Error al preparar",
  CAMBIO_CLIENTE: "El cliente canceló",
  OTRO: "Otro",
};

/** Motivos de un faltante al preparar. */
export const MOTIVOS_FALTANTE: Readonly<Record<string, string>> = {
  NO_CONSEGUIDO: "No se consiguió",
  FALTANTE: "Faltó mercadería",
  ERROR_PREPARACION: "Error al preparar",
  CAMBIO_CLIENTE: "El cliente canceló",
  OTRO: "Otro",
};
