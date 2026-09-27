"use server";

import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { ErrorDeNegocio } from "@/dominio/errores";
import { MENSAJE_FALTA_CLAVE_SECRETA, obtenerServicioCuentas } from "@/lib/supabase/cuentas";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { crearCuentaPropia } from "@/modulos/usuarios/acceso";
import { campo, resultadoDeAccion, type EstadoAccion } from "@/ui/estado-accion";

/** "Crear una cuenta": crea el usuario, deja el pedido de acceso y entra a la pantalla de espera. */
export async function crearCuenta(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const resultado = await resultadoDeAccion(async () => {
    const cuentas = obtenerServicioCuentas();
    if (!cuentas) throw new ErrorDeNegocio("VALIDACION", MENSAJE_FALTA_CLAVE_SECRETA);
    const clave = campo(datos, "clave");
    const { email } = await crearCuentaPropia(obtenerBaseDatos(), cuentas, {
      nombre: campo(datos, "nombre"),
      identificador: campo(datos, "identificador"),
      clave,
    });
    const supabase = await crearClienteSupabaseServidor();
    await supabase.auth.signInWithPassword({ email, password: clave });
    return { ok: true, mensaje: null };
  });
  if (resultado.ok) redirect("/acceso-pendiente");
  return resultado;
}
