import { ErrorDeNegocio } from "../errores";

/** Número visible de un documento: prefijo + número con ceros a la izquierda ("PED-000101"). */
export function formatearNumeroDocumento(prefijo: string, numero: number | bigint, relleno = 6): string {
  const n = BigInt(numero);
  if (n <= 0n) throw new ErrorDeNegocio("VALIDACION", "El número de documento debe ser positivo.");
  return `${prefijo}${n.toString().padStart(relleno, "0")}`;
}

/** Número visible con versión, para documentos versionados ("ENT-000301 v2"). */
export function formatearNumeroConVersion(numeroVisible: string, version: number): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new ErrorDeNegocio("VALIDACION", "La versión debe ser un entero mayor o igual a 1.");
  }
  return `${numeroVisible} v${version}`;
}
