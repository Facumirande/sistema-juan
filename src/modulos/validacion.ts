import { z } from "zod";

import { interpretarNumero } from "@/dominio/dinero/entrada";
import { ErrorDeNegocio } from "@/dominio/errores";

/** Valida los datos de una acción y traduce el primer problema a un error de negocio que la pantalla muestra tal cual. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new ErrorDeNegocio("VALIDACION", resultado.error.issues[0]?.message ?? "Revisá los datos.");
  }
  return resultado.data;
}

// Piezas de esquemas para los formularios: los campos vacíos llegan como "" y se guardan como null.

export const textoObligatorio = (mensaje: string, maximo = 200) => z.string(mensaje).trim().min(1, mensaje).max(maximo);

export const textoOpcional = (maximo = 500) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((v) => (v ? v : null));

/** Número escrito a la argentina ("17.550", "1.234,56"), como texto listo para una columna numeric. */
export const numeroOpcional = (mensaje: string) =>
  z
    .string()
    .nullish()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const n = interpretarNumero(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: mensaje });
        return z.NEVER;
      }
      return n.toString();
    });

export const numeroObligatorio = (mensaje: string) =>
  numeroOpcional(mensaje).refine((v): v is string => v !== null, { message: mensaje });

export const enteroOpcional = (mensaje: string, minimo = 0) =>
  numeroOpcional(mensaje).refine((v) => v === null || (Number.isInteger(Number(v)) && Number(v) >= minimo), { message: mensaje });

export const id = (mensaje = "Falta indicar qué registro.") => z.uuid(mensaje);
