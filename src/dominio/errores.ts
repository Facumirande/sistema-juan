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
