import { z } from "zod";

/**
 * Dominio de los correos internos de las cuentas con nombre de usuario (02 §10.2). No existe
 * en internet: a estas direcciones nunca se envía nada.
 */
export const DOMINIO_CUENTAS_INTERNAS = "sistema-juan.interno";

export const LARGO_MINIMO_CLAVE = 8;

/** De 3 a 30 caracteres: letras minúsculas, números, punto, guion y guion bajo; empieza y termina con letra o número. */
const FORMATO_NOMBRE_USUARIO = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;

export type Identificador =
  | { tipo: "usuario"; nombreUsuario: string; email: string }
  | { tipo: "correo"; nombreUsuario: null; email: string };

/**
 * Interpreta lo que se escribe para ingresar o al crear una cuenta: un correo o un nombre de
 * usuario (personal sin correo, 02 §10.2), que se traduce a un correo interno. Devuelve
 * null si no es ninguno de los dos.
 */
export function interpretarIdentificador(texto: string): Identificador | null {
  const limpio = texto.trim().toLowerCase();
  if (!limpio.includes("@")) {
    if (!FORMATO_NOMBRE_USUARIO.test(limpio)) return null;
    return { tipo: "usuario", nombreUsuario: limpio, email: `${limpio}@${DOMINIO_CUENTAS_INTERNAS}` };
  }
  const [local = "", dominio] = limpio.split("@");
  if (dominio === DOMINIO_CUENTAS_INTERNAS) return interpretarIdentificador(local);
  return z.email().safeParse(limpio).success ? { tipo: "correo", nombreUsuario: null, email: limpio } : null;
}

export const MENSAJE_IDENTIFICADOR_INVALIDO =
  "Escribí un nombre de usuario (de 3 a 30 letras, números, punto o guion, sin espacios) o un correo válido.";

/** Lo que se muestra de una cuenta: el nombre de usuario si es interna, el correo si no. */
export function identificadorVisible(email: string): string {
  const sufijo = `@${DOMINIO_CUENTAS_INTERNAS}`;
  return email.endsWith(sufijo) ? email.slice(0, -sufijo.length) : email;
}
