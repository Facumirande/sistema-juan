"use server";

import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { ErrorDeNegocio } from "@/dominio/errores";
import { MENSAJE_FALTA_CLAVE_SECRETA, obtenerServicioCuentas } from "@/lib/supabase/cuentas";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { realizarConfiguracionInicial } from "@/modulos/configuracion/configuracion-inicial";
import { campo, resultadoDeAccion, type EstadoAccion } from "@/ui/estado-accion";

export async function configurarSistema(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const resultado = await resultadoDeAccion(async () => {
    const cuentas = obtenerServicioCuentas();
    if (!cuentas) throw new ErrorDeNegocio("VALIDACION", MENSAJE_FALTA_CLAVE_SECRETA);
    const clave = campo(datos, "clave1");
    const { email } = await realizarConfiguracionInicial(obtenerBaseDatos(), cuentas, {
      negocio: campo(datos, "negocio"),
      personas: [{ nombre: campo(datos, "nombre1"), identificador: campo(datos, "usuario1"), clave }],
    });
    const supabase = await crearClienteSupabaseServidor();
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    return error
      ? { ok: true, mensaje: "Listo, ya está tu usuario. Ahora entrá con él." }
      : { ok: true, mensaje: null };
  });
  if (resultado.ok && !resultado.mensaje) redirect("/inicio");
  return resultado;
}
