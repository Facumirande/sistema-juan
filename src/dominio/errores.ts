/** Códigos de error de negocio (01 §10.2, 08 §7). La interfaz los traduce a mensajes. */
export type CodigoError =
  | "NO_AUTENTICADO"
  | "SIN_PERMISO"
  | "NO_ENCONTRADO"
  | "VALIDACION"
  | "TRANSICION_INVALIDA"
  | "JORNADA_CERRADA"
  | "LIMITE_CREDITO_EXCEDIDO"
  | "PRECIO_SIN_COSTO"
  | "DOCUMENTO_EMITIDO"
  | "SIN_DOCUMENTOS"
  | "CONFLICTO_VERSION";

export class ErrorDeNegocio extends Error {
  readonly codigo: CodigoError;
  readonly detalle?: Readonly<Record<string, unknown>>;

  constructor(codigo: CodigoError, mensaje: string, detalle?: Record<string, unknown>) {
    super(mensaje);
    this.name = "ErrorDeNegocio";
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export function esErrorDeNegocio(error: unknown, codigo?: CodigoError): error is ErrorDeNegocio {
  return error instanceof ErrorDeNegocio && (codigo === undefined || error.codigo === codigo);
}

/** Referencias internas del plan que no le sirven a quien usa el sistema: "(RN-018)", "(RN-063, RN-064)", "(04 §5.b.4)". */
const REFERENCIAS_INTERNAS = /\s*\((?:\s*(?:ver\s+)?(?:RN-\d+[a-z]?|\d{2}\s*§\s*[\d.]+[a-z]?(?:\.\d+)*)\s*(?:,|\by\b)?)+\)/giu;

/**
 * El mensaje como lo lee la persona: sin los códigos de reglas ni las referencias al plan, que
 * quedan para el código y las pruebas.
 */
export function textoParaPersona(mensaje: string): string {
  return mensaje
    .replace(REFERENCIAS_INTERNAS, "")
    .replace(/\s+([.,:;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
