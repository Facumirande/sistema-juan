"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { ErrorDeNegocio } from "@/dominio/errores";
import { MENSAJE_FALTA_CLAVE_SECRETA, obtenerServicioCuentas } from "@/lib/supabase/cuentas";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { responderPedidoDeAcceso } from "@/modulos/usuarios/acceso";
import { cambiarEstadoDeUsuario, restablecerClaveDeUsuario } from "@/modulos/usuarios/usuarios";
import { campo, resultadoDeAccion, type EstadoAccion } from "@/ui/estado-accion";

// Cada acción verifica la sesión y el permiso en el servidor (los casos de uso exigen usuarios.administrar).

async function preparar() {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) redirect("/login");
  const cuentas = obtenerServicioCuentas();
  if (!cuentas) throw new ErrorDeNegocio("VALIDACION", MENSAJE_FALTA_CLAVE_SECRETA);
  return { db: obtenerBaseDatos(), cuentas, authUserId };
}

export async function responderPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return resultadoDeAccion(async () => {
    const { db, cuentas, authUserId } = await preparar();
    const aprobar = campo(datos, "aprobar") === "true";
    await responderPedidoDeAcceso(db, cuentas, authUserId, { usuarioId: campo(datos, "usuarioId"), aprobar });
    revalidatePath("/usuarios");
    return { ok: true, mensaje: aprobar ? "Habilitado: ya puede entrar." : "Pedido rechazado." };
  });
}

export async function restablecerClaveAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return resultadoDeAccion(async () => {
    const { db, cuentas, authUserId } = await preparar();
    const { clave } = await restablecerClaveDeUsuario(db, cuentas, authUserId, { usuarioId: campo(datos, "usuarioId") });
    revalidatePath("/usuarios");
    return { ok: true, mensaje: "Pasale esta clave; al entrar va a elegir una contraseña nueva:", detalle: [`Clave provisoria: ${clave}`] };
  });
}

export async function cambiarEstadoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return resultadoDeAccion(async () => {
    const { db, cuentas, authUserId } = await preparar();
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoDeUsuario(db, cuentas, authUserId, { usuarioId: campo(datos, "usuarioId"), activo });
    revalidatePath("/usuarios");
    return { ok: true, mensaje: activo ? "Tiene acceso de nuevo." : "Listo: ya no puede entrar." };
  });
}
