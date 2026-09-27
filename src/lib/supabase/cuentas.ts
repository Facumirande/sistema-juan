import "server-only";

import { AuthAdminApi, type AuthError } from "@supabase/supabase-js";

import { ErrorDeNegocio } from "@/dominio/errores";
import { cuentaExistente, type ServicioCuentas } from "@/modulos/seguridad/cuentas";

import { configuracionSupabase } from "./configuracion";

/** "Para siempre": Supabase Auth bloquea por duración, no tiene un bloqueo sin fecha. */
const BLOQUEO_INDEFINIDO = "876000h";

export const MENSAJE_FALTA_CLAVE_SECRETA =
  "Falta la clave secreta de Supabase (SUPABASE_SECRET_KEY en .env.local). Sin ella el sistema no puede crear ni administrar cuentas.";

function traducir(error: AuthError): Error {
  if (error.code === "email_exists" || error.code === "user_already_exists") return cuentaExistente();
  if (error.code === "weak_password") {
    return new ErrorDeNegocio("VALIDACION", "La contraseña es muy débil: usá una más larga o con letras y números.");
  }
  if (error.code === "email_address_invalid") return new ErrorDeNegocio("VALIDACION", "Supabase no acepta ese correo.");
  return new Error(`Supabase Auth: ${error.message}`, { cause: error });
}

/**
 * Cuentas administradas con la clave secreta de Supabase (solo en el servidor). Devuelve null
 * si la clave no está configurada: las pantallas lo explican en lugar de fallar.
 */
export function obtenerServicioCuentas(): ServicioCuentas | null {
  const configuracion = configuracionSupabase();
  const claveSecreta = process.env.SUPABASE_SECRET_KEY;
  if (!configuracion || !claveSecreta) return null;

  // Solo la API de administración de Auth: createClient también arma Realtime, que en Node 20 falla sin WebSocket.
  const admin = new AuthAdminApi({
    url: `${configuracion.url}/auth/v1`,
    headers: { apikey: claveSecreta, Authorization: `Bearer ${claveSecreta}` },
  });

  return {
    async crear(email, clave) {
      const { data, error } = await admin.createUser({ email, password: clave, email_confirm: true });
      if (error) throw traducir(error);
      return data.user.id;
    },

    async buscarPorCorreo(email) {
      const porPagina = 1000;
      for (let pagina = 1; ; pagina++) {
        const { data, error } = await admin.listUsers({ page: pagina, perPage: porPagina });
        if (error) throw traducir(error);
        const cuenta = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (cuenta) return cuenta.id;
        if (data.users.length < porPagina) return null;
      }
    },

    async cambiarClave(authUserId, clave) {
      const { error } = await admin.updateUserById(authUserId, { password: clave, email_confirm: true });
      if (error) throw traducir(error);
    },

    async bloquear(authUserId, bloqueada) {
      const { error } = await admin.updateUserById(authUserId, { ban_duration: bloqueada ? BLOQUEO_INDEFINIDO : "none" });
      if (error) throw traducir(error);
    },

    async eliminar(authUserId) {
      const { error } = await admin.deleteUser(authUserId);
      if (error) throw traducir(error);
    },
  };
}
