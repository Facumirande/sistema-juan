import { eq } from "drizzle-orm";
import { z } from "zod";

import { ErrorDeNegocio } from "@/dominio/errores";
import { empresa, usuario } from "@/db/esquema";
import { cambiarRol, enEmpresa, fijarUsuarioAuth } from "@/db/transaccion";
import type { BaseDatos } from "@/db/tipos";
import { esCuentaExistente, type ServicioCuentas } from "@/modulos/seguridad/cuentas";
import { validar } from "@/modulos/validacion";
import { interpretarIdentificador, LARGO_MINIMO_CLAVE, MENSAJE_IDENTIFICADOR_INVALIDO, type Identificador } from "@/seguridad/identificacion";

import { darDeAltaEmpresa, type ResultadoAltaEmpresa } from "./alta-empresa";

/**
 * Id fijo de la empresa del negocio. La configuración inicial solo puede crearla una vez:
 * la clave primaria lo garantiza aunque dos personas lo intenten al mismo tiempo.
 */
export const EMPRESA_PRINCIPAL_ID = "00000000-0000-4000-8000-000000000001";

const NOMBRE_POR_DEFECTO = "Sistema Repartos";

const YA_CONFIGURADO = "El sistema ya está listo. Entrá con tu usuario y contraseña.";

const esquemaPersona = (quien: string) =>
  z.object({
    nombre: z.string().trim().min(2, `Escribí el nombre ${quien}.`).max(120),
    identificador: z.string(),
    clave: z.string().min(LARGO_MINIMO_CLAVE, `La contraseña ${quien} tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`).max(72),
  });

const esquemaConfiguracionInicial = z.object({
  /** Opcional: aparece en los documentos impresos; se puede cambiar después. */
  negocio: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length >= 2 ? v : NOMBRE_POR_DEFECTO)),
  personas: z
    .array(z.object({ nombre: z.string(), identificador: z.string(), clave: z.string() }))
    .min(1)
    .max(2)
    .transform((ps) => ps.filter((p, i) => i === 0 || p.nombre.trim() || p.identificador.trim() || p.clave)),
});

export type DatosConfiguracionInicial = z.input<typeof esquemaConfiguracionInicial>;

/** True mientras no exista la empresa principal: la pantalla de primer uso solo se ofrece en ese caso. */
export async function configuracionInicialPendiente(db: BaseDatos): Promise<boolean> {
  const filas = await enEmpresa(db, EMPRESA_PRINCIPAL_ID, (tx) => tx.select({ id: empresa.id }).from(empresa), "app_alta");
  return filas.length === 0;
}

/** La cuenta de Auth ya es de alguien en el sistema (política `usuario_propio`). */
async function cuentaEnUso(db: BaseDatos, authUserId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await cambiarRol(tx, "app_negocio");
    await fijarUsuarioAuth(tx, authUserId);
    const filas = await tx.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, authUserId));
    return filas.length > 0;
  });
}

/** Crea la cuenta; si ya existía (hecha a mano en Supabase) y no es de nadie, la usa con la contraseña nueva. */
async function obtenerCuenta(db: BaseDatos, cuentas: ServicioCuentas, email: string, clave: string): Promise<{ authUserId: string; nueva: boolean }> {
  try {
    return { authUserId: await cuentas.crear(email, clave), nueva: true };
  } catch (error) {
    if (!esCuentaExistente(error)) throw error;
    const existente = await cuentas.buscarPorCorreo(email);
    if (!existente || (await cuentaEnUso(db, existente))) throw error;
    await cuentas.cambiarClave(existente, clave);
    return { authUserId: existente, nueva: false };
  }
}

/**
 * Primer uso del sistema, sin pasos a mano en Supabase: crea las cuentas de las personas que
 * lo usan (una o dos, las dos administradoras), la empresa principal con sus valores por
 * defecto y los usuarios, todo o nada.
 */
export async function realizarConfiguracionInicial(
  db: BaseDatos,
  cuentas: ServicioCuentas,
  datos: DatosConfiguracionInicial,
): Promise<ResultadoAltaEmpresa & { email: string }> {
  const d = validar(esquemaConfiguracionInicial, datos);
  const personas = d.personas.map((p, i) => {
    const valida = validar(esquemaPersona(i === 0 ? "tuyo" : "de la otra persona"), p);
    const identificador = interpretarIdentificador(valida.identificador);
    if (!identificador) throw new ErrorDeNegocio("VALIDACION", MENSAJE_IDENTIFICADOR_INVALIDO);
    return { ...valida, identificador };
  });
  if (personas.length === 2 && personas[0]!.identificador.email === personas[1]!.identificador.email) {
    throw new ErrorDeNegocio("VALIDACION", "Las dos personas tienen el mismo usuario: elegí uno distinto para cada una.");
  }
  if (!(await configuracionInicialPendiente(db))) throw new ErrorDeNegocio("VALIDACION", YA_CONFIGURADO);

  const creadas: string[] = [];
  try {
    const conCuenta: { nombre: string; identificador: Identificador; authUserId: string }[] = [];
    for (const p of personas) {
      const cuenta = await obtenerCuenta(db, cuentas, p.identificador.email, p.clave);
      if (cuenta.nueva) creadas.push(cuenta.authUserId);
      conCuenta.push({ ...p, authUserId: cuenta.authUserId });
    }
    const [primera, ...otras] = conCuenta.map((p) => ({
      authUserId: p.authUserId,
      nombre: p.nombre,
      email: p.identificador.email,
      nombreUsuario: p.identificador.nombreUsuario,
    }));
    const resultado = await darDeAltaEmpresa(db, {
      empresaId: EMPRESA_PRINCIPAL_ID,
      nombre: d.negocio,
      administrador: primera!,
      otrosAdministradores: otras,
    });
    return { ...resultado, email: primera!.email };
  } catch (error) {
    for (const id of creadas) await cuentas.eliminar(id).catch(() => undefined);
    if (!(await configuracionInicialPendiente(db))) throw new ErrorDeNegocio("VALIDACION", YA_CONFIGURADO);
    throw error;
  }
}
