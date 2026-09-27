import { ErrorDeNegocio, esErrorDeNegocio } from "@/dominio/errores";

/**
 * Cuentas de Supabase Auth: quién puede ingresar y con qué contraseña. Las crea y administra
 * el servidor (nunca el navegador) con la clave secreta de Supabase; los casos de uso reciben
 * esta interfaz para poder probarse sin Supabase.
 */
export interface ServicioCuentas {
  /** Crea una cuenta ya confirmada y devuelve su id. Lanza `cuentaExistente()` si el correo ya está registrado. */
  crear(email: string, clave: string): Promise<string>;
  buscarPorCorreo(email: string): Promise<string | null>;
  cambiarClave(authUserId: string, clave: string): Promise<void>;
  /** Bloquea o devuelve el acceso (desactivar / reactivar, 02 §10.3 reglas 4 y 5). */
  bloquear(authUserId: string, bloqueada: boolean): Promise<void>;
  eliminar(authUserId: string): Promise<void>;
}

const CUENTA_EXISTENTE = "CUENTA_EXISTENTE";

export function cuentaExistente(): ErrorDeNegocio {
  return new ErrorDeNegocio("VALIDACION", "Ya existe una cuenta con ese usuario o correo.", { motivo: CUENTA_EXISTENTE });
}

export function esCuentaExistente(error: unknown): boolean {
  return esErrorDeNegocio(error, "VALIDACION") && error.detalle?.motivo === CUENTA_EXISTENTE;
}
