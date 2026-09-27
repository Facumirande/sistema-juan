import { esErrorDeNegocio } from "@/dominio/errores";

/** Resultado de una acción de formulario que la pantalla muestra debajo del botón. */
export interface EstadoAccion {
  ok: boolean;
  mensaje: string | null;
  /** Líneas destacadas que se muestran una sola vez (ej. la contraseña inicial). */
  detalle?: string[];
  /** El servidor pide confirmar (ej. una variación brusca de precio, RN-070): el botón pasa a "Confirmar". */
  requiereConfirmacion?: boolean;
}

export const ESTADO_INICIAL: EstadoAccion = { ok: false, mensaje: null };

/**
 * Ejecuta una acción de servidor y convierte los errores de negocio en un mensaje para la
 * pantalla. Los demás errores (y las redirecciones de Next.js) siguen su curso.
 */
export async function resultadoDeAccion(fn: () => Promise<EstadoAccion>): Promise<EstadoAccion> {
  try {
    return await fn();
  } catch (error) {
    if (esErrorDeNegocio(error)) {
      return { ok: false, mensaje: error.message, requiereConfirmacion: error.detalle?.requiereConfirmacion === true };
    }
    throw error;
  }
}

/** Texto de un campo del formulario ("" si no vino). */
export function campo(datos: FormData, nombre: string): string {
  const valor = datos.get(nombre);
  return typeof valor === "string" ? valor : "";
}
